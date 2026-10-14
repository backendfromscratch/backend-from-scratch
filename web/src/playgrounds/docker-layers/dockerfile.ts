/**
 * Reads a Dockerfile into the list of instructions the lab draws: what each one is, which stage it
 * belongs to, whether it adds a layer to the image and which files of the build context it takes.
 * Pure logic, no texts. Spec: docs/specs/2026-10-14-phase-7-design.md (§4).
 */

/** The instructions a Dockerfile can have. */
type Kind =
  | 'FROM'
  | 'WORKDIR'
  | 'COPY'
  | 'ADD'
  | 'RUN'
  | 'ENV'
  | 'ARG'
  | 'LABEL'
  | 'USER'
  | 'EXPOSE'
  | 'VOLUME'
  | 'HEALTHCHECK'
  | 'ENTRYPOINT'
  | 'CMD'
  | 'STOPSIGNAL'
  | 'SHELL'
  | 'ONBUILD';

/**
 * The files of the build context, in the groups the lab tells apart: a file of `src/`, the two npm
 * manifests, `.npmrc` (npm's settings, which `npm ci` reads too) and everything else
 * (tsconfig.json, scripts/, migrations…).
 */
export type FileGroup = 'src' | 'package.json' | 'package-lock.json' | '.npmrc' | 'other';

export const fileGroups: readonly FileGroup[] = [
  'src',
  'package.json',
  'package-lock.json',
  '.npmrc',
  'other',
];

export interface Instruction {
  /** Position in the Dockerfile, counting instructions only (no comments or blank lines). */
  index: number;
  kind: Kind;
  /** The instruction as written, on one line. */
  text: string;
  /** Name of its stage (`AS name`), or `stage-N` when it has none, as BuildKit calls it. */
  stage: string;
  /**
   * Whether it is a build step that writes to the filesystem: `WORKDIR`, `COPY`, `ADD` and `RUN`.
   * The others only change the image's metadata: `docker history` lists them with 0 bytes and
   * they add no layer.
   */
  layer: boolean;
  /** The groups of files a `COPY` or `ADD` takes from the build context (or, with `--from`, from that stage). */
  files: FileGroup[];
  /** `COPY --from=stage`: the stage it copies from. */
  from?: string;
  /** For `FROM`: the image, or the earlier stage, it starts from. */
  base?: string;
  /**
   * BuildKit runs identical steps once: same starting image and same steps before. This is the
   * index of the earlier instruction this one shares its step and its layer with.
   */
  sameAs?: number;
}

export interface Stage {
  name: string;
  /** The image it starts from (`node:26-slim@sha256:…`), or the earlier stage. */
  base: string;
  /** Whether `base` is an earlier stage of the same Dockerfile. */
  fromStage: boolean;
  /** Whether it is the last stage: the one that becomes the image. */
  final: boolean;
  /** Indexes of its instructions, `FROM` included. */
  instructions: number[];
}

const layerKinds: ReadonlySet<Kind> = new Set(['WORKDIR', 'COPY', 'ADD', 'RUN']);
const kinds: ReadonlySet<string> = new Set<Kind>([
  'FROM',
  'WORKDIR',
  'COPY',
  'ADD',
  'RUN',
  'ENV',
  'ARG',
  'LABEL',
  'USER',
  'EXPOSE',
  'VOLUME',
  'HEALTHCHECK',
  'ENTRYPOINT',
  'CMD',
  'STOPSIGNAL',
  'SHELL',
  'ONBUILD',
]);

/** The instruction lines of a Dockerfile: comments and blank lines out, `\` continuations joined. */
export function instructionLines(source: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (current === '' && (line === '' || line.startsWith('#'))) continue;
    if (current !== '' && line.startsWith('#')) continue;
    if (line.endsWith('\\')) {
      current += `${line.slice(0, -1).trim()} `;
      continue;
    }
    current += line;
    if (current.trim() !== '') lines.push(current.trim());
    current = '';
  }
  if (current.trim() !== '') lines.push(current.trim());
  return lines;
}

/** Splits an instruction's arguments into flags (`--from=x`) and the rest. */
function splitArguments(rest: string): { flags: Map<string, string>; args: string[] } {
  const flags = new Map<string, string>();
  const args: string[] = [];
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    const flag = word.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (flag && args.length === 0) flags.set(flag[1]!, flag[2] ?? '');
    else args.push(word);
  }
  return { flags, args };
}

/** A COPY source pattern (`package*.json`) as a regular expression. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
}

/** The groups a source path of the build context covers: `.`, `src`, `package.json`, `.npmrc`… */
function groupsOfPath(path: string): FileGroup[] {
  const clean = path.replace(/^\.\//, '').replace(/\/+$/, '');
  if (clean === '' || clean === '.') return [...fileGroups];
  if (clean === 'src' || clean.startsWith('src/')) return ['src'];
  // What `npm ci` writes depends only on the two manifests and npm's settings.
  if (clean === 'node_modules' || clean.startsWith('node_modules/'))
    return ['package.json', 'package-lock.json', '.npmrc'];
  const regex = globToRegExp(clean);
  const manifests = (['package.json', 'package-lock.json', '.npmrc'] as const).filter((name) =>
    regex.test(name),
  );
  return manifests.length > 0 ? [...manifests] : ['other'];
}

/** A path inside a stage (`/app/src`) relative to that stage's working directory (`src`). */
function relativeTo(path: string, workdir: string): string {
  if (!path.startsWith('/')) return path;
  const dir = workdir.replace(/\/+$/, '');
  if (path === dir) return '.';
  return path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : 'other';
}

/** Parses the instruction lines of a Dockerfile. */
export function parseDockerfile(lines: readonly string[]): Instruction[] {
  const instructions: Instruction[] = [];
  const workdirs = new Map<string, string>();
  const stageNames: string[] = [];
  let stage = '';
  for (const [index, text] of lines.entries()) {
    const keyword = text.split(/\s+/, 1)[0]!.toUpperCase();
    if (!kinds.has(keyword)) throw new Error(`Unknown Dockerfile instruction: ${text}`);
    const kind = keyword as Kind;
    const { flags, args } = splitArguments(text.slice(keyword.length).trim());
    const instruction: Instruction = {
      index,
      kind,
      text,
      stage,
      layer: layerKinds.has(kind),
      files: [],
    };
    if (kind === 'FROM') {
      const as = args.findIndex((word) => word.toUpperCase() === 'AS');
      stage = as === -1 ? `stage-${stageNames.length}` : args[as + 1]!;
      stageNames.push(stage);
      instruction.stage = stage;
      instruction.base = args[0]!;
      workdirs.set(stage, workdirs.get(args[0]!) ?? '/');
    }
    if (kind === 'WORKDIR') {
      const dir = args[0]!;
      workdirs.set(stage, dir.startsWith('/') ? dir : `${workdirs.get(stage)}/${dir}`);
    }
    if (kind === 'COPY' || kind === 'ADD') {
      const from = flags.get('from');
      const sources = args.slice(0, -1);
      const groups = new Set<FileGroup>();
      for (const source of sources) {
        const path = from === undefined ? source : relativeTo(source, workdirs.get(from) ?? '/');
        for (const group of groupsOfPath(path)) groups.add(group);
      }
      instruction.files = fileGroups.filter((group) => groups.has(group));
      if (from !== undefined) instruction.from = from;
    }
    instructions.push(instruction);
  }
  if (stageNames.length === 1) {
    // A Dockerfile with one stage: BuildKit does not name it.
    for (const instruction of instructions) instruction.stage = '';
  }
  markShared(instructions);
  return instructions;
}

/**
 * The stages of a parsed Dockerfile, in order. `FROM` lines name the stage they start.
 */
export function stagesOf(instructions: readonly Instruction[]): Stage[] {
  const stages: Stage[] = [];
  for (const instruction of instructions) {
    if (instruction.kind === 'FROM') {
      const base = instruction.base!;
      stages.push({
        name: instruction.stage,
        base,
        fromStage: stages.some((stage) => stage.name === base),
        final: false,
        instructions: [],
      });
    }
    stages.at(-1)?.instructions.push(instruction.index);
  }
  if (stages.length > 0) stages.at(-1)!.final = true;
  return stages;
}

/**
 * Which instructions end up in the final image: those of the last stage and of the stages it
 * starts from with `FROM <stage>`. What a stage copies with `COPY --from` arrives as a new layer,
 * not with that stage's layers.
 */
export function inFinalImage(instructions: readonly Instruction[]): boolean[] {
  const stages = stagesOf(instructions);
  const kept = new Set<string>();
  let current: Stage | undefined = stages.at(-1);
  while (current) {
    kept.add(current.name);
    const base = current.base;
    current = current.fromStage ? stages.find((stage) => stage.name === base) : undefined;
  }
  return instructions.map((instruction) => kept.has(instruction.stage));
}

/**
 * Marks the steps BuildKit runs only once. Two stages that start from the same image and repeat
 * the same steps share them: the same `WORKDIR` and the same `COPY` of the npm manifests. A metadata
 * instruction in between does not change a `COPY` or a `WORKDIR`, but it does change a `RUN`,
 * which runs with that environment and user.
 */
function markShared(instructions: Instruction[]): void {
  const seen = new Map<string, number>();
  let layers: string[] = [];
  let all: string[] = [];
  for (const instruction of instructions) {
    if (instruction.kind === 'FROM') {
      layers = [`FROM ${instruction.base}`];
      all = [`FROM ${instruction.base}`];
      continue;
    }
    all = [...all, instruction.text];
    if (!instruction.layer) continue;
    layers = [...layers, instruction.text];
    const key = (instruction.kind === 'RUN' ? all : layers).join('\n');
    const earlier = seen.get(key);
    if (earlier === undefined) seen.set(key, instruction.index);
    else instruction.sameAs = earlier;
  }
}

/** The instruction as the lab shows it: a digest shortened to its first 12 characters. */
export function displayText(text: string): string {
  return text.replace(/@sha256:([0-9a-f]{12})[0-9a-f]{52}/g, '@sha256:$1…');
}
