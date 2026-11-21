/** The scenes' pace: how long a caption stays, the speeds, and milliseconds as the lesson writes them. */
import type { Locale, Size } from './types';

/** How long a caption stays before the next one: 800 ms plus 240 ms per word, at most 5 s. */
export function readTime(html: string): number {
  const words = html
    .replace(/<[^>]*>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.min(5000, 800 + words * 240);
}

/** The speeds the reader can choose: how many milliseconds of scene go by per real millisecond. */
export const SPEEDS = { slow: 0.6, normal: 1, fast: 1.6 } as const;
export type Speed = keyof typeof SPEEDS;

export function isSpeed(value: unknown): value is Speed {
  return typeof value === 'string' && value in SPEEDS;
}

/** What the speed button changes to: normal, then slow, then fast, then normal again. */
export function nextSpeed(speed: Speed): Speed {
  if (speed === 'normal') return 'slow';
  if (speed === 'slow') return 'fast';
  return 'normal';
}

/** «0 ms», «<1 ms», «74 ms» or «1,07 s» (with a full stop in English). */
export function formatMs(ms: number, locale: Locale): string {
  if (ms <= 0) return '0 ms';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${locale === 'es' ? seconds.replace('.', ',') : seconds} s`;
}

/**
 * Whether a change of the stage's size is too small to redraw the scene for: a late font or a
 * scrollbar must not cut a scene short (a bug found in the prototype).
 */
export function smallResize(previous: Size, next: Size): boolean {
  return Math.abs(next.w - previous.w) < 4 && Math.abs(next.h - previous.h) < 16;
}
