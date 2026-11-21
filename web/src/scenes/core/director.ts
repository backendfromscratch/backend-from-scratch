/**
 * The director: what a scene can do (spec §4.4). Every call goes through the scene's run, so the
 * pause, the speed and cancelling reach it; in an instant run (reduced motion, a redraw) each call
 * puts its final result in place at once, which makes a scene's last frame a still diagram.
 * Strings come from the lesson modules (trusted, written in the repository), so they may carry
 * inline markup such as <b>.
 */
import { length, place, pointAt } from './geometry';
import { icons, type IconName } from './icons';
import { Cancel, type Run } from './run';
import type { Stage } from './stage';
import { readTime } from './timing';
import type { InstrumentView, Kind, Locale, Place, Point, Text, World } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EASE = 'cubic-bezier(.45,.05,.35,1)';
const KIND_TOKEN: Record<Kind, string> = {
  dns: '--ide-info',
  tcp: '--ide-string',
  tls: '--ide-keyword',
  http: '--ide-accent',
  muted: '--ide-muted',
};

interface FlyOptions {
  /** Leave the path drawn, with a number badge halfway; `dashed` for a line that is not a message. */
  trail?: { badge?: string; dashed?: boolean };
  /** The actor that receives it lights up. */
  arrive?: string;
  small?: boolean;
  /** Duration in ms at normal speed; by default, from the route's length. */
  dur?: number;
  icon?: IconName;
}

type NoteLook = 'key' | 'wrap' | 'card' | 'icon' | 'tag';

interface NoteOptions {
  kind?: Kind;
  where?: Place;
  gap?: number;
  /** Goes away after this many ms. Notes with a ttl are skipped in an instant run. */
  ttl?: number;
  look?: NoteLook;
}

export interface Director<S> {
  readonly lang: Locale;
  readonly state: S;
  readonly stage: Stage;
  readonly run: Run;
  t(text: Text | string): string;
  /** Changes the persistent state and redraws it, without animation. */
  set(patch: Partial<S>): void;
  q<T extends Element = HTMLElement>(selector: string): T;
  qa<T extends Element = HTMLElement>(selector: string): T[];
  pt: Stage['pt'];
  box: Stage['box'];
  shown(name: string): boolean;
  wait(ms: number): Promise<void>;
  caption(
    text: Text | string | null,
    opts?: { chip?: Text | string; n?: string; kind?: Kind },
  ): Promise<void>;
  fly(route: readonly Point[], label: Text | string, kind: Kind, opts?: FlyOptions): Promise<void>;
  note(at: Point, html: Text | string, opts?: NoteOptions): Promise<HTMLElement | null>;
  tag(at: Point, text: Text | string, kind: Kind, where?: Place): Promise<HTMLElement | null>;
  say(
    person: string,
    text: Text,
    opts?: { hold?: number; keep?: boolean },
  ): Promise<HTMLElement | null>;
  vanish(element: HTMLElement | null): Promise<void>;
  reveal(selector: string, from?: string): Promise<void>;
  /** Fades in a part whose space is already reserved (`is-on`): no layout change, no CLS. */
  show(selector: string): Promise<void>;
  setText(selector: string, html: Text | string, flash?: boolean): Promise<void>;
  /** Types into an element letter by letter; `person` is the one typing. */
  type(selector: string, text: string, person?: string): Promise<void>;
  prop(
    icon: IconName,
    route: readonly Point[],
    opts?: { dur?: number; lift?: number },
  ): Promise<HTMLElement>;
  wiggle(icon: IconName, at: Point, ms: number): Promise<void>;
  glow(target: string, kind: Kind): void;
  /** Draws an SVG path from end to end (pathLength 1). */
  draw(path: SVGPathElement, dur?: number): Promise<void>;
  popIn(element: HTMLElement): Promise<void>;
  /** Places an element of the fx layer; returns its top-left corner and size. */
  put(
    element: HTMLElement,
    at: Point,
    where?: Place,
    gap?: number,
  ): { x: number; y: number; w: number; h: number };
  svg<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string>,
  ): SVGElementTagNameMap[K];
  clockTo(ms: number, dur?: number): Promise<void>;
  done(phase: string): void;
  hint(phase: string, on: boolean): void;
}

/** The caption under the stage. Each one stays up its reading time before the next replaces it. */
export class Captioner {
  private chain: Promise<void> = Promise.resolve();
  private shownAt = 0;
  private needs = 0;

  constructor(private readonly element: HTMLElement) {}

  reset(): void {
    this.chain = Promise.resolve();
    this.shownAt = 0;
    this.needs = 0;
    this.element.replaceChildren();
  }

  show(run: Run, html: string | null): Promise<void> {
    const step = async () => {
      run.guard();
      const left = run.instant ? 0 : this.needs - (run.clock() - this.shownAt);
      if (left > 0) await run.wait(left);
      run.guard();
      this.element.innerHTML = html ? `<span class="scene-caption__in">${html}</span>` : '';
      this.shownAt = run.clock();
      this.needs = html ? readTime(html) : 0;
    };
    this.chain = this.chain.then(step, step);
    return this.chain;
  }
}

export interface DirectorContext<S> {
  stage: Stage;
  run: Run;
  lang: Locale;
  state: S;
  worlds: readonly World<S>[];
  captions: Captioner;
  instrument: InstrumentView<S> | null;
}

export function makeDirector<S>(ctx: DirectorContext<S>): Director<S> {
  const { stage, run, lang, captions, instrument } = ctx;
  const fx = stage.fx;
  const t = (text: Text | string) => (typeof text === 'string' ? text : text[lang]);

  function element(tag: string, className: string, html?: string): HTMLElement {
    const created = document.createElement(tag);
    created.className = className;
    if (html !== undefined) created.innerHTML = html;
    return created;
  }

  function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>) {
    const created = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) created.setAttribute(name, value);
    return created;
  }

  function put(target: HTMLElement, at: Point, where: Place = 'center', gap = 8) {
    const size = { w: target.offsetWidth, h: target.offsetHeight };
    const corner = place(size, at, where, gap, stage.size());
    target.style.translate = `${corner.x.toFixed(1)}px ${corner.y.toFixed(1)}px`;
    return { ...corner, ...size };
  }

  async function popIn(target: HTMLElement): Promise<void> {
    if (run.instant) return;
    await run.track(
      run.adopt(
        target.animate(
          [
            { opacity: 0, scale: '.85' },
            { opacity: 1, scale: '1' },
          ],
          {
            duration: 320,
            easing: 'cubic-bezier(.3,1.4,.5,1)',
          },
        ),
      ),
    );
  }

  async function vanish(target: HTMLElement | null): Promise<void> {
    if (!target) return;
    if (!run.instant) {
      await run.track(
        run.adopt(
          target.animate([{ opacity: 1 }, { opacity: 0, scale: '.92' }], {
            duration: 280,
            fill: 'forwards',
          }),
        ),
      );
    }
    target.remove();
  }

  function glow(target: string, kind: Kind): void {
    const found = stage.el(target);
    if (!(found instanceof HTMLElement) || run.instant) return;
    const colour = getComputedStyle(document.documentElement)
      .getPropertyValue(KIND_TOKEN[kind])
      .trim();
    found.style.setProperty('--scene-glow', colour);
    found.classList.remove('scene-glow');
    void found.offsetWidth;
    found.classList.add('scene-glow');
    setTimeout(() => found.classList.remove('scene-glow'), 850);
  }

  function path(points: readonly Point[]): string {
    return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }

  interface Trail {
    element: SVGPathElement;
    kind: Kind;
    points: readonly Point[];
    badge?: string;
    dashed?: boolean;
  }

  function startTrail(
    points: readonly Point[],
    kind: Kind,
    options: NonNullable<FlyOptions['trail']>,
  ): Trail {
    const line = svg('path', {
      d: path(points),
      class: 'scene-trail',
      'data-kind': kind,
      pathLength: '1',
    });
    line.style.strokeDasharray = '1 1';
    line.style.strokeDashoffset = '1';
    stage.trails.append(line);
    return { element: line, kind, points, ...options };
  }

  function finishTrail(trail: Trail): void {
    const line = trail.element;
    line.removeAttribute('pathLength');
    line.style.strokeDasharray = '';
    line.style.strokeDashoffset = '';
    if (trail.dashed) line.classList.add('scene-trail--dashed');
    else line.setAttribute('marker-end', `url(#scene-mk-${trail.kind})`);
    if (trail.badge) {
      const badge = element('span', 'scene-badge', trail.badge);
      badge.dataset.kind = trail.kind;
      fx.append(badge);
      put(badge, pointAt(trail.points, 0.5));
    }
  }

  async function fly(
    route: readonly Point[],
    label: Text | string,
    kind: Kind,
    opts: FlyOptions = {},
  ) {
    run.guard();
    const trail = opts.trail ? startTrail(route, kind, opts.trail) : null;
    if (run.instant) {
      if (trail) finishTrail(trail);
      return;
    }
    const text = t(label);
    const classes = [
      'scene-pkt',
      opts.small ? 'scene-pkt--sm' : '',
      text === '' && !opts.icon ? 'scene-pkt--dot' : '',
    ];
    const packet = element(
      'span',
      classes.filter(Boolean).join(' '),
      (opts.icon ? icons[opts.icon] : '') + text,
    );
    packet.dataset.kind = kind;
    fx.append(packet);
    const w = packet.offsetWidth;
    const h = packet.offsetHeight;
    const total = length(route) || 1;
    let walked = 0;
    const frames = route.map((p, i) => {
      if (i > 0) walked += Math.hypot(p.x - route[i - 1]!.x, p.y - route[i - 1]!.y);
      return {
        translate: `${(p.x - w / 2).toFixed(1)}px ${(p.y - h / 2).toFixed(1)}px`,
        offset: i === route.length - 1 ? 1 : Math.min(1, walked / total),
      };
    });
    const duration = opts.dur ?? Math.max(750, Math.min(2300, total * 3.4));
    const move = run.adopt(packet.animate(frames, { duration, easing: EASE, fill: 'forwards' }));
    run.adopt(
      packet.animate(
        [
          { opacity: 0, scale: '.6' },
          { opacity: 1, scale: '1' },
        ],
        { duration: 200 },
      ),
    );
    const drawing = trail
      ? run.adopt(
          trail.element.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration,
            easing: EASE,
            fill: 'forwards',
          }),
        )
      : null;
    try {
      await run.track(move);
    } finally {
      packet.remove();
    }
    if (trail) {
      drawing?.cancel();
      finishTrail(trail);
    }
    if (opts.arrive) glow(opts.arrive, kind);
  }

  async function note(
    at: Point,
    html: Text | string,
    opts: NoteOptions = {},
  ): Promise<HTMLElement | null> {
    run.guard();
    if (opts.ttl && run.instant) return null;
    const classes = ['scene-note', opts.look ? `scene-note--${opts.look}` : ''];
    const label = element('div', classes.filter(Boolean).join(' '), t(html));
    if (opts.kind) label.dataset.kind = opts.kind;
    fx.append(label);
    put(label, at, opts.where ?? 'above', opts.gap ?? 8);
    await popIn(label);
    if (opts.ttl) {
      await run.wait(opts.ttl);
      await vanish(label);
      return null;
    }
    return label;
  }

  async function say(person: string, text: Text, opts: { hold?: number; keep?: boolean } = {}) {
    run.guard();
    if (run.instant && !opts.keep) return null;
    // A person a narrow layout leaves out says nothing (the bubble would have nowhere to point).
    const head = stage.board.querySelector(`#${person}-head`);
    if (!head || head.getClientRects().length === 0) return null;
    const at = stage.pt(`#${person}-head`, 't', 0, -2);
    const words = t(text);
    const bubble = element('div', 'scene-bubble', words);
    fx.append(bubble);
    const box = put(bubble, at, 'above', 14);
    bubble.style.setProperty(
      '--tail-x',
      `${Math.max(14, Math.min(box.w - 14, at.x - box.x)).toFixed(1)}px`,
    );
    const who = stage.board.querySelector(`#${person}`);
    if (who && !run.instant) who.classList.add('is-talking');
    try {
      await popIn(bubble);
      if (!opts.keep) {
        await run.wait(Math.max(opts.hold ?? 0, readTime(words)));
        who?.classList.remove('is-talking');
        await vanish(bubble);
        return null;
      }
      await run.wait(900);
    } finally {
      who?.classList.remove('is-talking');
    }
    return bubble;
  }

  function q<T extends Element = HTMLElement>(selector: string): T {
    const found = stage.board.querySelector<T>(selector) ?? stage.fx.querySelector<T>(selector);
    if (!found) throw new Error(`[scenes] Nothing on stage matches ${selector}`);
    return found;
  }

  async function reveal(selector: string, from = '.85'): Promise<void> {
    run.guard();
    const target = q(selector);
    target.hidden = false;
    if (run.instant) return;
    await run.track(
      run.adopt(
        target.animate(
          [
            { opacity: 0, scale: from },
            { opacity: 1, scale: '1' },
          ],
          {
            duration: 380,
            easing: 'cubic-bezier(.3,1.3,.5,1)',
          },
        ),
      ),
    );
  }

  async function show(selector: string): Promise<void> {
    run.guard();
    const target = q(selector);
    target.classList.add('is-on');
    if (run.instant) return;
    await run.track(
      run.adopt(
        target.animate(
          [
            { opacity: 0, scale: '.9' },
            { opacity: 1, scale: '1' },
          ],
          {
            duration: 380,
            easing: 'cubic-bezier(.3,1.3,.5,1)',
          },
        ),
      ),
    );
  }

  async function setText(selector: string, html: Text | string, flash = true): Promise<void> {
    run.guard();
    const target = q(selector);
    target.innerHTML = t(html);
    if (run.instant || !flash) return;
    const highlight = getComputedStyle(document.documentElement)
      .getPropertyValue('--ide-selection')
      .trim();
    await run.track(
      run.adopt(
        target.animate([{ backgroundColor: highlight }, { backgroundColor: 'transparent' }], {
          duration: 900,
        }),
      ),
    );
  }

  async function type(selector: string, text: string, person?: string): Promise<void> {
    run.guard();
    const target = q(selector);
    if (run.instant) {
      target.textContent = text;
      return;
    }
    const typist = person ? stage.board.querySelector(`#${person}`) : null;
    typist?.classList.add('is-typing');
    try {
      for (let i = 1; i <= text.length; i++) {
        target.textContent = text.slice(0, i);
        target.insertAdjacentHTML('beforeend', '<span class="scene-caret"></span>');
        await run.wait(i < 9 ? 95 : 62);
      }
    } finally {
      typist?.classList.remove('is-typing');
    }
  }

  async function prop(
    icon: IconName,
    route: readonly Point[],
    opts: { dur?: number; lift?: number } = {},
  ) {
    run.guard();
    const thing = element('div', `scene-prop scene-prop--${icon}`, icons[icon]);
    fx.append(thing);
    const w = thing.offsetWidth;
    const h = thing.offsetHeight;
    const lift = opts.lift ?? h - 6;
    const at = (p: Point) => `${(p.x - w / 2).toFixed(1)}px ${(p.y - lift).toFixed(1)}px`;
    const end = route[route.length - 1]!;
    if (!run.instant) {
      const frames = route.map((p) => ({ translate: at(p) }));
      const duration = opts.dur ?? Math.max(1500, length(route) * 13);
      await run.track(
        run.adopt(
          thing.animate(frames, { duration, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }),
        ),
      );
    }
    thing.style.translate = at(end);
    return thing;
  }

  async function wiggle(icon: IconName, at: Point, ms: number): Promise<void> {
    run.guard();
    if (run.instant) return;
    const tool = element('span', `scene-wiggle scene-wiggle--${icon}`, icons[icon]);
    fx.append(tool);
    put(tool, at, 'above', 0);
    try {
      await run.track(
        run.adopt(
          tool.animate([{ rotate: '-35deg' }, { rotate: '18deg' }], {
            duration: 220,
            iterations: Math.max(2, Math.round(ms / 220)),
            direction: 'alternate',
            easing: 'ease-in',
          }),
        ),
      );
    } finally {
      tool.remove();
    }
  }

  async function draw(line: SVGPathElement, dur = 900): Promise<void> {
    if (run.instant) return;
    line.setAttribute('pathLength', '1');
    line.style.strokeDasharray = '1 1';
    try {
      await run.track(
        run.adopt(
          line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: dur,
            easing: 'ease-in-out',
          }),
        ),
      );
    } finally {
      line.style.strokeDasharray = '';
      line.removeAttribute('pathLength');
    }
  }

  async function clockTo(ms: number, dur = 900): Promise<void> {
    if (!instrument) return;
    if (run.instant) {
      instrument.setClock(ms);
      return;
    }
    const from = instrument.clock();
    const start = run.clock();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (run.cancelled) {
          reject(new Cancel());
          return;
        }
        const k = Math.min(1, (run.clock() - start) / Math.max(1, dur));
        instrument.setClock(from + (ms - from) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  return {
    lang,
    state: ctx.state,
    stage,
    run,
    t,
    set(patch) {
      Object.assign(ctx.state as object, patch);
      for (const world of ctx.worlds) world.apply?.(stage.board, ctx.state, lang);
    },
    q,
    qa: <T extends Element = HTMLElement>(selector: string) => [
      ...stage.board.querySelectorAll<T>(selector),
    ],
    pt: (target, side, dx, dy) => stage.pt(target, side, dx, dy),
    box: (target) => stage.box(target),
    shown: (name) => stage.shown(name),
    wait: (ms) => run.wait(ms),
    caption(text, opts = {}) {
      if (text === null) return captions.show(run, null);
      const kind = opts.kind ?? 'muted';
      const lead =
        opts.n !== undefined
          ? `<span class="scene-num" data-kind="${kind}">${opts.n}</span>`
          : opts.chip !== undefined
            ? `<span class="scene-chip" data-kind="${kind}">${t(opts.chip)}</span>`
            : '';
      return captions.show(run, `${lead}<span>${t(text)}</span>`);
    },
    fly,
    note,
    tag: (at, text, kind, where = 'above') => note(at, text, { kind, where, look: 'tag', gap: 6 }),
    say,
    vanish,
    reveal,
    show,
    setText,
    type,
    prop,
    wiggle,
    glow,
    draw,
    popIn,
    put,
    svg,
    clockTo,
    done: (phase) => instrument?.setDone(phase, true),
    hint: (phase, on) => instrument?.hint(phase, on),
  };
}
