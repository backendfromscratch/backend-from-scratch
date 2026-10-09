/**
 * El esquema de la página (src/components/Outline.astro), sin DOM: el índice de Starlight como lista
 * plana y cuál es la sección actual.
 */

/** Lo que el esquema usa de cada entrada del índice de Starlight (route.toc.items). */
export interface TocEntry {
  depth: number;
  slug: string;
  text: string;
  children: readonly TocEntry[];
}

export interface OutlineItem {
  slug: string;
  text: string;
  /** La marca de Markdown del nivel: «#» para el título de la página, «##» y «###» para las secciones. */
  mark: string;
}

/** Starlight abre el índice con el título de la página (la «Sinopsis»), que enlaza a #_top. */
const PAGE_TITLE_SLUG = '_top';

export function flattenOutline(entries: readonly TocEntry[]): OutlineItem[] {
  return entries.flatMap((entry) => [
    {
      slug: entry.slug,
      text: entry.text,
      mark: entry.slug === PAGE_TITLE_SLUG ? '#' : '#'.repeat(entry.depth),
    },
    ...flattenOutline(entry.children),
  ]);
}

/** Un salto reciente a una sección del esquema: su posición en la lista y el alto de la ventana. */
export interface Jump {
  target: number;
  viewHeight: number;
}

/**
 * La sección actual: la última cuyo título ya ha subido hasta la línea de lectura (donde aterriza un
 * salto a un ancla, justo debajo de las pestañas fijas). Antes del primer título, la primera entrada.
 * Al final de la página los últimos títulos ya no pueden subir tanto: entonces manda la sección a la
 * que se acaba de saltar, si su título sigue a la vista, y si no, la última. Sin títulos, -1.
 */
export function currentSection(
  headingTops: readonly number[],
  readingLine: number,
  atBottom: boolean,
  jump?: Jump,
): number {
  if (headingTops.length === 0) return -1;
  if (atBottom) {
    if (jump) {
      const top = headingTops[jump.target];
      if (top !== undefined && top >= 0 && top < jump.viewHeight) return jump.target;
    }
    return headingTops.length - 1;
  }
  let current = 0;
  headingTops.forEach((top, index) => {
    if (top <= readingLine) current = index;
  });
  return current;
}
