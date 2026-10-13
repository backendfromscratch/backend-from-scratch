/**
 * The code the lessons show comes from the guided projects (projects/), which CI runs and tests:
 * a lesson never copies code by hand. A file is shown whole or one region of it, marked with
 * `// #region name` and `// #endregion name`. A region that does not exist fails the build.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const marker = /^\s*\/\/ #(end)?region\b.*$/;

/** The common indentation of the non-empty lines, removed. */
function dedent(lines: string[]): string[] {
  const indents = lines.filter((line) => line.trim() !== '').map((line) => line.search(/\S/));
  const common = Math.min(...indents);
  return lines.map((line) => line.slice(common));
}

/** Blank lines at the start and the end, removed. */
function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]!.trim() === '') start++;
  while (end > start && lines[end - 1]!.trim() === '') end--;
  return lines.slice(start, end);
}

/** The whole source without its region markers, or the lines of one region. */
export function extractRegion(source: string, region?: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (region === undefined) {
    return trimBlank(lines.filter((line) => !marker.test(line))).join('\n');
  }
  const opens = (line: string) => line.trim() === `// #region ${region}`;
  const closes = (line: string) => line.trim() === `// #endregion ${region}`;
  const start = lines.findIndex(opens);
  if (start === -1) throw new Error(`There is no region «${region}»`);
  if (lines.findIndex((line, i) => i > start && opens(line)) !== -1) {
    throw new Error(`The region «${region}» appears twice`);
  }
  const end = lines.findIndex((line, i) => i > start && closes(line));
  if (end === -1) throw new Error(`The region «${region}» is never closed`);
  const inner = lines.slice(start + 1, end).filter((line) => !marker.test(line));
  return dedent(trimBlank(inner)).join('\n');
}

/** The language Expressive Code highlights a file with, from its extension. */
export function languageOf(file: string): string {
  // tsconfig.json admits comments: JSON with comments, so they are not marked as errors.
  if (/(^|\/)tsconfig[^/]*\.json$/.test(file)) return 'jsonc';
  const extension = file.slice(file.lastIndexOf('.') + 1);
  const languages: Record<string, string> = {
    ts: 'ts',
    js: 'js',
    json: 'json',
    sh: 'sh',
    proto: 'proto',
  };
  const language = languages[extension] ?? (file.split('/').at(-1)?.startsWith('.') ? 'ini' : '');
  if (!language) throw new Error(`No language for «${file}»`);
  return language;
}

/** The projects folder, from the site's folder (where Astro and Vitest run). */
const projects = resolve(process.cwd(), '..', 'projects');

/**
 * A file of a project: `tienda-api/04-servidor-http/src/app.ts`. The real path is checked, not
 * just the text: a symbolic link inside projects/ cannot make a lesson show a file from elsewhere.
 */
export function readProjectFile(file: string, root = projects): string {
  const refuse = () => new Error(`There is no project file «${file}» in ${root}`);
  const path = resolve(root, file);
  if (!path.startsWith(root + sep) || !existsSync(path)) throw refuse();
  const real = realpathSync(path);
  if (!real.startsWith(realpathSync(root) + sep)) throw refuse();
  return readFileSync(real, 'utf8');
}
