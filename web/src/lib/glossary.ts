import type { Locale } from './locales';

/** Id of an entry in the collection: "<language>/<term-id>", e.g. "es/port". */
export function glossaryEntryId(locale: Locale, termId: string): string {
  return `${locale}/${termId}`;
}

/** Inverse of glossaryEntryId: "es/port" → "port". */
export function termIdFromEntryId(entryId: string): string {
  const separator = entryId.indexOf('/');
  if (separator === -1) throw new Error(`[glossary] Id without a language: "${entryId}"`);
  return entryId.slice(separator + 1);
}

/** Sorts alphabetically with the language's rules (Intl.Collator), without modifying the original list. */
export function sortGlossary<T extends { data: { term: string } }>(
  entries: readonly T[],
  locale: Locale,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  return [...entries].sort((a, b) => collator.compare(a.data.term, b.data.term));
}

/**
 * The popover id of a <Term>: the term and how many times it has already appeared on the page
 * («term-port», «term-port-2»…). This way the HTML is the same on every build. `seen` belongs to the page.
 */
export function termPopoverId(seen: Map<string, number>, termId: string): string {
  const count = (seen.get(termId) ?? 0) + 1;
  seen.set(termId, count);
  return count === 1 ? `term-${termId}` : `term-${termId}-${count}`;
}

const seenByPage = new WeakMap<object, Map<string, number>>();

/**
 * The terms that have already appeared on a page. `page` is an object that exists once per page (in
 * Term.astro, Astro.locals): a component's frontmatter runs again for each <Term>, so
 * the count has to live here, in the module.
 */
export function termsSeenIn(page: object): Map<string, number> {
  let seen = seenByPage.get(page);
  if (!seen) {
    seen = new Map();
    seenByPage.set(page, seen);
  }
  return seen;
}

/**
 * The lesson that explains each term (term id → lesson id). If the term says which one
 * (`lesson`, the lesson's translationKey), that one: the first use is not always the explanation
 * («puerto» appears in client-server, but it is explained in the IP and ports one). Otherwise, the first in the
 * course that uses it with <Term id="…">. `lessons` arrives in course order, with the phase
 * introductions, their translationKey and their MDX text; each text is scanned only once.
 *
 * A `lesson` that is not in this language but is in another (not yet translated) falls back to the first use;
 * one that is not in `knownKeys` (the translationKeys of all languages) is a typo: error.
 */
export function explainingLessons(
  terms: readonly { id: string; lesson?: string }[],
  lessons: readonly { id: string; translationKey?: string; body: string }[],
  knownKeys: ReadonlySet<string>,
): Map<string, string> {
  const firstUse = new Map<string, string>();
  for (const lesson of lessons) {
    for (const [, termId] of lesson.body.matchAll(/<Term\s+id=["']([^"']+)["']/g)) {
      if (!firstUse.has(termId!)) firstUse.set(termId!, lesson.id);
    }
  }
  const byKey = new Map(
    lessons.flatMap((lesson): [string, string][] =>
      lesson.translationKey ? [[lesson.translationKey, lesson.id]] : [],
    ),
  );
  const result = new Map<string, string>();
  for (const term of terms) {
    if (term.lesson && !knownKeys.has(term.lesson)) {
      throw new Error(
        `[glossary] "${term.id}" says it is explained by the lesson "${term.lesson}", which does not exist`,
      );
    }
    const lessonId = (term.lesson && byKey.get(term.lesson)) || firstUse.get(term.id);
    if (lessonId) result.set(term.id, lessonId);
  }
  return result;
}
