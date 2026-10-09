import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('strings', () => {
  it.each(['es', 'en'] as const)('the data in %s is ASCII, so bytes = letters', (lang) => {
    for (const payload of strings[lang].payloads) expect(payload).toMatch(/^[\x20-\x7e]+$/);
  });

  it('both languages have the same sentences', () => {
    expect(Object.keys(strings.en.narration).sort()).toEqual(
      Object.keys(strings.es.narration).sort(),
    );
  });
});
