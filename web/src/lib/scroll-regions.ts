/**
 * Wide pieces of a lesson (tables, sequence and chain diagrams) scroll sideways when the text
 * column is narrower than they are, as on a phone.
 * A piece that scrolls must be reachable with the keyboard (WCAG 2.1.1, axe's
 * scrollable-region-focusable), so it gets tabindex="0" while it scrolls, as Expressive Code does
 * with code blocks. TwoColumnContent.astro applies it.
 */

/** What can scroll sideways in a lesson's text. */
export const SCROLL_REGIONS =
  '.sl-markdown-content > table, .sl-markdown-content figure.seq, .sl-markdown-content figure.chain';

/** Whether a box scrolls: its content is wider than the box (a pixel of rounding is not scrolling). */
export function scrolls(box: { scrollWidth: number; clientWidth: number }): boolean {
  return box.scrollWidth > box.clientWidth + 1;
}
