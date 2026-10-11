import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The style guide's rules for the voice that can be checked without judgment ("Voice" and
// principle 8 in "What readers value").

const content = fileURLToPath(new URL('./', import.meta.url));

/** Words that make people who don't get it feel clumsy. */
const forbidden = {
  es: /\b(simplemente|obviamente|es (muy )?fácil|como todo el mundo sabe)\b/i,
  en: /\b(simply|obviously|it(['’]s| is) (very )?easy|as everyone knows)\b/i,
} as const;
type Locale = keyof typeof forbidden;

/** Every lesson and glossary file, with its language. */
function files(): { path: string; locale: Locale; text: string }[] {
  const all = (dir: string) =>
    readdirSync(content + dir, { recursive: true, encoding: 'utf8' })
      .filter((name) => /\.(mdx|yaml)$/.test(name))
      .map((name) => `${dir}${name}`);
  return [...all('docs/'), ...all('glossary/')].map((path) => ({
    path,
    locale: /^(docs|glossary)\/en\//.test(path) ? 'en' : 'es',
    text: readFileSync(content + path, 'utf8'),
  }));
}

describe('voice', () => {
  it.each(files())('$path has none of the forbidden words', ({ locale, text }) => {
    expect(text).not.toMatch(forbidden[locale]);
  });

  it.each(files().filter(({ path }) => path.endsWith('.mdx')))(
    '$path has no pending author note and at most two notes',
    ({ text }) => {
      expect(text).not.toMatch(/NOTA DEL AUTOR/);
      const notes = text.match(/<Aside[^>]*title="(Nota del autor|Author's note)"/g) ?? [];
      expect(notes.length).toBeLessThanOrEqual(2);
    },
  );
});

describe('the forbidden words', () => {
  it('are found in any case and with «muy»', () => {
    expect('Simplemente ejecuta esto.').toMatch(forbidden.es);
    expect('Esto es muy fácil.').toMatch(forbidden.es);
    expect('It’s easy to do.').toMatch(forbidden.en);
  });

  it('are whole words: «just» and «simple» are allowed', () => {
    expect('Un ejemplo simple.').not.toMatch(forbidden.es);
    expect('You just did it. A simple example.').not.toMatch(forbidden.en);
  });
});
