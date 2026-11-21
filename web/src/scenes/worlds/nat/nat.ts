/**
 * The nat world (spec §4.2; the lesson «IP, puertos y sockets»): your laptop and its programs, your
 * phone, two laptops with the same private IP, your router and its NAT table, the internet's routers,
 * example.com and its sockets, the laptop's route table and the analogy's office building. Its
 * persistent state is what the reader has seen written: the NAT table's rows, example.com's sockets
 * and the front desk's note. Its markup is Nat.astro; its labels, strings.ts.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';

export interface NatState {
  /** Rows written in the router's NAT table. */
  nat: 0 | 1 | 2;
  /** example.com's sockets: the one that listens, then one per conversation. */
  sockets: 0 | 1 | 2 | 3;
  /** The front desk has written «61000 → office 3» in its notebook. */
  noted: boolean;
}

export const INITIAL: NatState = { nat: 0, sockets: 0, noted: false };

type D = Director<NatState>;

/** The lines between actors that talk, whenever both are on stage, in the order of the path. */
const LINKS: readonly (readonly [string, string])[] = [
  ['pc', 'gw'],
  ['mobile', 'gw'],
  ['gw', 'backbone'],
  ['backbone', 'ex'],
  ['gw', 'ex'],
];

/** From one actor (or part) to another, between their facing sides. */
export function route(d: D, from: string, to: string): Point[] {
  return facing(d.box(from), d.box(to));
}

function line(d: D, points: readonly Point[]): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(d.svg('path', { d: shape, class: 'scene-link' }));
}

export const nat: World<NatState> = {
  id: 'nat',
  views: {
    which: ['pc', 'twins', 'ex'],
    office: ['building'],
    addresses: ['pc', 'mobile', 'gw', 'ex'],
    translate: ['pc', 'gw', 'ex', 'table'],
    routing: ['routes', 'pc', 'gw', 'backbone', 'ex'],
    ports: ['ex', 'pc'],
    sockets: ['pc', 'mobile', 'gw', 'ex', 'table', 'sockets'],
  },
  zoom: {
    which: 1.35,
    office: 1.5,
    addresses: 1.3,
    translate: 1.3,
    routing: 1.25,
    ports: 1.4,
    sockets: 1.25,
  },

  reset() {},

  apply(root, s) {
    root.querySelector('#nt-nat-1')?.classList.toggle('is-on', s.nat >= 1);
    root.querySelector('#nt-nat-2')?.classList.toggle('is-on', s.nat >= 2);
    for (let i = 1; i <= 3; i++) {
      root.querySelector(`#nt-socket-${i}`)?.classList.toggle('is-on', s.sockets >= i);
    }
    root.querySelector('#nt-note')?.classList.toggle('is-on', s.noted);
  },

  wires(d) {
    // Through the internet's routers when they are on stage; straight from the router otherwise.
    for (const [a, b] of LINKS) {
      if (a === 'gw' && b === 'ex' && d.shown('backbone')) continue;
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b));
    }
  },
};
