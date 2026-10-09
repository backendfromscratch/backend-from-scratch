import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docs = fileURLToPath(new URL('./docs/', import.meta.url));

/** Dónde están las fases de cada idioma y cómo se llaman sus carpetas. */
const layout = {
  es: { dir: '', folder: /^fase-\d+$/ },
  en: { dir: 'en/', folder: /^phase-\d+$/ },
} as const;
type Locale = keyof typeof layout;

/** Las carpetas de fase de un idioma que tienen introducción: «fase-0», «fase-1»… */
function phaseFolders(locale: Locale): string[] {
  const { dir, folder } = layout[locale];
  return readdirSync(docs + dir).filter(
    (name) => folder.test(name) && existsSync(`${docs}${dir}${name}/index.mdx`),
  );
}

/** Las lecciones de una fase, como URLs, en el orden del menú (`sidebar.order`). */
function lessonsInOrder(locale: Locale, phase: string): string[] {
  const path = `${layout[locale].dir}${phase}/`;
  return readdirSync(docs + path)
    .filter((name) => name.endsWith('.mdx') && name !== 'index.mdx')
    .map((name) => ({
      url: `/${path}${name.replace(/\.mdx$/, '')}/`,
      order: Number(/^\s+order:\s*(\d+)/m.exec(readFileSync(docs + path + name, 'utf8'))?.[1]),
    }))
    .sort((a, b) => a.order - b.order)
    .map((lesson) => lesson.url);
}

/**
 * Los enlaces de la lista numerada de la introducción: «1. [Nombre](/fase-0/…/)». Las lecciones
 * sin publicar van sin enlace («2. Nombre *(pronto)*») y no cuentan.
 */
function introList(locale: Locale, phase: string): string[] {
  const intro = readFileSync(`${docs}${layout[locale].dir}${phase}/index.mdx`, 'utf8');
  return [...intro.matchAll(/^\d+\. \[[^\]]+\]\(([^)]+)\)$/gm)].map(([, href]) => href!);
}

const cases = (['es', 'en'] as const).flatMap((locale) =>
  phaseFolders(locale).map((phase) => [locale, phase] as const),
);

describe('introducciones de las fases', () => {
  it('encuentra la de la Fase 0 en los dos idiomas', () => {
    expect(cases).toContainEqual(['es', 'fase-0']);
    expect(cases).toContainEqual(['en', 'phase-0']);
  });

  it.each(cases)(
    'en %s, la lista de lecciones de %s sigue el orden del menú (si se añade una lección, también ahí)',
    (locale, phase) => {
      expect(introList(locale, phase)).toEqual(lessonsInOrder(locale, phase));
    },
  );
});
