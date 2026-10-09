/**
 * The text of a region announced by screen readers (aria-live). If the message equals the
 * previous one (two errors or two notices in a row), it would not change and would not be announced: each attempt alternates
 * a trailing non-breaking space, which is invisible. Used by the labs.
 */
export function liveText(message: string, attempt: number): string {
  return attempt % 2 === 0 ? message : `${message}\u00A0`;
}
