import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = fileURLToPath(new URL('../', import.meta.url));
const config = readFileSync(join(src, 'content.config.ts'), 'utf8');

/** Las claves de interfaz propias: las del `extend` del esquema i18n. */
const ownKeys = [...config.matchAll(/'([\w.]+)': z\.string\(\)/g)].map(([, key]) => key!);

/** El código que puede usar una clave: componentes, páginas y librerías (no los textos ni los tests). */
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

describe('textos de interfaz propios', () => {
  it('hay claves que comprobar', () => {
    expect(ownKeys.length).toBeGreaterThan(10);
  });

  it.each(ownKeys)('«%s» se usa en el código', (key) => {
    expect(code).toContain(`'${key}'`);
  });
});
