import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { phaseFolderName } from '../lib/explorer';
import { locales } from '../lib/locales';
import { playgrounds } from './playgrounds';

const docs = fileURLToPath(new URL('../content/docs/', import.meta.url));
const playgroundsDir = fileURLToPath(new URL('../playgrounds/', import.meta.url));

/** Las lecciones de una fase en un idioma: el texto de cada .mdx de su carpeta. */
function lessonsOf(locale: (typeof locales)[number], phase: number): string[] {
  const folder = `${docs}${locale === 'es' ? '' : `${locale}/`}${phaseFolderName(locale, phase)}/`;
  return readdirSync(folder)
    .filter((name) => name.endsWith('.mdx'))
    .map((name) => readFileSync(`${folder}${name}`, 'utf8'));
}

describe('playgrounds', () => {
  it('cada uno tiene un id distinto', () => {
    const ids = playgrounds.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada id es una carpeta de src/playgrounds/', () => {
    for (const { id } of playgrounds) expect(existsSync(`${playgroundsDir}${id}`), id).toBe(true);
  });

  it.each(locales)('en %s, cada uno está de verdad en su lección, dentro de su fase', (locale) => {
    for (const { id, phase, lesson } of playgrounds) {
      const page = lessonsOf(locale, phase).find((text) =>
        text.includes(`translationKey: ${lesson}\n`),
      );
      expect(page, `${id}: no hay lección «${lesson}» en la fase ${phase}`).toBeDefined();
      expect(page, `${id}: la lección «${lesson}» no lo importa`).toContain(`~/playgrounds/${id}/`);
    }
  });
});
