import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { phaseFolderName } from '../lib/explorer';
import { locales } from '../lib/locales';
import { playgrounds } from './playgrounds';

const docs = fileURLToPath(new URL('../content/docs/', import.meta.url));
const playgroundsDir = fileURLToPath(new URL('../playgrounds/', import.meta.url));

/** The lessons of a phase in a language: the text of each .mdx file in its folder. */
function lessonsOf(locale: (typeof locales)[number], phase: number): string[] {
  const folder = `${docs}${locale === 'es' ? '' : `${locale}/`}${phaseFolderName(locale, phase)}/`;
  return readdirSync(folder)
    .filter((name) => name.endsWith('.mdx'))
    .map((name) => readFileSync(`${folder}${name}`, 'utf8'));
}

describe('playgrounds', () => {
  it('each one has a distinct id', () => {
    const ids = playgrounds.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each id is a folder in src/playgrounds/', () => {
    for (const { id } of playgrounds) expect(existsSync(`${playgroundsDir}${id}`), id).toBe(true);
  });

  it.each(locales)('in %s, each one is really in its lesson, within its phase', (locale) => {
    for (const { id, phase, lesson } of playgrounds) {
      const page = lessonsOf(locale, phase).find((text) =>
        text.includes(`translationKey: ${lesson}\n`),
      );
      expect(page, `${id}: there is no lesson "${lesson}" in phase ${phase}`).toBeDefined();
      expect(page, `${id}: the lesson "${lesson}" does not import it`).toContain(
        `~/playgrounds/${id}/`,
      );
    }
  });
});
