/**
 * The page outline (src/components/Outline.astro), without a DOM: Starlight's table of contents as a flat
 * list and which section is the current one.
 */

/** What the outline uses from each Starlight table-of-contents entry (route.toc.items). */
export interface TocEntry {
  depth: number;
  slug: string;
  text: string;
  children: readonly TocEntry[];
}

export interface OutlineItem {
  slug: string;
  text: string;
  /** The level's Markdown marker: «#» for the page title, «##» and «###» for sections. */
  mark: string;
}

/** Starlight opens the table of contents with the page title (the «Sinopsis»), which links to #_top. */
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

/** A recent jump to an outline section: its position in the list and the window height. */
export interface Jump {
  target: number;
  viewHeight: number;
}

/**
 * The current section: the last one whose heading has already scrolled up to the reading line (where an
 * anchor jump lands, just below the pinned tabs). Before the first heading, the first entry.
 * At the end of the page the last headings can no longer scroll up that far: then the section just
 * jumped to wins, if its heading is still in view, and otherwise the last one. Without headings, -1.
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
