/** Which part of the text is being read: the one whose cue has reached the reading line. */

/** The index of the last cue whose top has reached the line; the first one if none has. */
export function activeCue(tops: readonly number[], line: number): number {
  let active = 0;
  tops.forEach((top, index) => {
    if (top <= line) active = index;
  });
  return active;
}

/**
 * Where the reading line is, in pixels from the top of the window: at 42% on a computer; on a
 * phone, where the scene sticks at the top, 30% of the way down the space left under it.
 */
export function readingLine(viewportHeight: number, stageBottom: number | null): number {
  if (stageBottom === null) return viewportHeight * 0.42;
  return stageBottom + (viewportHeight - stageBottom) * 0.3;
}
