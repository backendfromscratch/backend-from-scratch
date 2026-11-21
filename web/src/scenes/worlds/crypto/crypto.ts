/**
 * The crypto world (spec §4.2; the lesson «TLS y HTTPS»): your browser and the server, someone on
 * the café's wifi between them, the three needs, the analogy's padlocks, seal and ID, a key pair,
 * the certificate chain with the browser's three checks, what HTTPS leaves visible and the
 * badssl.com sites. Its persistent state is what the reader has seen happen: the needs named, what
 * the wifi showed, the box locked and the letter sealed, the keys each end holds, the certificate
 * checked, the key pair's steps and each check's result. Its markup is Crypto.astro; its labels,
 * strings.ts.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';
import { strings, type Sight } from './strings';

type Mark = '' | 'ok' | 'ko';

export interface CryptoState {
  /** How many of the three needs the reader has seen. */
  needs: 0 | 1 | 2 | 3;
  /** What the person on the wifi saw go past last. */
  sees: Sight;
  /** The analogy: the box locked with your padlock, the letter sealed, the ID stamped. */
  lock: boolean;
  sealed: boolean;
  stamped: boolean;
  /** Both ends hold the same secret key. */
  keys: boolean;
  /** The browser checked the server's certificate. */
  cert: boolean;
  /** The key pair's steps: encrypted, decrypted, signed, checked. */
  pair: 0 | 1 | 2 | 3 | 4;
  /** The browser's three checks: chain, name and dates. */
  checks: readonly [Mark, Mark, Mark];
  /** How many of the four sites have been tried. */
  tried: 0 | 1 | 2 | 3 | 4;
}

export const INITIAL: CryptoState = {
  needs: 0,
  sees: 'none',
  lock: false,
  sealed: false,
  stamped: false,
  keys: false,
  cert: false,
  pair: 0,
  checks: ['', '', ''],
  tried: 0,
};

/**
 * Each site's checks (chain, name, dates), as the lesson tells them: example.com passes the three;
 * each badssl.com site fails one, and only that one is marked.
 */
export const SITES: readonly (readonly [Mark, Mark, Mark])[] = [
  ['ok', 'ok', 'ok'],
  ['', '', 'ko'],
  ['', 'ko', ''],
  ['ko', '', ''],
];

const MARK: Record<Mark, string> = { '': '', ok: '✓', ko: '✗' };

type D = Director<CryptoState>;

/** From one actor to another, between their facing sides; `lane` moves the line up (-1) or down (1). */
export function route(d: D, from: string, to: string, lane = 0): Point[] {
  const a = d.box(from);
  const b = d.box(to);
  const dy = lane * Math.min(a.h, b.h) * 0.27;
  return facing(a, b).map((p) => ({ x: p.x, y: p.y + dy }));
}

/** Through the café's wifi: from one end down past the person listening, and up to the other end. */
export function viaWifi(d: D, from: 'browser' | 'server'): Point[] {
  const browser = d.pt('browser', 'r');
  const server = d.pt('server', 'l');
  const eve = d.pt('eve', 't', 0, -6);
  return from === 'browser' ? [browser, eve, server] : [server, eve, browser];
}

function line(d: D, points: readonly Point[], dashed = false): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(
    d.svg('path', { d: shape, class: dashed ? 'scene-link scene-link--dashed' : 'scene-link' }),
  );
}

const on = (root: ParentNode, selector: string, value: boolean) =>
  root.querySelector(selector)?.classList.toggle('is-on', value);
const mark = (root: ParentNode, selector: string, value: Mark) => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.textContent = MARK[value];
  element.dataset.mark = value;
};

export const cryptoWorld: World<CryptoState> = {
  id: 'crypto',
  views: {
    cafe: ['browser', 'eve', 'server', 'needs'],
    analogy: ['lockbox', 'seal', 'idcard'],
    sym: ['browser', 'eve', 'server'],
    pair: ['keypair'],
    tls: ['browser', 'server'],
    chain: ['chain', 'checks'],
    visible: ['browser', 'eve', 'server', 'seen'],
    bad: ['sites'],
  },
  zoom: {
    cafe: 1.5,
    analogy: 1.5,
    sym: 1.5,
    pair: 1.6,
    tls: 1.75,
    chain: 1.6,
    visible: 1.5,
    bad: 1.6,
  },

  reset() {},

  apply(root, s, lang) {
    on(root, '#cr-b-key', s.keys);
    on(root, '#cr-s-key', s.keys);
    on(root, '#cr-b-cert', s.cert);
    const sees = root.querySelector<HTMLElement>('#cr-sees');
    if (sees) {
      sees.textContent = strings[lang].sights[s.sees];
      sees.dataset.sight = s.sees;
    }
    for (const i of [1, 2, 3]) on(root, `#cr-need-${i}`, s.needs >= i);
    on(root, '#cr-box-lock', s.lock);
    on(root, '#cr-seal', s.sealed);
    on(root, '#cr-id-stamp', s.stamped);
    on(root, '#cr-p-1', s.pair >= 1);
    on(root, '#cr-pk-2', s.pair >= 2);
    on(root, '#cr-p-2', s.pair >= 2);
    on(root, '#cr-p-3', s.pair >= 3);
    on(root, '#cr-pk-4', s.pair >= 4);
    on(root, '#cr-p-4', s.pair >= 4);
    s.checks.forEach((value, i) => mark(root, `#cr-k-m-${i + 1}`, value));
    SITES.forEach((marks, row) =>
      marks.forEach((value, i) =>
        mark(root, `#cr-sm-${row + 1}-${i + 1}`, s.tried > row ? value : ''),
      ),
    );
  },

  wires(d) {
    if (d.shown('eve')) {
      line(d, viaWifi(d, 'browser'), true);
    } else if (d.shown('browser') && d.shown('server')) {
      line(d, route(d, 'browser', 'server'));
    }
    if (d.shown('chain')) {
      line(d, [d.pt('#cr-c-root', 'b'), d.pt('#cr-c-int', 't')]);
      line(d, [d.pt('#cr-c-int', 'b'), d.pt('#cr-c-site', 't')]);
    }
  },
};
