/**
 * The minimap (src/components/Minimap.astro), without a DOM. Like VS Code's in its default mode
 * («proportional»): each word on the page is a stroke, at a fixed scale that makes the
 * content fit the width. If the drawing is taller than the minimap, the minimap slides along with
 * the page. A rectangle marks what is visible; on click, the page jumps there, and on drag,
 * the rectangle follows the pointer.
 */
export type WordKind = 'heading' | 'code' | 'text';

/** A word measured on the page: position in document px (x from the content edge). */
export interface Word {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: WordKind;
}

/** A minimap stroke, in minimap px. */
export type Stroke = Word;

/** With narrow content, the minimap does not draw giant words. */
export const MAX_SCALE = 0.2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The drawing scale: the content fits the minimap's width, and the same scale is used for the height. */
export function proportionalScale(contentWidth: number, mapWidth: number): number {
  if (contentWidth <= 0 || mapWidth <= 0) return 0;
  return Math.min(MAX_SCALE, mapWidth / contentWidth);
}

/**
 * How far the minimap has slid (minimap px): nothing if the drawing fits; otherwise, in proportion
 * to how far the page has scrolled, so the top shows the start and the bottom the end.
 */
export function mapOffset(
  scrollY: number,
  viewHeight: number,
  docHeight: number,
  scale: number,
  mapHeight: number,
): number {
  const overflow = docHeight * scale - mapHeight;
  const scrollable = docHeight - viewHeight;
  if (overflow <= 0 || scrollable <= 0) return 0;
  return clamp(scrollY / scrollable, 0, 1) * overflow;
}

export function viewportRect(
  scrollY: number,
  viewHeight: number,
  scale: number,
  offset = 0,
): { top: number; height: number } {
  return { top: scrollY * scale - offset, height: viewHeight * scale };
}

/**
 * Where to scroll the page when clicking at `mapY` (px from the top of the minimap, which has slid
 * `offset`): that point, centered.
 */
export function scrollTargetFor(
  mapY: number,
  scale: number,
  viewHeight: number,
  docHeight: number,
  offset = 0,
): number {
  if (scale <= 0) return 0;
  return clamp((mapY + offset) / scale - viewHeight / 2, 0, Math.max(0, docHeight - viewHeight));
}

/**
 * Where to scroll the page when dragging the rectangle `deltaY` px since it was pressed with the page
 * at `startScroll`. As with a scrollbar: the rectangle follows the pointer. If the minimap
 * slides, the rectangle travels its height (minus its own) while the page goes from top to bottom.
 */
export function dragScroll(
  startScroll: number,
  deltaY: number,
  scale: number,
  viewHeight: number,
  docHeight: number,
  mapHeight: number,
): number {
  const scrollable = docHeight - viewHeight;
  if (scale <= 0 || scrollable <= 0) return clamp(startScroll, 0, Math.max(0, scrollable));
  const overflows = docHeight * scale > mapHeight;
  const track = overflows ? mapHeight - viewHeight * scale : scrollable * scale;
  if (track <= 0) return clamp(startScroll, 0, scrollable);
  return clamp(startScroll + (deltaY * scrollable) / track, 0, scrollable);
}

/** The words, at scale. What is not visible is not drawn; what is visible is at least 1 px. */
export function layoutStrokes(words: readonly Word[], scale: number): Stroke[] {
  return words
    .filter((word) => word.width > 0 && word.height > 0)
    .map((word) => ({
      x: word.x * scale,
      y: word.y * scale,
      width: Math.max(1, word.width * scale),
      height: Math.max(1, word.height * scale),
      kind: word.kind,
    }));
}

const HEADING = /^(h[1-6]|dt)$/;

/**
 * The color of a word, depending on where it is: `ancestors` goes from the containing element outward,
 * and the closest one that is code or a heading wins. Code is what is in `pre`, in `code` or in an
 * Expressive Code block; the explanation of a «Pruébalo» is text.
 */
export function wordKind(
  ancestors: readonly { tagName: string; classList: Iterable<string> }[],
): WordKind {
  for (const { tagName, classList } of ancestors) {
    const tag = tagName.toLowerCase();
    const classes = [...classList];
    if (tag === 'pre' || tag === 'code' || classes.includes('expressive-code')) return 'code';
    if (HEADING.test(tag) || classes.includes('sl-heading-wrapper')) return 'heading';
  }
  return 'text';
}
