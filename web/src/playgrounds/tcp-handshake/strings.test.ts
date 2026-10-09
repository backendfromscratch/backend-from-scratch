import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('strings', () => {
  it.each(['es', 'en'] as const)('los datos en %s son ASCII, para que bytes = letras', (lang) => {
    for (const payload of strings[lang].payloads) expect(payload).toMatch(/^[\x20-\x7e]+$/);
  });

  it('los dos idiomas tienen las mismas frases', () => {
    expect(Object.keys(strings.en.narration).sort()).toEqual(
      Object.keys(strings.es.narration).sort(),
    );
  });
});
