/**
 * The layers world (spec §4.2; the lesson «El modelo TCP/IP»): your laptop and the server as stacks
 * of the four layers, the routers between them, the message and its envelopes, the analogy's
 * letter, OSI and the lesson's `curl -sv` output. Its persistent state is how many envelopes the
 * message wears and how much of the letter's envelope is written. Its markup is Layers.astro.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';
import { strings, type Layer } from './strings';

export interface LayersState {
  /** The envelopes around the HTTP message: 0 none, 1 TCP, 2 and IP, 3 and Ethernet with its trailer. */
  wrap: 0 | 1 | 2 | 3;
  /** The letter's envelope: 0 the letter alone, 1 with the name, 2 with the address too. */
  sealed: 0 | 1 | 2;
}

export const INITIAL: LayersState = { wrap: 0, sealed: 0 };

type D = Director<LayersState>;

/** The unit each envelope count is called by (the lesson's words). */
const UNIT: readonly Layer[] = ['app', 'transport', 'network', 'link'];

/** The stacks in the order the hops go, for the lines between them. */
const CHAIN = ['mine', 'gateway', 'isp', 'theirs'] as const;

/** From one part to another, between their facing sides. */
export function route(d: D, from: string, to: string): Point[] {
  return facing(d.box(from), d.box(to));
}

/** A layer's row in a stack: `#ly-mine-link`. */
export const row = (stack: string, layer: Layer) => `#ly-${stack}-${layer}`;

function line(d: D, points: readonly Point[], dashed = false): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(
    d.svg('path', { d: shape, class: dashed ? 'scene-link scene-link--dashed' : 'scene-link' }),
  );
}

export const layers: World<LayersState> = {
  id: 'layers',
  views: {
    four: ['mine', 'theirs'],
    wrapping: ['wrap', 'mine', 'theirs'],
    hops: ['mine', 'gateway', 'isp', 'theirs'],
    letter: ['letter'],
    osi: ['osi'],
    curl: ['curl', 'mine'],
  },
  zoom: { four: 1.4, wrapping: 1.35, hops: 1.35, letter: 1.6, osi: 1.5, curl: 1.3 },

  reset() {},

  apply(root, s, lang) {
    root
      .querySelectorAll<HTMLElement>('.ly-block[data-wrap]')
      .forEach((block) => block.classList.toggle('is-on', s.wrap >= Number(block.dataset.wrap)));
    const unit = root.querySelector('#ly-unit');
    if (unit) unit.textContent = strings[lang].unit[UNIT[s.wrap]!];
    root.querySelector('#ly-name')?.classList.toggle('is-on', s.sealed >= 1);
    root.querySelector('#ly-address')?.classList.toggle('is-on', s.sealed >= 2);
  },

  wires(d) {
    // The real path: the link layers of the stacks next to each other, in the order of the hops.
    const shown = CHAIN.filter((name) => d.shown(name));
    for (let i = 1; i < shown.length; i++) {
      line(d, route(d, row(shown[i - 1]!, 'link'), row(shown[i]!, 'link')));
    }
  },
};
