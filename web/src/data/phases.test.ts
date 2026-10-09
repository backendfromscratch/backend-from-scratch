import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { phaseFolderName } from '../lib/explorer';
import { locales } from '../lib/locales';
import { phases } from './phases';

const docs = fileURLToPath(new URL('../content/docs/', import.meta.url));

/** Las lecciones publicadas de una fase en un idioma: los .mdx de su carpeta, sin la introducción. */
function publishedLessons(locale: (typeof locales)[number], phase: number): number {
  const folder = `${docs}${locale === 'es' ? '' : `${locale}/`}${phaseFolderName(locale, phase)}`;
  if (!existsSync(folder)) return 0;
  return readdirSync(folder).filter((name) => name.endsWith('.mdx') && name !== 'index.mdx').length;
}

describe('phases', () => {
  it.each(locales)(
    'en %s, ninguna fase publica más lecciones de las que anuncia (la barra de estado diría «lección 9/8»)',
    (locale) => {
      for (const phase of phases) {
        if (phase.lessonCount === undefined) continue;
        expect(publishedLessons(locale, phase.number), `fase ${phase.number}`).toBeLessThanOrEqual(
          phase.lessonCount,
        );
      }
    },
  );

  it('una fase «pronto» no tiene lecciones publicadas', () => {
    for (const phase of phases.filter((p) => p.status === 'coming-soon')) {
      for (const locale of locales) expect(publishedLessons(locale, phase.number)).toBe(0);
    }
  });
});
