/**
 * Translation index: pairs each page with its translation even if their routes differ
 * (/fase-0/que-es-dns/ ↔ /en/phase-0/what-is-dns/). Starlight cannot do this: it infers the translation
 * by changing the URL's language prefix. Pure logic; src/lib/translations-astro.ts feeds it
 * with the content collection.
 */
import type { Locale } from './locales';

export interface DocRef {
  id: string;
  translationKey?: string | undefined;
}

export interface TranslationIndex {
  /** Translation key → page id in each language. */
  byKey: Map<string, Partial<Record<Locale, string>>>;
  /** Page id → its key. */
  keyById: Map<string, string>;
}

/** Astro calls the root home page "index" and Starlight normalises it to "". Here it is always "". */
export function normalizeId(id: string): string {
  return id === 'index' ? '' : id;
}

/** English lives in the en/ folder; Spanish, at the root. */
export function localeOfId(id: string): Locale {
  return normalizeId(id).split('/')[0] === 'en' ? 'en' : 'es';
}

/** The public URL of a page: '' → '/', 'fase-0/que-es-dns' → '/fase-0/que-es-dns/'. */
export function urlOfId(id: string): string {
  const clean = normalizeId(id);
  return clean ? `/${clean}/` : '/';
}

/** The key that pairs the page with its translation: translationKey or, if there is none, its route without the language. */
export function translationKeyOf(doc: DocRef): string {
  return doc.translationKey ?? normalizeId(doc.id).replace(/^en(?:\/|$)/, '');
}

/** Phase pages (fase-N/… and en/phase-N/…) have different routes in each language. */
const PHASE_PAGE = /^(?:fase-\d+|en\/phase-\d+)(?:\/|$)/;
/** A lesson inside a phase; group 1 is the phase folder. */
const LESSON_IN_PHASE = /^((?:fase-\d+|en\/phase-\d+))\/[^/]+$/;

export function buildTranslationIndex(docs: readonly DocRef[]): TranslationIndex {
  const byKey = new Map<string, Partial<Record<Locale, string>>>();
  const keyById = new Map<string, string>();
  for (const doc of docs) {
    const id = normalizeId(doc.id);
    // Without a key, a phase page would silently end up without a pair (no hreflang or selector).
    if (PHASE_PAGE.test(id) && doc.translationKey === undefined) {
      throw new Error(
        `[translations] "${id}" has no translationKey. Phase pages need it to pair with their translation (the same in both languages).`,
      );
    }
    const key = translationKeyOf(doc);
    const locale = localeOfId(id);
    const pair = byKey.get(key) ?? {};
    const other = pair[locale];
    if (other !== undefined) {
      throw new Error(
        `[translations] "${other}" and "${id}" have the same translation key ("${key}") in the same language. Change the translationKey of one of them.`,
      );
    }
    pair[locale] = id;
    byKey.set(key, pair);
    keyById.set(id, key);
  }
  // A lesson needs its phase's introduction in its language: the explorer numbers the pages
  // of the phase by their order, and without the introduction the first lesson would become «00».
  for (const id of keyById.keys()) {
    const phase = LESSON_IN_PHASE.exec(id)?.[1];
    if (phase !== undefined && !keyById.has(phase)) {
      throw new Error(
        `[translations] "${id}" is a lesson, but its phase has no introduction in that language ("${phase}"). Create the introduction first.`,
      );
    }
  }
  return { byKey, keyById };
}

/** The URLs of page `id` in each language in which it exists. */
export function translationsOf(
  index: TranslationIndex,
  id: string,
): Partial<Record<Locale, string>> {
  const key = index.keyById.get(normalizeId(id));
  const pair = key === undefined ? {} : (index.byKey.get(key) ?? {});
  return Object.fromEntries(
    Object.entries(pair).map(([locale, pageId]) => [locale, urlOfId(pageId)]),
  );
}

/** The id Astro gives a src/content/docs file: lowercase, without extension and without the trailing /index. */
export function idFromContentPath(relativePath: string): string {
  const id = relativePath.replace(/\.mdx?$/, '').toLowerCase();
  return id === 'index' ? id : id.replace(/\/index$/, '');
}

/**
 * The fallback copies Starlight generates: for each Spanish page, one under /en/ with the same
 * route if that route does not exist in English. With translated routes, Starlight does not know the translation
 * exists under another route, and there would be one copy per lesson.
 */
export function fallbackUrls(ids: readonly string[]): string[] {
  const existing = new Set(ids.map(normalizeId));
  return [...existing]
    .filter((id) => localeOfId(id) === 'es')
    .map((id) => (id ? `en/${id}` : 'en'))
    .filter((englishId) => !existing.has(englishId))
    .map(urlOfId);
}
