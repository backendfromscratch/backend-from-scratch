/** The line between the scene and the text: how far it can go, and what it says to a screen reader. */

export interface SplitLimits {
  /** The narrowest text, in pixels. */
  min: number;
  /** The widest text, in pixels. */
  max: number;
}

/** The text never goes under 21rem and the scene never under 22rem. `total` is scene plus text. */
export function splitLimits(total: number, rem: number): SplitLimits {
  const min = 21 * rem;
  return { min, max: Math.max(min, total - 22 * rem) };
}

export function clampText(px: number, limits: SplitLimits): number {
  return Math.round(Math.max(limits.min, Math.min(limits.max, px)));
}

/** The text's share of the width, in percent: the separator's aria-valuenow, -valuemin and -valuemax. */
export function splitValues(
  text: number,
  total: number,
  limits: SplitLimits,
): { now: number; scene: number; min: number; max: number } {
  const pct = (px: number) => Math.round((px / (total || 1)) * 100);
  const now = pct(text);
  return { now, scene: 100 - now, min: pct(limits.min), max: pct(limits.max) };
}
