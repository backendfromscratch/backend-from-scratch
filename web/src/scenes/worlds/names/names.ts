/**
 * The names world (spec §4.2; the lesson «DNS»): HOSTS.TXT and its copies, the hotel of the analogy,
 * the tree of names, a query from your computer through the resolver to the root, `.com` and
 * example.com's servers, the text's table of records, a domain whose address changes while a cache
 * keeps the old one, and `dig` in a terminal with your resolver's copy. Its persistent state is what the reader has seen
 * happen: the file's versions, the notebook, what each cache keeps and for how long, the servers'
 * answer and the terminal's runs. Its markup is Names.astro; its labels, strings.ts.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';

/** The changing domain's two addresses, documentation ones (RFC 5737): before and after. */
export const ADDRESS = { old: '192.0.2.10', new: '198.51.100.20' } as const;
type Address = keyof typeof ADDRESS;

export interface NamesState {
  /** HOSTS.TXT's version, and the version each of three computers has copied. */
  file: number;
  copies: readonly [number, number, number];
  /** The front desk wrote the shop's address in its notebook. */
  book: boolean;
  /** The resolver's cache in a query: empty, `.com`'s servers, or those and example.com's address. */
  walk: 0 | 1 | 2;
  /** Seconds left on the resolver's copy of example.com's address. */
  left: number;
  /** The changing domain's address on its own server, in your resolver's copy and in the other's. */
  owner: Address;
  mine: Address;
  mineLeft: number;
  other: Address | null;
  /** The `dig` runs shown in the terminal. */
  runs: 0 | 1 | 2;
}

export const INITIAL: NamesState = {
  file: 1,
  copies: [1, 1, 1],
  book: false,
  walk: 0,
  left: 300,
  owner: 'old',
  mine: 'old',
  mineLeft: 300,
  other: null,
  runs: 0,
};

/** The terminal's two runs, as the lesson's last exercise prints them (one line of each). */
export const RUNS = [
  'example.com. 294 IN A 104.20.23.154',
  'example.com. 288 IN A 172.66.147.243',
] as const;

type D = Director<NamesState>;

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

/** The tree's branches: from each node's bottom to its children's top. */
const BRANCHES = [
  ['root', 'com'],
  ['root', 'es'],
  ['root', 'org'],
  ['root', 'dev'],
  ['com', 'example'],
  ['example', 'www'],
] as const;

const on = (root: ParentNode, selector: string, value: boolean) =>
  root.querySelector(selector)?.classList.toggle('is-on', value);
const text = (root: ParentNode, selector: string, value: string) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
};

export const names: World<NamesState> = {
  id: 'names',
  views: {
    hosts: ['hostsfile', 'copies'],
    hotel: ['desk', 'offices'],
    tree: ['tree'],
    walk: ['pc', 'resolver', 'root', 'tld', 'auth'],
    zone: ['zone'],
    ttl: ['pc', 'mine', 'other', 'owner'],
    dig: ['term', 'copy'],
  },
  zoom: { hosts: 1.6, hotel: 1.5, tree: 1.6, walk: 1.5, zone: 1.6, ttl: 1.5, dig: 1.5 },

  reset() {},

  apply(root, s) {
    text(root, '#nm-file-v', `v${s.file}`);
    s.copies.forEach((version, i) => {
      text(root, `#nm-copy-v-${i + 1}`, `v${version}`);
      root.querySelector(`#nm-copy-${i + 1}`)?.classList.toggle('is-old', version < s.file);
    });
    on(root, '#nm-book-entry', s.book);
    on(root, '#nm-c-empty', s.walk === 0);
    on(root, '#nm-c-1', s.walk >= 1);
    on(root, '#nm-c-2', s.walk >= 2);
    text(root, '#nm-c-2-ttl', String(s.left));
    text(root, '#nm-d-ttl', String(s.left));
    text(root, '#nm-owner-value', ADDRESS[s.owner]);
    on(root, '#nm-mine-empty', false);
    on(root, '#nm-mine-row', true);
    text(root, '#nm-mine-value', `A ${ADDRESS[s.mine]} · ${s.mineLeft} s`);
    root.querySelector('#nm-mine-row')?.classList.toggle('is-old', s.mine !== s.owner);
    on(root, '#nm-other-empty', s.other === null);
    on(root, '#nm-other-row', s.other !== null);
    text(root, '#nm-other-value', s.other ? `A ${ADDRESS[s.other]} · 300 s` : '');
    RUNS.forEach((run, i) => {
      on(root, `#nm-cmd-${i + 1}`, s.runs > i);
      text(root, `#nm-out-${i + 1}`, s.runs > i ? run : '');
    });
  },

  wires(d) {
    if (d.shown('hostsfile') && d.shown('copies')) {
      for (const i of [1, 2, 3]) line(d, route(d, 'hostsfile', `#nm-copy-${i}`));
    }
    if (d.shown('tree')) {
      for (const [from, to] of BRANCHES) {
        line(d, [d.pt(`#nm-t-${from}`, 'b'), d.pt(`#nm-t-${to}`, 't')]);
      }
    }
    const link = (a: string, b: string) => {
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b));
    };
    link('pc', 'resolver');
    for (const server of ['root', 'tld', 'auth']) link('resolver', server);
    link('pc', 'mine');
    link('mine', 'owner');
    link('other', 'owner');
    link('term', 'copy');
  },
};
