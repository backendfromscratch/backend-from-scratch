import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../', import.meta.url));
const config = readFileSync(join(src, 'content.config.ts'), 'utf8');

/** The own interface keys: those in the `extend` of the i18n schema. */
const ownKeys = [...config.matchAll(/'([\w.]+)': z\.string\(\)/g)].map(([, key]) => key!);

/** The code that can use a key: components, pages and libraries (not the texts or the tests). */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'content' ? [] : sources(path);
    return /\.(astro|ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = sources(src)
  .filter((path) => !path.endsWith('content.config.ts'))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

describe('own interface strings', () => {
  it('there are keys to check', () => {
    expect(ownKeys.length).toBeGreaterThan(10);
  });

  it.each(ownKeys)('«%s» is used in the code', (key) => {
    expect(code).toContain(`'${key}'`);
  });
});
