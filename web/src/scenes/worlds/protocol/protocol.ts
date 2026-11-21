/**
 * The protocol world (spec §4.2; the lesson «Qué es un protocolo»): Chrome, your terminal,
 * example.com, the written rules and the programs that follow them, and a list of protocols. Its
 * persistent state is the terminal's last run and whether Chrome shows the answer. Its markup is
 * Protocol.astro; its labels and the terminal's runs, strings.ts.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';
import { strings, type Run } from './strings';

export interface ProtocolState {
  /** The terminal's last run: its command and what came back. */
  run: Run;
  /** Chrome shows the answer the terminal sent. */
  hello: boolean;
}

export const INITIAL: ProtocolState = { run: 'none', hello: false };

type D = Director<ProtocolState>;

const LINKS: readonly (readonly [string, string])[] = [
  ['console', 'chrome'],
  ['chrome', 'site'],
  ['console', 'site'],
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

export const protocol: World<ProtocolState> = {
  id: 'protocol',
  views: {
    agree: ['console', 'rfc', 'chrome'],
    decide: ['chrome', 'site'],
    anatomy: ['console', 'site'],
    written: ['rfc', 'impls'],
    many: ['stack'],
  },
  zoom: { agree: 1.3, decide: 1.4, anatomy: 1.3, written: 1.5, many: 1.2 },

  reset() {},

  apply(root, s, lang) {
    const t = strings[lang];
    const cmd = root.querySelector('#pr-cmd');
    if (cmd) cmd.textContent = t.cmd[s.run];
    const out = root.querySelector('#pr-out');
    if (out) out.textContent = t.out[s.run];
    root.querySelector('#pr-hello')?.classList.toggle('is-on', s.hello);
  },

  wires(d) {
    // In the agreement view the terminal and Chrome talk past the rules between them: no line.
    if (d.shown('rfc')) return;
    for (const [a, b] of LINKS) {
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b));
    }
  },
};
