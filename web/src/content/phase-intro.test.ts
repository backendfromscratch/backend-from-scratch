import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docs = fileURLToPath(new URL('./docs/', import.meta.url));

/** Where each language's phases live and how their folders are named. */
const layout = {
  es: { dir: '', folder: /^fase-\d+$/ },
  en: { dir: 'en/', folder: /^phase-\d+$/ },
} as const;
type Locale = keyof typeof layout;

/** The phase folders of a language that have an introduction: «fase-0», «fase-1»… */
function phaseFolders(locale: Locale): string[] {
  const { dir, folder } = layout[locale];
  return readdirSync(docs + dir).filter(
    (name) => folder.test(name) && existsSync(`${docs}${dir}${name}/index.mdx`),
  );
}

/** The lessons of a phase, as URLs, in menu order (`sidebar.order`). */
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
 * The links of the introduction's numbered list: «1. [Name](/fase-0/…/)». Unpublished lessons
 * have no link («2. Name *(pronto)*») and do not count.
 */
function introList(locale: Locale, phase: string): string[] {
  const intro = readFileSync(`${docs}${layout[locale].dir}${phase}/index.mdx`, 'utf8');
  return [...intro.matchAll(/^\d+\. \[[^\]]+\]\(([^)]+)\)$/gm)].map(([, href]) => href!);
}

const cases = (['es', 'en'] as const).flatMap((locale) =>
  phaseFolders(locale).map((phase) => [locale, phase] as const),
);

describe('phase introductions', () => {
  it("finds Phase 0's in both languages", () => {
    expect(cases).toContainEqual(['es', 'fase-0']);
    expect(cases).toContainEqual(['en', 'phase-0']);
  });

  it.each(cases)(
    'in %s, the lesson list of %s follows the menu order (if a lesson is added, add it there too)',
    (locale, phase) => {
      expect(introList(locale, phase)).toEqual(lessonsInOrder(locale, phase));
    },
  );
});
