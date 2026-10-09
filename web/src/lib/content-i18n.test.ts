import { describe, expect, it } from 'vitest';
import { contentT } from './content-i18n';

function fakeLocals(contentLang: string, urlLang: string) {
  const calls: Array<[string, unknown]> = [];
  const locals = {
    starlightRoute: { lang: urlLang, entryMeta: { lang: contentLang } },
    t: (key: string, options?: unknown) => {
      calls.push([key, options]);
      return key;
    },
  } as unknown as App.Locals;
  return { locals, calls };
}

describe('contentT', () => {
  it('traduce en el idioma del contenido, no en el de la URL', () => {
    // Página /en/… sin traducir: la URL es inglesa pero el contenido es español.
    const { locals, calls } = fakeLocals('es', 'en');
    contentT(locals)('tryIt.title');
    expect(calls).toEqual([['tryIt.title', { lng: 'es' }]]);
  });

  it('en una página traducida, el idioma del contenido coincide con el de la URL', () => {
    const { locals, calls } = fakeLocals('en', 'en');
    contentT(locals)('selfCheck.show');
    expect(calls).toEqual([['selfCheck.show', { lng: 'en' }]]);
  });
});
