/**
 * The apps world (spec §4.2; the lesson «Qué es el backend»): a concert ticket app on your phone and
 * other people's, the store's backend with its database and the services it uses, and a weather
 * backend with three frontends and your terminal. Its persistent state is what the reader has seen
 * happen: seat 14F picked and sold, the backend's checks, the frontends painted, the terminal's
 * command and answer. Its markup is Apps.astro; its labels, strings.ts.
 */
import type { Director } from '../../core/director';
import { facing, pointAt, zigzag } from '../../core/geometry';
import type { Box, Point, World } from '../../core/types';
import { strings, type SeatState } from './strings';

export interface AppsState {
  /** 14F on your phone: free, picked (you are buying it) or yours. */
  seat: 'free' | 'picked' | 'mine';
  /** 14F in the database; everyone else's map shows it taken once it is sold. */
  db: SeatState;
  /** How many of the backend's two checks have passed. */
  checks: 0 | 1 | 2;
  /** The three weather frontends have drawn the data. */
  painted: boolean;
  /** The terminal: the command typed, the answer back. */
  typed: boolean;
  answered: boolean;
}

export const INITIAL: AppsState = {
  seat: 'free',
  db: 'free',
  checks: 0,
  painted: false,
  typed: false,
  answered: false,
};

type D = Director<AppsState>;

/** The lines between actors that talk, drawn whenever both are on stage (dashed: the backend's own calls). */
const LINKS: readonly (readonly [string, string, 'dashed'?])[] = [
  ['phone', 'backend'],
  ['crowd', 'backend'],
  ['backend', 'db', 'dashed'],
  ['backend', 'pay', 'dashed'],
  ['backend', 'mail', 'dashed'],
  ['weather', 'web'],
  ['weather', 'ios'],
  ['weather', 'android'],
  ['terminal', 'weather'],
];

/** The internet's routers between your phone and the backend, when the internet is on stage. */
function hops(d: D): Point[] {
  const [phone, backend] = facing(d.box('phone'), d.box('backend'));
  return zigzag(phone, backend, 3);
}

/**
 * From one actor to another, between their facing sides; between your phone and the backend,
 * through the internet's routers when the internet is on stage.
 */
export function route(d: D, from: string, to: string): Point[] {
  const [a, b] = facing(d.box(from), d.box(to));
  const viaInternet =
    d.shown('internet') && [from, to].includes('phone') && [from, to].includes('backend');
  if (!viaInternet) return [a, b];
  const between = hops(d);
  return [a, ...(from === 'phone' ? between : [...between].reverse()), b];
}

/** A point above the middle of several actors (the full-stack bracket). */
export function above(
  d: D,
  names: readonly string[],
  gap: number,
): { left: number; right: number; y: number } {
  const boxes = names.map((name) => d.box(name));
  return {
    left: Math.min(...boxes.map((b) => b.x)),
    right: Math.max(...boxes.map((b) => b.x + b.w)),
    y: Math.min(...boxes.map((b) => b.y)) - gap,
  };
}

function line(d: D, points: readonly Point[], className: string): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(d.svg('path', { d: shape, class: className }));
}

/** Whether two boxes come closer than `gap` px. */
function overlaps(a: Box, b: Box, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

export const apps: World<AppsState> = {
  id: 'apps',
  views: {
    tickets: ['phone', 'backend', 'db', 'crowd'],
    where: ['phone', 'internet', 'backend'],
    weather: ['weather', 'web', 'ios', 'android'],
    purchase: ['phone', 'backend', 'db', 'pay', 'mail'],
    trust: ['phone', 'backend', 'pay'],
    stack: ['phone', 'backend', 'db'],
    curl: ['terminal', 'weather'],
  },
  zoom: {
    tickets: 1.4,
    where: 1.4,
    weather: 1.4,
    purchase: 1.35,
    trust: 1.4,
    stack: 1.4,
    curl: 1.4,
  },

  reset() {},

  apply(root, s, lang) {
    const t = strings[lang];
    const mine = root.querySelector('#ap-phone [data-seat="14F"]');
    mine?.classList.toggle('is-picked', s.seat === 'picked');
    mine?.classList.toggle('is-mine', s.seat === 'mine');
    root
      .querySelectorAll('.ap-crowd [data-seat="14F"]')
      .forEach((seat) => seat.classList.toggle('is-taken', s.db === 'sold'));
    const state = root.querySelector<HTMLElement>('#ap-db-state');
    if (state) {
      state.textContent = t.seat[s.db];
      state.dataset.state = s.db;
    }
    root.querySelector('#ap-check-1')?.classList.toggle('is-on', s.checks >= 1);
    root.querySelector('#ap-check-2')?.classList.toggle('is-on', s.checks >= 2);
    root
      .querySelectorAll('.ap-wx')
      .forEach((card) => card.classList.toggle('is-painted', s.painted));
    const curl = root.querySelector('#ap-curl');
    if (curl) curl.textContent = s.typed ? t.curl : '';
    root.querySelector('#ap-json')?.classList.toggle('is-on', s.answered);
  },

  wires(d) {
    const viaInternet = d.shown('internet') && d.shown('phone') && d.shown('backend');
    if (viaInternet) {
      const between = hops(d);
      line(d, route(d, 'phone', 'backend'), 'scene-link');
      for (const hop of between) {
        d.stage.links.append(
          d.svg('circle', {
            cx: hop.x.toFixed(1),
            cy: hop.y.toFixed(1),
            r: '4.5',
            class: 'scene-hop',
          }),
        );
      }
      // «internet», under its routers, unless it would touch a name (a narrow stage).
      d.stage.fx.querySelector('#ap-internet')?.remove();
      const label = document.createElement('span');
      label.className = 'scene-wire-label';
      label.id = 'ap-internet';
      label.textContent = strings[d.lang].internet;
      d.stage.fx.append(label);
      const placed = d.put(
        label,
        { x: pointAt(between, 0.5).x, y: Math.max(...between.map((hop) => hop.y)) },
        'below',
        10,
      );
      const names = ['phone', 'backend'].map((name) =>
        d.stage.actor(name)?.querySelector('.scene-label'),
      );
      if (names.some((name) => name && overlaps(placed, d.box(name), 6))) label.remove();
    }
    for (const [a, b, dashed] of LINKS) {
      if (viaInternet && a === 'phone' && b === 'backend') continue;
      if (!d.shown(a) || !d.shown(b)) continue;
      line(d, facing(d.box(a), d.box(b)), dashed ? 'scene-link scene-link--dashed' : 'scene-link');
    }
  },
};
