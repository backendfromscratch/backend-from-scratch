import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { phaseFolderName } from '../lib/explorer';
import { locales } from '../lib/locales';
import { phases } from './phases';

const docs = fileURLToPath(new URL('../content/docs/', import.meta.url));

/** The published lessons of a phase in a language: the .mdx files in its folder, without the intro. */
function publishedLessons(locale: (typeof locales)[number], phase: number): number {
  const folder = `${docs}${locale === 'es' ? '' : `${locale}/`}${phaseFolderName(locale, phase)}`;
  if (!existsSync(folder)) return 0;
  return readdirSync(folder).filter((name) => name.endsWith('.mdx') && name !== 'index.mdx').length;
}

describe('phases', () => {
  it.each(locales)(
    'in %s, no phase publishes more lessons than it announces (the status bar would say "lesson 9/8")',
    (locale) => {
      for (const phase of phases) {
        if (phase.lessonCount === undefined) continue;
        expect(publishedLessons(locale, phase.number), `phase ${phase.number}`).toBeLessThanOrEqual(
          phase.lessonCount,
        );
      }
    },
  );

  it('a "coming soon" phase has no published lessons', () => {
    for (const phase of phases.filter((p) => p.status === 'coming-soon')) {
      for (const locale of locales) expect(publishedLessons(locale, phase.number)).toBe(0);
    }
  });
});
