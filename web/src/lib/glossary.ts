import type { Locale } from './locales';

/** Id de una entrada en la colección: "<idioma>/<id-del-término>", p. ej. "es/port". */
export function glossaryEntryId(locale: Locale, termId: string): string {
  return `${locale}/${termId}`;
}

/** Inverso de glossaryEntryId: "es/port" → "port". */
export function termIdFromEntryId(entryId: string): string {
  const separator = entryId.indexOf('/');
  if (separator === -1) throw new Error(`[glossary] Id sin idioma: "${entryId}"`);
  return entryId.slice(separator + 1);
}

/** Ordena alfabéticamente con las reglas del idioma (Intl.Collator), sin modificar la lista original. */
export function sortGlossary<T extends { data: { term: string } }>(
  entries: readonly T[],
  locale: Locale,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  return [...entries].sort((a, b) => collator.compare(a.data.term, b.data.term));
}

/**
 * El id del popover de un <Term>: el término y cuántas veces ha salido ya en la página
 * («term-port», «term-port-2»…). Así el HTML es el mismo en cada build. `seen` es de la página.
 */
export function termPopoverId(seen: Map<string, number>, termId: string): string {
  const count = (seen.get(termId) ?? 0) + 1;
  seen.set(termId, count);
  return count === 1 ? `term-${termId}` : `term-${termId}-${count}`;
}

const seenByPage = new WeakMap<object, Map<string, number>>();

/**
 * Los términos que ya han salido en una página. `page` es un objeto que es uno por página (en
 * Term.astro, Astro.locals): el frontmatter de un componente se ejecuta de nuevo con cada <Term>, así
 * que la cuenta tiene que vivir aquí, en el módulo.
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
 * La lección que explica cada término (id del término → id de la lección). Si el término dice cuál
 * (`lesson`, la translationKey de la lección), esa: el primer uso no siempre es la explicación
 * («puerto» sale en cliente-servidor, pero se explica en la de IP y puertos). Si no, la primera del
 * curso que lo usa con <Term id="…">. `lessons` llega en el orden del curso, con las introducciones
 * de fase, su translationKey y su texto MDX; cada texto se recorre una sola vez.
 *
 * Una `lesson` que no está en este idioma pero sí en otro (aún sin traducir) vuelve al primer uso;
 * una que no está en `knownKeys` (las translationKey de todos los idiomas) es una errata: error.
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
        `[glossary] "${term.id}" dice que lo explica la lección "${term.lesson}", que no existe`,
      );
    }
    const lessonId = (term.lesson && byKey.get(term.lesson)) || firstUse.get(term.id);
    if (lessonId) result.set(term.id, lessonId);
  }
  return result;
}
