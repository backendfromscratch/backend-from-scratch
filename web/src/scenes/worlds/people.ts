/**
 * A person on stage: a bust in profile, drawn in SVG (the only kind of shape HTML cannot draw). The
 * colours are theme.css's decorative tokens (--ide-skin-*, --ide-hair-*), the same in both themes.
 * Skin tones vary between people on purpose.
 */

export interface PersonOptions {
  /** The SVG's id; the head is `<id>-head` and, with a phone, the phone is `<id>-phone`. */
  id: string;
  skin: 'a' | 'b';
  hair: 'a' | 'b';
  shirt: 'info' | 'keyword';
  facing?: 'left' | 'right';
  /** Holding a phone to the ear. */
  phone?: boolean;
  /** An arm reaching forward to type. */
  typing?: boolean;
  /** A shop apron. */
  apron?: boolean;
  /** A round plate behind, like an avatar. */
  plate?: boolean;
  hairStyle?: 1 | 2;
}

const HAIR = {
  1: 'M28 42 C25 21 38 13 53 14 C67 15 75 25 72 36 C63 29 49 28 39 33 C34 36 31 40 30 47 Z',
  2: 'M27 45 C21 22 37 11 53 12 C70 13 78 26 74 41 C71 33 65 28 57 27 C46 26 36 31 31 39 Z',
} as const;

export function personSVG(o: PersonOptions): string {
  const mirror = o.facing === 'left' ? ' transform="translate(100 0) scale(-1 1)"' : '';
  const colours = `--skin:var(--ide-skin-${o.skin});--hair:var(--ide-hair-${o.hair});--shirt:var(--ide-${o.shirt})`;
  return [
    `<svg class="person" id="${o.id}" viewBox="0 0 100 112" aria-hidden="true" style="${colours}">`,
    o.plate ? '<circle class="person__plate" cx="50" cy="58" r="52"/>' : '',
    `<g${mirror}>`,
    '<path class="person__shirt" d="M15 112 C15 85 29 73 50 73 C71 73 85 85 85 112 Z"/>',
    o.apron ? '<path class="person__apron" d="M37 84 H63 V112 H37 Z"/>' : '',
    '<rect class="person__skin" x="43" y="55" width="14" height="20" rx="6"/>',
    `<circle class="person__skin" id="${o.id}-head" cx="50" cy="40" r="22"/>`,
    `<path class="person__hair" d="${HAIR[o.hairStyle ?? 1]}"/>`,
    '<circle class="person__eye" cx="61" cy="40" r="2.5"/>',
    '<path class="person__mouth" d="M58 50.5 q5 3.5 10 0"/>',
    o.phone
      ? `<path class="person__arm" d="M72 104 C86 92 84 70 75 59"/><rect class="person__phone" id="${o.id}-phone" x="66" y="33" width="10" height="20" rx="3"/><circle class="person__skin" cx="73" cy="55" r="5.5"/>`
      : '',
    o.typing
      ? '<g class="person__typing"><path class="person__arm" d="M70 92 C82 96 92 96 100 93"/><circle class="person__skin" cx="100" cy="93" r="5.5"/></g>'
      : '',
    '</g></svg>',
  ].join('');
}
