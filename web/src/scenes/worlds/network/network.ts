/**
 * The network world (spec §4.2): you at a laptop, the browser, your router, the internet, the DNS
 * resolver and servers, and the web server. Its persistent state is what the reader has seen happen
 * so far: the URL typed, the IP known, the connection open and encrypted, the page painted, and the
 * time bar's clock. Its markup is Network.astro and TimeBar.astro; its labels, strings.ts.
 */
import type { Director } from '../../core/director';
import { elbow, facing, pointAt, zigzag } from '../../core/geometry';
import { icons } from '../../core/icons';
import { formatMs } from '../../core/timing';
import type { Box, Instrument, InstrumentView, Locale, Point, World } from '../../core/types';
import { strings, type Mode, type Phase } from './strings';

export type { Mode, Phase };

export const PHASES: readonly Phase[] = ['dns', 'tcp', 'tls', 'wait', 'down'];

export interface NetworkState {
  url: boolean;
  ip: boolean;
  cache: boolean;
  tcp: boolean;
  tls: boolean;
  inside: boolean;
  paint: 0 | 1 | 2;
  /** The phases finished; the time bar's clock is their sum. */
  done: Phase[];
  mode: Mode;
}

export const INITIAL: NetworkState = {
  url: false,
  ip: false,
  cache: false,
  tcp: false,
  tls: false,
  inside: false,
  paint: 0,
  done: [],
  mode: 'near',
};

/**
 * How long each phase takes, in ms: the lesson's two `curl -w` runs, against example.com (near,
 * behind a CDN) and against www.gov.za in Johannesburg (far). Each language's lesson shows its own
 * real run, so each has its own numbers, and the scenes say the same as the text.
 */
export const TIMES: Record<Locale, Record<Mode, Record<Phase, number>>> = {
  es: {
    near: { dns: 25, tcp: 8, tls: 10, wait: 31, down: 0.2 },
    far: { dns: 4, tcp: 202, tls: 218, wait: 238, down: 410 },
  },
  en: {
    near: { dns: 26, tcp: 17, tls: 13, wait: 15, down: 0.14 },
    far: { dns: 3, tcp: 209, tls: 210, wait: 228, down: 407 },
  },
};

/** The time from pressing Enter to the end of `phase` (all of them, if none is given). */
export function timeUntil(lang: Locale, mode: Mode, phase?: Phase): number {
  const last = phase ? PHASES.indexOf(phase) : PHASES.length - 1;
  return PHASES.slice(0, last + 1).reduce((sum, p) => sum + TIMES[lang][mode][p], 0);
}

/** The clock of a state: the sum of its finished phases. */
export function elapsed(lang: Locale, s: Pick<NetworkState, 'done' | 'mode'>): number {
  return s.done.reduce((sum, phase) => sum + TIMES[lang][s.mode][phase], 0);
}

type D = Director<NetworkState>;

/** The routers of the internet between yours and the server: more of them for a far server. */
function hops(d: D): Point[] {
  const [serverSide] = facing(d.box('server'), d.box('router'));
  return zigzag(d.pt('router'), serverSide, d.state.mode === 'far' ? 7 : 3);
}

/** Browser → your router → the internet → the server. */
export function netRoute(d: D): Point[] {
  const [browserSide] = facing(d.box('browser'), d.box('router'));
  const [serverSide] = facing(d.box('server'), d.box('router'));
  return [browserSide, d.pt('router'), ...hops(d), serverSide];
}

/** Whether two boxes come closer than `gap` px. */
function overlaps(a: Box, b: Box, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

/** Your router → the resolver: up to it, or across when a short stage puts it beside the router. */
function toResolver(d: D): Point[] {
  const router = d.box('router');
  const resolver = d.box('resolver');
  if (resolver.y + resolver.h <= router.y) return elbow(d.pt('router', 't'), d.pt('resolver', 'b'));
  return facing(router, resolver);
}

/** Browser → your router → the resolver. */
export function dnsRoute(d: D): Point[] {
  const [browserSide] = facing(d.box('browser'), d.box('router'));
  return [browserSide, d.pt('router'), ...toResolver(d)];
}

/** Where the resolver's lines to each DNS server leave from. */
export function resolverTop(d: D, server: 'root' | 'com' | 'auth'): Point {
  const box = d.box('resolver');
  const share = { root: 0.22, com: 0.5, auth: 0.78 }[server];
  return { x: box.x + box.w * share, y: box.y };
}

const URL_PARTS = [
  ['scheme', 'https', 'tls'],
  ['sep', '://', ''],
  ['host', 'example.com', 'dns'],
  ['path', '/', 'http'],
] as const;

/** The address bar: empty with its placeholder, or the URL with its parts marked (for the URL scene). */
function setUrl(root: ParentNode, typed: boolean, lang: Locale): void {
  const url = root.querySelector<HTMLElement>('#sc-url');
  if (!url) return;
  if (typed) {
    if (url.dataset.full === '1') return;
    url.dataset.full = '1';
    url.innerHTML = URL_PARTS.map(
      ([part, text, kind]) =>
        `<span class="sc-url__part" data-part="${part}"${kind ? ` data-kind="${kind}"` : ''}>${text}</span>`,
    ).join('');
  } else {
    url.dataset.full = '0';
    url.innerHTML = `<span class="sc-url__placeholder">${strings[lang].typeUrl}</span><span class="scene-caret"></span>`;
  }
}

/** The open connection: a band from the browser to the server, purple and with a padlock once encrypted. */
export async function tube(d: D, tls: boolean, animate: boolean): Promise<void> {
  d.stage.tube.replaceChildren();
  d.stage.fx.querySelector('#sc-tube-lock')?.remove();
  if (!d.shown('browser') || !d.shown('router') || !d.shown('server')) return;
  const route = netRoute(d);
  const shape = route
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const kind = tls ? 'tls' : 'tcp';
  const band = d.svg('path', { d: shape, class: 'scene-tube', 'data-kind': kind });
  const core = d.svg('path', { d: shape, class: 'scene-tube__core', 'data-kind': kind });
  d.stage.tube.append(band, core);
  if (animate) await d.draw(band);
  if (tls) {
    const lock = document.createElement('span');
    lock.className = 'scene-lock';
    lock.id = 'sc-tube-lock';
    lock.innerHTML = icons.lock;
    d.stage.fx.append(lock);
    d.put(lock, pointAt(route, 0.5));
    if (animate) await d.popIn(lock);
  }
}

function line(d: D, points: readonly Point[], className = 'scene-link'): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(d.svg('path', { d: shape, class: className }));
}

export const network: World<NetworkState> = {
  id: 'network',
  views: {
    overview: ['you', 'browser', 'router', 'net', 'server', 'resolver', 'root', 'com', 'auth'],
    url: ['you', 'browser', 'urlmap'],
    browser: ['you', 'browser'],
    dns: ['browser', 'router', 'resolver', 'root', 'com', 'auth'],
    net: ['browser', 'router', 'net', 'server'],
    server: ['server-room'],
  },
  zoom: { overview: 1.45, url: 1.3, browser: 1.55, dns: 1.5, net: 1.5, server: 1.6 },

  reset(root) {
    root.querySelectorAll('.sc-urlmap__row').forEach((row) => row.classList.remove('is-on'));
    root.querySelectorAll('.sc-url__part').forEach((part) => part.classList.remove('is-marked'));
    root
      .querySelectorAll('.person')
      .forEach((person) => person.classList.remove('is-talking', 'is-typing'));
  },

  apply(root, s, lang) {
    const t = strings[lang];
    const show = (selector: string, on: boolean) => {
      const found = root.querySelector<HTMLElement>(selector);
      if (found) found.hidden = !on;
    };
    setUrl(root, s.url, lang);
    const tab = root.querySelector('#sc-tab-title');
    if (tab) tab.textContent = s.paint ? t.pageTitle : s.url ? 'example.com' : t.newTab;
    root.querySelector('#sc-tab-spin')?.classList.toggle('is-on', s.url && s.paint < 2);
    show('#sc-ip', s.ip);
    const cache = root.querySelector('#sc-cache');
    if (cache) cache.innerHTML = s.cache ? t.cacheHit : t.cacheEmpty;
    root.querySelector('#sc-lock')?.classList.toggle('is-on', s.tls);
    root
      .querySelectorAll('#sc-key-b, #sc-key-s')
      .forEach((key) => key.classList.toggle('is-on', s.tls));
    root
      .querySelectorAll('.sc-room__part')
      .forEach((part) => part.classList.toggle('is-on', s.inside));
    root.querySelectorAll<HTMLElement>('[data-paint]').forEach((part) => {
      part.classList.toggle('is-painted', s.paint >= Number(part.dataset.paint));
    });
    root.querySelector('#sc-page')?.classList.toggle('is-styled', s.paint >= 2);
    root
      .querySelectorAll('[data-server-sub]')
      .forEach((sub) => (sub.textContent = t.serverSub[s.mode]));
    root
      .querySelectorAll('[data-server-name]')
      .forEach((name) => (name.textContent = t.serverName[s.mode]));
    root.closest<HTMLElement>('.scene-stage')?.setAttribute('data-mode', s.mode);
  },

  wires(d) {
    if (d.shown('browser') && d.shown('router')) line(d, facing(d.box('browser'), d.box('router')));
    if (d.shown('router') && d.shown('server')) {
      const between = hops(d);
      line(d, [d.pt('router'), ...between, facing(d.box('server'), d.box('router'))[0]]);
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
      // «internet», under its routers (a label of the lines, not an actor, so it never shifts).
      d.stage.fx.querySelector('#sc-internet')?.remove();
      const label = document.createElement('span');
      label.className = 'scene-wire-label';
      label.id = 'sc-internet';
      label.textContent = strings[d.lang].internet;
      d.stage.fx.append(label);
      // Under the lowest hop, so it never sits on the zigzag. Left out where it would touch the
      // router's or the server's name (the hops are close together on a narrow stage).
      const placed = d.put(
        label,
        { x: pointAt(between, 0.5).x, y: Math.max(...between.map((hop) => hop.y)) },
        'below',
        10,
      );
      const names = ['router', 'server'].map((name) =>
        d.stage.actor(name)?.querySelector('.scene-label'),
      );
      if (names.some((name) => name && overlaps(placed, d.box(name), 6))) label.remove();
    }
    if (d.shown('router') && d.shown('resolver')) {
      line(d, toResolver(d), 'scene-link scene-link--dashed');
    }
    if (d.shown('resolver') && d.shown('root')) {
      for (const server of ['root', 'com', 'auth'] as const) {
        line(d, [resolverTop(d, server), d.pt(server, 'b')], 'scene-link scene-link--dashed');
      }
    }
    if (d.state.tcp) void tube(d, d.state.tls, false).catch(() => {});
  },
};

/** The time bar under the stage (TimeBar.astro): the phases of a request and a clock that adds them up. */
export const timeBar: Instrument<NetworkState> = {
  name: 'timebar',
  create(panel: HTMLElement, lang: Locale): InstrumentView<NetworkState> {
    const t = strings[lang];
    const clock = panel.querySelector<HTMLElement>('#sc-clock');
    const label = panel.querySelector<HTMLElement>('#sc-time-of');
    const segment = (phase: Phase) =>
      panel.querySelector<HTMLElement>(`.sc-time__segment[data-phase="${phase}"]`);
    const legend = (phase: Phase) =>
      panel.querySelector<HTMLElement>(`.sc-time__legend [data-phase="${phase}"]`);
    let value = 0;
    let mode: Mode = 'near';
    const isPhase = (phase: string): phase is Phase =>
      (PHASES as readonly string[]).includes(phase);

    const view: InstrumentView<NetworkState> = {
      apply(s) {
        mode = s.mode;
        // Each phase's share of the bar, at least 2.5% so a quick one stays visible. The segments are
        // placed with transforms: switching near and far never shifts the layout.
        const shares = PHASES.map((phase) =>
          Math.max(TIMES[lang][mode][phase], timeUntil(lang, mode) * 0.025),
        );
        const sum = shares.reduce((a, b) => a + b, 0);
        let start = 0;
        PHASES.forEach((phase, i) => {
          const share = shares[i]! / sum;
          const bar = segment(phase);
          if (bar)
            bar.style.transform = `translateX(${(start * 100).toFixed(2)}%) scaleX(${Math.max(0.004, share - 0.006).toFixed(4)})`;
          start += share;
          view.setDone(phase, s.done.includes(phase));
          view.hint(phase, false);
        });
        if (label) label.textContent = t.timeOf[mode];
        view.setClock(elapsed(lang, s));
      },
      clock: () => value,
      setClock(ms) {
        value = ms;
        if (clock) clock.textContent = formatMs(ms, lang);
      },
      setDone(phase, done) {
        if (!isPhase(phase)) return;
        segment(phase)?.classList.toggle('is-done', done);
        const item = legend(phase);
        if (!item) return;
        item.classList.toggle('is-done', done);
        const amount = item.querySelector('b');
        if (amount) amount.textContent = done ? formatMs(TIMES[lang][mode][phase], lang) : '—';
      },
      hint(phase, on) {
        if (!isPhase(phase)) return;
        segment(phase)?.classList.toggle('is-hint', on);
        legend(phase)?.classList.toggle('is-hint', on);
      },
    };
    return view;
  },
};
