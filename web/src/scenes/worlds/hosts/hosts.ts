/**
 * The hosts world (spec §4.2; the lesson «Modelo cliente-servidor»): your browser, a server far away,
 * a computer seen inside (its programs over the operating system and its ports), the terminal where
 * `nc -l 8080` listens, and your laptop with both. Its persistent state is what the reader has seen
 * happen: the address typed, port 8080 taken, the request and the response written in the terminal,
 * the browser waiting or showing the answer. Its markup is Hosts.astro; its labels, strings.ts.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';

export interface HostsState {
  /** The browser's address bar shows localhost:8080. */
  local: boolean;
  /** The server program has asked the operating system for port 8080. */
  listening: boolean;
  /** `nc -l 8080` typed in the terminal. */
  typed: boolean;
  /** The terminal shows the request that arrived, and the response written back. */
  requested: boolean;
  responded: boolean;
  /** The browser waits for an answer (its spinner), or shows it. */
  waiting: boolean;
  answered: boolean;
}

export const INITIAL: HostsState = {
  local: false,
  listening: false,
  typed: false,
  requested: false,
  responded: false,
  waiting: false,
  answered: false,
};

type D = Director<HostsState>;

/** The lines between actors that talk, whenever both are on stage. */
const LINKS: readonly (readonly [string, string])[] = [
  ['browser', 'server'],
  ['browser', 'machine'],
  ['browser', 'terminal'],
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

export const hosts: World<HostsState> = {
  id: 'hosts',
  views: {
    talk: ['browser', 'server'],
    roles: ['machine'],
    listen: ['browser', 'machine'],
    exchange: ['browser', 'terminal'],
    local: ['laptop'],
    nc: ['terminal', 'browser'],
  },
  zoom: { talk: 1.4, roles: 1.5, listen: 1.35, exchange: 1.3, local: 1.5, nc: 1.3 },

  reset() {},

  apply(root, s) {
    root.querySelector('#hs-url')?.classList.toggle('is-on', s.local);
    root.querySelector('#hs-spin')?.classList.toggle('is-on', s.waiting);
    root.querySelector('#hs-hello')?.classList.toggle('is-on', s.answered);
    root.querySelector('#hs-program')?.classList.toggle('is-listening', s.listening);
    root.querySelector('#hs-port')?.classList.toggle('is-on', s.listening);
    const cmd = root.querySelector('#hs-cmd');
    if (cmd) cmd.textContent = s.typed ? 'nc -l 8080' : '';
    root.querySelector('#hs-request')?.classList.toggle('is-on', s.requested);
    const response = root.querySelector<HTMLElement>('#hs-response');
    if (response) response.textContent = s.responded ? (response.dataset.full ?? '') : '';
  },

  wires(d) {
    for (const [a, b] of LINKS) {
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b));
    }
  },
};
