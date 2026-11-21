/**
 * The assistant world (spec §4.2; Phase 11's lessons): Carmen's browser with the shop's assistant,
 * the shop and the model's API, and the parts one view needs beside them: the DevTools row that
 * leaks a key and whoever uses it, the shop's checks before the model and Redis's counter, the
 * request and the response as cards, the cost meter, the fake model of the tests, your terminal,
 * the API's stream events, the browser's reader, nginx, the shop's tools, a tool's definition, the
 * orders and what the model reads. Its persistent state is what the chat shows (Carmen's question,
 * the answer's placeholder lines, the status row, the tab closed), whether the shop has its key,
 * Redis's count and whether Redis or the orders' database answer. Everything else a scene lights
 * up is undone by `reset`. Its markup is Assistant.astro; its labels, strings.ts. Ids start with `ai-`.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Kind, Point, Text, World } from '../../core/types';
import { strings, type Ask, type ChatNote } from './strings';

/** The answer's placeholder lines: three lines of four segments (never words: the lessons quote no model output). */
export const SEGMENTS = 12;

export interface AssistantState {
  /** Carmen's question in the chat. */
  aiAsk: Ask | '';
  /** How many of the answer's segments show (0 to SEGMENTS). */
  aiAnswer: number;
  /** The chat's status row, when the shop answered something that is not a text. */
  aiNote: ChatNote | '';
  /** Carmen has closed the tab. */
  aiClosed: boolean;
  /** The shop has its ANTHROPIC_API_KEY. */
  aiKey: boolean;
  /** Carmen's questions in the last 10 minutes, as Redis counts them, and Redis not answering. */
  aiCount: number;
  aiRedisDown: boolean;
  /** The orders' database not answering (lesson 3). */
  aiOrdersDown: boolean;
}

export const INITIAL: AssistantState = {
  aiAsk: '',
  aiAnswer: 0,
  aiNote: '',
  aiClosed: false,
  aiKey: true,
  aiCount: 0,
  aiRedisDown: false,
  aiOrdersDown: false,
};

/** The limit of the shop's limiter: 20 questions per customer every 10 minutes. */
export const LIMIT = 20;

type D = Director<AssistantState>;

/**
 * From one actor (or part) to another, between their facing sides. `lane` moves the line a fifth of
 * the shorter box to one side (-1) or the other (1), across the direction it travels: a request and
 * its answer each keep their own line, also when the actors are stacked on a narrow stage.
 */
export function route(d: D, from: string, to: string, lane = 0): Point[] {
  const a = d.box(from);
  const b = d.box(to);
  const [p, q] = facing(a, b);
  const across = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
  const off = lane * Math.min(across ? Math.min(a.h, b.h) : Math.min(a.w, b.w), 60) * 0.22;
  return across
    ? [
        { x: p.x, y: p.y + off },
        { x: q.x, y: q.y + off },
      ]
    : [
        { x: p.x + off, y: p.y },
        { x: q.x + off, y: q.y },
      ];
}

const middle = (line: readonly Point[]): Point => ({
  x: (line[0]!.x + line[line.length - 1]!.x) / 2,
  y: (line[0]!.y + line[line.length - 1]!.y) / 2,
});

/**
 * The stream through the shop: each piece flies from the model to the shop and straight on to
 * Carmen, `inLabel` and `outLabel` on each leg, and `arrived(i)` runs as piece i reaches the chat.
 */
export async function relay(
  d: D,
  n: number,
  arrived: (i: number) => void,
  inLabel: Text | string = '',
  outLabel: Text | string = '',
  via = 'api',
  from = 'model',
): Promise<void> {
  await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      await d.wait(i * 480);
      await d.fly(route(d, from, via, 1), inLabel, 'http', { small: true, dur: 800 });
      await d.fly(route(d, via, 'chat', 1), outLabel, 'http', { small: true, dur: 800 });
      arrived(i);
    }),
  );
}

/** A ✓ or a ✗ in a mark's room (a check, a command's result). */
export function mark(d: D, selector: string, ok: boolean): void {
  const room = d.q(selector);
  room.textContent = ok ? '✓' : '✗';
  room.dataset.mark = ok ? 'ok' : 'ko';
  d.glow(selector, ok ? 'tcp' : 'http');
}

/** A packet that never arrives: it flies half way and a cross marks where it was lost. */
export async function lose(d: D, line: readonly Point[], label: Text | string): Promise<void> {
  const lost = middle(line);
  await d.fly([line[0]!, lost], label, 'muted', { small: true });
  await d.note(lost, '✗', { where: 'center', look: 'tag', ttl: 1200 });
}

/** A call that is cancelled on its way: a cross on its line. */
export async function cut(d: D, line: readonly Point[]): Promise<void> {
  await d.note(middle(line), '✗', { where: 'center', look: 'tag', ttl: 1400 });
}

/**
 * The lines between actors that talk, drawn whenever both are on stage (dashed: not the shop's own
 * path). Between the chat and the shop there is no direct line when the browser's reader or nginx
 * stands between them.
 */
const LINKS: readonly (readonly [string, string, 'dashed'?])[] = [
  ['api', 'reader'],
  ['reader', 'chat'],
  ['chat', 'nginx'],
  ['nginx', 'api'],
  ['api', 'model'],
  ['chat', 'gate'],
  ['gate', 'model'],
  ['gate', 'redis', 'dashed'],
  ['stranger', 'model', 'dashed'],
  ['shell', 'api'],
  ['api', 'fakemodel'],
  ['api', 'orders', 'dashed'],
  ['api', 'tools', 'dashed'],
  ['onetext', 'model', 'dashed'],
];

function line(d: D, points: readonly Point[], dashed = false): void {
  const shape = points
    .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  d.stage.links.append(
    d.svg('path', { d: shape, class: dashed ? 'scene-link scene-link--dashed' : 'scene-link' }),
  );
}

/** Text that a scene changes and `reset` puts back: each status line, empty. */
const STATUS = [
  '#ai-api-status',
  '#ai-model-status',
  '#ai-fake-status',
  '#ai-chunk',
  '#ai-buffer',
  '#ai-buffering',
];

/**
 * A stream: the pieces fly one after another along a line, a little apart, and `arrived(i)` runs
 * as each one lands (a segment of the answer shows, a slot fills). The line is measured when each
 * piece leaves.
 */
export async function stream(
  d: D,
  line: () => Point[],
  labels: readonly (Text | string)[],
  kind: Kind,
  arrived?: (i: number) => void,
  gap = 420,
): Promise<void> {
  await Promise.all(
    labels.map(async (label, i) => {
      await d.wait(i * gap);
      await d.fly(line(), label, kind, { small: true, dur: 950 });
      arrived?.(i);
    }),
  );
}

export const assistant: World<AssistantState> = {
  id: 'assistant',
  views: {
    leak: ['chat', 'model', 'devtools', 'stranger'],
    path: ['chat', 'api', 'model'],
    gatekeep: ['chat', 'gate', 'redis', 'model'],
    reqview: ['api', 'model', 'reqcard'],
    resview: ['api', 'model', 'rescard'],
    tally: ['api', 'model', 'meter'],
    duo: ['api', 'model'],
    tests: ['shell', 'api', 'fakemodel'],
    tryit: ['shell', 'api', 'model'],
    events: ['api', 'model', 'apievents'],
    frontend: ['chat', 'api', 'reader'],
    proxy: ['chat', 'nginx', 'api'],
    tooldef: ['api', 'model', 'defcard'],
    lookup: ['chat', 'api', 'model', 'orders'],
    toolbox: ['chat', 'api', 'model', 'tools'],
    inject: ['chat', 'api', 'model', 'onetext'],
    trytools: ['shell', 'api', 'fakemodel', 'orders'],
  },

  reset(root) {
    for (const selector of STATUS) {
      const status = root.querySelector(selector);
      if (status) status.textContent = '';
    }
    root.querySelectorAll('.ai-mark').forEach((mark) => {
      mark.textContent = '';
      delete (mark as HTMLElement).dataset.mark;
    });
    root
      .querySelectorAll('.ai-room.is-on, .ai-slot.is-on')
      .forEach((room) => room.classList.remove('is-on'));
    root.querySelectorAll('.is-lit').forEach((row) => row.classList.remove('is-lit'));
    root.querySelectorAll('.ai-shell__cmd').forEach((cmd) => (cmd.textContent = ''));
    root.querySelector('#ai-reads')?.classList.remove('is-one');
    root.querySelectorAll('.person').forEach((person) => person.classList.remove('is-talking'));
  },

  apply(root, s, lang) {
    const t = strings[lang];
    const ask = root.querySelector('#ai-ask');
    if (ask) ask.textContent = s.aiAsk ? t.asks[s.aiAsk] : '';
    root
      .querySelectorAll('.ai-seg')
      .forEach((segment, i) => segment.classList.toggle('is-on', i < s.aiAnswer));
    const note = root.querySelector<HTMLElement>('#ai-note');
    if (note) {
      note.textContent = s.aiNote ? t.notes[s.aiNote] : '';
      note.dataset.note = s.aiNote;
    }
    root.querySelector('#ai-chat')?.classList.toggle('is-closed', s.aiClosed);
    root.querySelector('#ai-key')?.classList.toggle('is-gone', !s.aiKey);
    const count = root.querySelector('#ai-count');
    if (count) count.textContent = `${s.aiCount}/${LIMIT}`;
    root
      .querySelector<HTMLElement>('#ai-bar')
      ?.style.setProperty('--fill', String(Math.min(1, s.aiCount / LIMIT)));
    root.querySelector('#ai-redis')?.classList.toggle('is-down', s.aiRedisDown);
    root.querySelector('#ai-orders')?.classList.toggle('is-down', s.aiOrdersDown);
  },

  wires(d) {
    for (const [a, b, dashed] of LINKS) {
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b), dashed === 'dashed');
    }
    if (d.shown('chat') && d.shown('api') && !d.shown('reader') && !d.shown('nginx'))
      line(d, route(d, 'chat', 'api'));
    // Without the shop in between (the problem's browser, your terminal's curl): straight to the model.
    if (d.shown('chat') && d.shown('model') && !d.shown('api') && !d.shown('gate'))
      line(d, route(d, 'chat', 'model'));
    if (d.shown('shell') && d.shown('model')) line(d, route(d, 'shell', 'model'), true);
  },
};
