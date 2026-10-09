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
  it('translates into the content language, not the URL language', () => {
    // Untranslated /en/… page: the URL is English but the content is Spanish.
    const { locals, calls } = fakeLocals('es', 'en');
    contentT(locals)('tryIt.title');
    expect(calls).toEqual([['tryIt.title', { lng: 'es' }]]);
  });

  it('on a translated page, the content language matches the URL language', () => {
    const { locals, calls } = fakeLocals('en', 'en');
    contentT(locals)('selfCheck.show');
    expect(calls).toEqual([['selfCheck.show', { lng: 'en' }]]);
  });
});
