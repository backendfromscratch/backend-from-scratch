/**
 * Captures the real data of the docker-layers lab and writes fixtures.ts. Run by hand, never by
 * the site (the tests import its pure functions). It needs Docker and builds images on this
 * machine, named `p7lab-*`, and removes them at the end.
 *
 *   node web/src/playgrounds/docker-layers/capture.ts <single-stage step> <multi-stage step>
 *   node web/src/playgrounds/docker-layers/capture.ts projects/tienda-api/32-dockerfile projects/tienda-api/33-imagen-pequena
 *
 * Each step folder must have a Dockerfile (and a .dockerignore). The "wrong order" Dockerfile is
 * derived from the single-stage one (`COPY . .` moved to where the `COPY` of the npm manifests was).
 * For each of the three it builds without cache three times (the median seconds of each step),
 * changes a file of `src/` and builds again, changes `package.json` and builds again (which steps
 * say CACHED), and reads the sizes with `docker history`. It works on a copy in a temporary folder of the home directory,
 * because Docker on a Mac only shares /Users.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { cpus, homedir, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inFinalImage,
  instructionLines,
  parseDockerfile,
  stagesOf,
  type Instruction,
} from './dockerfile.ts';
import type { Status } from './cache.ts';
import type { Capture, StepMeasure, Variant, VariantCapture } from './measure.ts';

/**
 * The "wrong order" version of a single-stage Dockerfile: the `COPY` of the npm manifests goes,
 * and `COPY . .` takes its place, before `npm ci`. The manifests' `COPY` may take other files
 * that `npm ci` needs, such as `.npmrc`, but never `src/`.
 */
export function wrongOrder(lines: readonly string[]): string[] {
  const instructions = parseDockerfile(lines);
  const manifests = instructions.find(
    (i) =>
      i.kind === 'COPY' &&
      i.from === undefined &&
      i.files.includes('package.json') &&
      !i.files.includes('src'),
  );
  const everything = instructions.find(
    (i) => i.kind === 'COPY' && i.from === undefined && i.files.includes('src'),
  );
  if (!manifests || !everything || everything.index < manifests.index) {
    throw new Error('The Dockerfile has no `COPY` of the npm manifests before a `COPY . .`');
  }
  const result = [...lines];
  result.splice(everything.index, 1);
  result[manifests.index] = everything.text;
  return result;
}

/**
 * The label of each instruction's step in `docker build --progress=plain`: `3/5` with one stage,
 * `dependencias 3/4` with several. `null` for those that are not a step. `FROM <image>` is step
 * 1 of its stage; `FROM <earlier stage>` is not a step.
 */
export function stepLabels(instructions: readonly Instruction[]): (string | null)[] {
  const labels: (string | null)[] = instructions.map(() => null);
  const stageNames = new Set(instructions.filter((i) => i.kind === 'FROM').map((i) => i.stage));
  const byStage = new Map<string, Instruction[]>();
  for (const instruction of instructions) {
    const list = byStage.get(instruction.stage) ?? [];
    list.push(instruction);
    byStage.set(instruction.stage, list);
  }
  for (const [stage, list] of byStage) {
    const steps = list.filter((i) => i.layer || (i.kind === 'FROM' && !stageNames.has(i.base!)));
    steps.forEach((step, n) => {
      const position = `${n + 1}/${steps.length}`;
      labels[step.index] = stage === '' ? position : `${stage} ${position}`;
    });
  }
  return labels;
}

export type LoggedStep = { status: 'done'; seconds: number } | { status: 'cached' };

/** The steps of a `docker build --progress=plain` log, by label (`3/5`, `final 4/5`). */
export function parseBuildLog(log: string): Map<string, LoggedStep> {
  const labelOf = new Map<string, string>();
  const steps = new Map<string, LoggedStep>();
  for (const line of log.split('\n')) {
    const header = line.match(/^#(\d+) \[([^\]]+)\] /);
    if (header) {
      const label = header[2]!;
      if (/^(.+ )?\d+\/\d+$/.test(label)) labelOf.set(header[1]!, label);
      continue;
    }
    const done = line.match(/^#(\d+) DONE (\d+(?:\.\d+)?)s$/);
    const cached = line.match(/^#(\d+) CACHED$/);
    const id = done?.[1] ?? cached?.[1];
    const label = id === undefined ? undefined : labelOf.get(id);
    if (label === undefined) continue;
    steps.set(label, done ? { status: 'done', seconds: Number(done[2]) } : { status: 'cached' });
  }
  return steps;
}

/** The rows of `docker history --no-trunc --human=false --format '{{.CreatedBy}}\t{{.Size}}'`, oldest first. */
export function parseHistory(output: string): { createdBy: string; bytes: number }[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const tab = line.lastIndexOf('\t');
      return { createdBy: line.slice(0, tab), bytes: Number(line.slice(tab + 1)) };
    })
    .reverse();
}

/**
 * The size of each instruction of `stage`, from the history of an image built up to that stage.
 * Its own instructions (not `FROM`) are the last rows, in order; each row starts with the
 * instruction's keyword, which is checked.
 */
export function sizesOfStage(
  instructions: readonly Instruction[],
  stage: string,
  history: readonly { createdBy: string; bytes: number }[],
): Map<number, number> {
  const own = instructions.filter((i) => i.stage === stage && i.kind !== 'FROM');
  const rows = history.slice(history.length - own.length);
  const sizes = new Map<number, number>();
  own.forEach((instruction, n) => {
    const row = rows[n];
    if (!row?.createdBy.startsWith(instruction.kind)) {
      throw new Error(`History row «${row?.createdBy}» does not match «${instruction.text}»`);
    }
    sizes.set(instruction.index, row.bytes);
  });
  return sizes;
}

/** What each step did in a build, from its log: `null` for those that are not a step. */
export function observedStatuses(
  instructions: readonly Instruction[],
  log: Map<string, LoggedStep>,
): (Status | null)[] {
  const labels = stepLabels(instructions);
  return instructions.map((instruction) => {
    if (!instruction.layer) return null;
    const step = stepOf(instruction, labels, log);
    return step.status === 'cached' ? 'cached' : 'rebuilt';
  });
}

/** The logged step of an instruction, or of the one it shares its step with. */
function stepOf(
  instruction: Instruction,
  labels: readonly (string | null)[],
  log: Map<string, LoggedStep>,
): LoggedStep {
  const own = log.get(labels[instruction.index]!);
  if (instruction.sameAs === undefined) {
    if (!own) throw new Error(`The build log has no step «${labels[instruction.index]}»`);
    return own;
  }
  // BuildKit runs a shared step once and logs it under the first stage.
  if (own)
    throw new Error(`«${instruction.text}» was expected to share a step, but it has its own`);
  return log.get(labels[instruction.sameAs]!)!;
}

/** The seconds of each step in a build without cache (a step shared with an earlier one: 0). */
export function stepSeconds(
  instructions: readonly Instruction[],
  log: Map<string, LoggedStep>,
): (number | null)[] {
  const labels = stepLabels(instructions);
  return instructions.map((instruction) => {
    if (!instruction.layer) return null;
    if (instruction.sameAs !== undefined) {
      stepOf(instruction, labels, log);
      return 0;
    }
    const step = stepOf(instruction, labels, log);
    return step.status === 'done' ? step.seconds : 0;
  });
}

/** fixtures.ts, from the captured data. */
export function renderFixtures(capture: Capture, command: string): string {
  return `/**
 * Real data for the docker-layers lab, written by capture.ts. Do not edit by hand: capture again.
 *
 * Captured on ${capture.date} with ${capture.docker}, on ${capture.machine}.
 * Command: ${command}
 *
 * Sizes: \`docker history --human=false\` (bytes, uncompressed). Seconds: the median of
 * ${RUNS} \`docker build --progress=plain --no-cache\` (\`#N DONE x.ys\`), on a machine where
 * other builds may run too.
 * Observed: the steps that said CACHED when building again after changing a file of \`src/\`, and
 * then after changing \`package.json\`.
 */
import type { Capture } from './measure';

export const capture: Capture = ${JSON.stringify(capture, null, 2)};
`;
}

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return `${result.stdout}${result.stderr}`;
}

/** Builds without cache this many times: each step's seconds are the median. */
const RUNS = 3;

/** The middle value (`null` if the step is not one). */
export function median(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  const middle = Math.floor(numbers.length / 2);
  const value =
    numbers.length % 2 === 1 ? numbers[middle]! : (numbers[middle - 1]! + numbers[middle]!) / 2;
  return Math.round(value * 10) / 10;
}

const build = (dir: string, tag: string, extra: string[] = []) =>
  run('docker', ['build', '--progress=plain', ...extra, '-t', tag, dir]);

const history = (image: string) =>
  parseHistory(
    run('docker', [
      'history',
      '--no-trunc',
      '--human=false',
      '--format',
      '{{.CreatedBy}}\t{{.Size}}',
      image,
    ]),
  );

const layerCount = (image: string) =>
  Number(run('docker', ['image', 'inspect', '--format', '{{len .RootFS.Layers}}', image]).trim());

/** Builds and measures one Dockerfile in a copy of `stepDir`. */
function captureVariant(variant: Variant, stepDir: string, dockerfile: string[]): VariantCapture {
  const instructions = parseDockerfile(dockerfile);
  const dir = mkdtempSync(join(homedir(), 'p7lab-capture-'));
  const tag = `p7lab-${variant}`;
  const images = [tag];
  try {
    cpSync(stepDir, dir, {
      recursive: true,
      filter: (path) => !/\/(node_modules|\.git)(\/|$)/.test(path),
    });
    writeFileSync(join(dir, 'Dockerfile'), `${dockerfile.join('\n')}\n`);

    const logs: Map<string, LoggedStep>[] = [];
    for (let n = 1; n <= RUNS; n++) {
      console.log(`[${variant}] build without cache (${n}/${RUNS})`);
      logs.push(parseBuildLog(build(dir, tag, ['--no-cache'])));
    }
    // Each change is unique (a random mark), so no earlier build, of this capture or of another
    // one, can have left the result in Docker's cache.
    const mark = `p7lab ${variant} ${randomUUID()}`;
    const srcFile = readdirSync(join(dir, 'src'))
      .filter((name) => name.endsWith('.ts'))
      .sort()[0]!;
    appendFileSync(join(dir, 'src', srcFile), `\n// ${mark}\n`);
    console.log(`[${variant}] build after changing src/${srcFile}`);
    const afterSrc = parseBuildLog(build(dir, tag));
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify({ ...manifest, description: mark }, null, 2)}\n`,
    );
    console.log(`[${variant}] build after changing package.json`);
    const afterPackage = parseBuildLog(build(dir, tag));

    const sizes = new Map<number, number>();
    const names = [...new Set(instructions.map((i) => i.stage))];
    for (const stage of names) {
      const final = stage === names.at(-1);
      const image = final ? tag : `${tag}-${stage}`;
      if (!final) {
        images.push(image);
        build(dir, image, ['--target', stage]);
      }
      for (const [index, bytes] of sizesOfStage(instructions, stage, history(image))) {
        sizes.set(index, bytes);
      }
    }

    // Exactness: the image has the base's layers plus one per instruction that adds a layer.
    const kept = inFinalImage(instructions);
    const stages = stagesOf(instructions);
    let root = stages.at(-1)!;
    while (root.fromStage) root = stages.find((stage) => stage.name === root.base)!;
    const expected =
      layerCount(root.base) + instructions.filter((i) => i.layer && kept[i.index]).length;
    if (layerCount(tag) !== expected) {
      throw new Error(`${tag} has ${layerCount(tag)} layers; the parser expects ${expected}`);
    }

    const runs = logs.map((log) => stepSeconds(instructions, log));
    const seconds = instructions.map((_, index) => median(runs.map((run) => run[index]!)));
    const steps: StepMeasure[] = instructions.map((instruction) => ({
      bytes: instruction.layer ? (sizes.get(instruction.index) ?? 0) : null,
      seconds: seconds[instruction.index]!,
    }));
    return {
      dockerfile,
      steps,
      observed: {
        src: observedStatuses(instructions, afterSrc),
        package: observedStatuses(instructions, afterPackage),
      },
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
    spawnSync('docker', ['image', 'rm', ...images], { encoding: 'utf8' });
  }
}

const localDate = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-');

function main(singleStep: string, multiStep: string) {
  const single = instructionLines(readFileSync(join(singleStep, 'Dockerfile'), 'utf8'));
  const multi = instructionLines(readFileSync(join(multiStep, 'Dockerfile'), 'utf8'));
  const base = parseDockerfile(single)[0]!.base!;

  const baseRows = history(base);
  const baseLayers = layerCount(base);
  const variants: Record<Variant, VariantCapture> = {
    good: captureVariant('good', singleStep, single),
    wrong: captureVariant('wrong', singleStep, wrongOrder(single)),
    multi: captureVariant('multi', multiStep, multi),
  };

  const engine = run('docker', ['version', '--format', '{{.Server.Version}}']).trim();
  const buildx = run('docker', ['buildx', 'version']).trim().split(' ')[1];
  const info = run('docker', [
    'info',
    '--format',
    '{{.OperatingSystem}}|{{.NCPU}}|{{.MemTotal}}|{{.Name}}',
  ])
    .trim()
    .split('|');
  const host =
    process.platform === 'darwin'
      ? run('sysctl', ['-n', 'machdep.cpu.brand_string']).trim()
      : (cpus()[0]?.model ?? process.platform);
  const gb = (bytes: number) => `${Math.round(bytes / 2 ** 30)} GB`;
  const capture: Capture = {
    date: localDate(new Date()),
    docker: `Docker Engine ${engine} (BuildKit, buildx ${buildx})`,
    machine: `${host}, ${gb(totalmem())} (Docker's VM "${info[3]}": ${info[0]}, ${info[1]} CPUs, ${gb(Number(info[2]))})`,
    base: {
      image: base,
      layers: baseLayers,
      bytes: baseRows.reduce((sum, row) => sum + row.bytes, 0),
    },
    variants,
  };

  const out = fileURLToPath(new URL('./fixtures.ts', import.meta.url));
  const command = `node web/src/playgrounds/docker-layers/capture.ts ${singleStep} ${multiStep}`;
  writeFileSync(out, renderFixtures(capture, command));
  console.log(`Written ${out}. Run \`pnpm format\` to format it.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [single, multi] = process.argv.slice(2);
  if (!single || !multi) {
    console.error('Usage: node capture.ts <single-stage step folder> <multi-stage step folder>');
    process.exit(1);
  }
  main(single, multi);
}
