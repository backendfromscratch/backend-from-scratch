import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// What the schema cannot check because it does not know an entry's language: the literal
// translation of an acronym goes in Spanish and not in English. The schema already requires
// `acronym` on every term with one (content.config.ts).

const glossary = fileURLToPath(new URL('./glossary/', import.meta.url));
const withAcronym = (locale: string) =>
  readdirSync(glossary + locale)
    .map((name) => ({ name, text: readFileSync(`${glossary}${locale}/${name}`, 'utf8') }))
    .filter(({ text }) => /^acronym:/m.test(text));

describe('acronyms in the glossary', () => {
  it('there are acronyms to check', () => {
    expect(withAcronym('es').length).toBeGreaterThan(10);
  });

  it.each(withAcronym('es'))('es/$name says what the letters mean in Spanish', ({ text }) => {
    expect(text).toMatch(/^ {2}translation: \S/m);
  });

  it.each(withAcronym('en'))('en/$name has no translation', ({ text }) => {
    expect(text).not.toMatch(/^ {2}translation:/m);
  });
});
