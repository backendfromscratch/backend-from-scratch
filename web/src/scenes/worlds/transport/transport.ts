/**
 * The transport world (spec §4.2; the lesson «TCP frente a UDP»): a client and a server with their
 * TCP states, the client's copy of what the server hasn't acknowledged, what the server's application
 * has read and what it holds back, the text's table of uses and the three ports of the last exercise.
 * Its persistent state is what the reader has seen happen: the connection's states, the copies kept,
 * the bytes delivered, the segment held, the probes' results. Its markup is Transport.astro; its
 * labels and segments, strings.ts.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Locale, Point, World } from '../../core/types';
import { strings } from './strings';

type TcpState = 'none' | 'listen' | 'syn-sent' | 'syn-received' | 'established';

export interface TransportState {
  client: TcpState;
  server: TcpState;
  /** The segments (0 to 2) the client keeps a copy of until the server acknowledges them. */
  unacked: readonly (0 | 1 | 2)[];
  /** What the server's application has read: the first 0 to 3 segments, or UDP's two datagrams. */
  app: 0 | 1 | 2 | 3 | 'udp';
  /** The server holds the third segment back, waiting for the second. */
  held: boolean;
  /** How many of the three `nc -vz` probes have answered. */
  results: 0 | 1 | 2 | 3;
}

export const INITIAL: TransportState = {
  client: 'none',
  server: 'none',
  unacked: [],
  app: 0,
  held: false,
  results: 0,
};

type D = Director<TransportState>;

const STATE: Record<TcpState, string> = {
  none: '',
  listen: 'LISTEN',
  'syn-sent': 'SYN_SENT',
  'syn-received': 'SYN_RECEIVED',
  established: 'ESTABLISHED',
};

/** `nc`'s own words for the three probes (lesson output, the same in both languages). */
const RESULTS = ['succeeded!', 'Connection refused', 'Operation timed out'] as const;

/** A piece of text between each language's quotation marks: «…» in Spanish, “…” in English. */
export function quote(lang: Locale, text: string): string {
  return lang === 'es' ? `«${text}»` : `“${text}”`;
}

/** What the application has read, in the language's own segments. */
export function delivered(lang: Locale, app: TransportState['app']): string {
  const [a, b, c] = strings[lang].segments;
  if (app === 'udp') return a.text + c.text;
  return [a, b, c]
    .slice(0, app)
    .map((segment) => segment.text)
    .join('');
}

/** The client's copy of the segments still waiting for their ACK, in the language's own words. */
export function copies(lang: Locale, unacked: TransportState['unacked']): string {
  return unacked.map((i) => strings[lang].segments[i].text).join('');
}

/**
 * From one actor (or part) to another, between their facing sides. `lane` moves the line up (-1)
 * or down (1) by a quarter of the shorter box, so the handshake's three messages, or the data and
 * its ACKs, each keep their own line between the client and the server.
 */
export function route(d: D, from: string, to: string, lane = 0): Point[] {
  const a = d.box(from);
  const b = d.box(to);
  const dy = lane * Math.min(a.h, b.h) * 0.27;
  return facing(a, b).map((p) => ({ x: p.x, y: p.y + dy }));
}

function line(d: D, points: readonly Point[]): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(d.svg('path', { d: shape, class: 'scene-link' }));
}

export const transport: World<TransportState> = {
  id: 'transport',
  views: {
    pair: ['client', 'server'],
    uses: ['uses'],
    probe: ['client', 'targets'],
  },
  zoom: { pair: 1.75, uses: 1.75, probe: 1.6 },

  reset() {},

  apply(root, s, lang) {
    const client = root.querySelector('#tp-c-state');
    if (client) client.textContent = STATE[s.client];
    const server = root.querySelector('#tp-s-state');
    if (server) server.textContent = STATE[s.server];
    // With no connection (UDP, or nc's probes) there is nothing to acknowledge: the row keeps its room, hidden.
    root.querySelector('#tp-unacked')?.classList.toggle('is-on', s.client !== 'none');
    const copy = root.querySelector('#tp-copy');
    if (copy) copy.textContent = s.unacked.length ? quote(lang, copies(lang, s.unacked)) : '';
    const app = root.querySelector('#tp-app');
    const read = delivered(lang, s.app);
    if (app) app.textContent = read ? quote(lang, read) : '';
    root.querySelector('#tp-held')?.classList.toggle('is-on', s.held);
    RESULTS.forEach((result, i) => {
      const cell = root.querySelector(`#tp-r-${i + 1}`);
      if (cell) cell.textContent = s.results > i ? result : '';
    });
  },

  wires(d) {
    if (d.shown('client') && d.shown('server')) line(d, route(d, 'client', 'server'));
    if (d.shown('client') && d.shown('targets')) {
      for (const i of [1, 2, 3]) line(d, route(d, 'client', `#tp-t-${i}`));
    }
  },
};
