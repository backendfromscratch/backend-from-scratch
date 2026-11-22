/**
 * The ops world (spec §4.2; the lesson «IA en producción: costes, latencia y evals»): the four kinds
 * of tokens in `usage` with their prices, Carmen's daily budget in Redis, the request's three parts
 * and the API's prompt cache, the histogram of the time to first token, Ana, the twelve evals and
 * the judge, and the trace with its span's attributes. It also uses the assistant world's `chat`,
 * `api`, `gate`, `redis`, `model`, `fakemodel` and `shell`, and the vectors world's `worker`. Its
 * persistent state is what the reader has seen happen: the bill's example, what Carmen has spent
 * today, Redis not answering, the cache holding the prefix, the answers the histogram has counted
 * and the trace drawn. Everything else a scene lights up is undone by `reset`. Its markup is
 * Ops.astro; its labels, strings.ts. Ids start with `op-`.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Point, World } from '../../core/types';

export interface OpsState {
  /** The usage card shows the text's example: its tokens and its total. */
  opBill: boolean;
  /** What Carmen has spent today, as a share of her budget (the last question can go a little past it). */
  opSpent: number;
  /** The budget's count, as «Pruébalo» reads it (only there). */
  opCount: '' | '300' | '100000';
  opRedisDown: boolean;
  /** The API's cache holds the request's prefix (the tools and the instructions). */
  opCached: boolean;
  /** The streamed answers the histogram has counted in this lesson's scene. */
  opTtft: 0 | 1 | 2 | 3;
  /** The trace's spans and their attributes are drawn. */
  opTraced: boolean;
}

export const OPS_INITIAL: OpsState = {
  opBill: false,
  opSpent: 0,
  opCount: '',
  opRedisDown: false,
  opCached: false,
  opTtft: 0,
  opTraced: false,
};

/** The budget's bar is a little longer than the budget, so a question that goes past it shows. */
export const BUDGET_SCALE = 1.15;
export const budgetFill = (spent: number) => Math.min(spent, BUDGET_SCALE) / BUDGET_SCALE;

/**
 * The histogram before the scene (how the shop's answers already spread, no values), and where each
 * of the scene's three answers falls: a plain one, one with a tool round, one that thinks more.
 */
export const HISTOGRAM = [0.35, 0.8, 0.55, 0.35, 0.2, 0.1] as const;
export const ANSWERS = [0, 2, 4] as const;
const STEP = 0.18;

/** Each bucket's height (0 to 1) after `n` of the scene's answers. */
export function heights(n: number): number[] {
  return HISTOGRAM.map(
    (base, bucket) =>
      base + STEP * ANSWERS.slice(0, n).filter((answer) => answer === bucket).length,
  );
}

type D = Director<OpsState>;

/** From one actor (or part) to another, between their facing sides. */
function route(d: Pick<D, 'box'>, from: string, to: string): Point[] {
  const [p, q] = facing(d.box(from), d.box(to));
  return [p, q];
}

const path = (points: readonly Point[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

/** The lines between actors that talk, drawn whenever both are on stage (dashed: not a message). */
const LINKS: readonly (readonly [string, string, 'dashed'?])[] = [
  ['api', 'budget', 'dashed'],
  ['shell', 'budget', 'dashed'],
  ['prompt', 'api', 'dashed'],
  ['pcache', 'model', 'dashed'],
  ['api', 'histogram', 'dashed'],
  ['admin', 'api'],
  ['api', 'worker', 'dashed'],
  ['worker', 'model'],
  ['evals', 'api'],
  ['evals', 'model'],
  ['evals', 'judge'],
];

const text = (root: ParentNode, selector: string, content: string) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = content;
};
const on = (root: ParentNode, selector: string, value: boolean) =>
  root.querySelector(selector)?.classList.toggle('is-on', value);

export const ops: World<OpsState> = {
  id: 'ops',
  views: {
    pricing: ['api', 'model', 'pricecard'],
    budgeting: ['chat', 'api', 'budget', 'model'],
    caching: ['api', 'model', 'prompt', 'pcache'],
    ttfthist: ['api', 'model', 'histogram'],
    longjob: ['admin', 'api', 'worker', 'model'],
    evalrun: ['evals', 'api', 'model'],
    judging: ['evals', 'model', 'judge'],
    spans: ['trace', 'spanattrs'],
    tryprod: ['shell', 'api', 'budget'],
  },
  zoom: { spans: 1.8 },

  reset(root) {
    root.querySelectorAll('.op-room.is-on').forEach((room) => room.classList.remove('is-on'));
    root
      .querySelectorAll('[class*="op-"]')
      .forEach((part) => part.classList.remove('is-lit', 'is-miss'));
    root.querySelectorAll('.op-mark').forEach((mark) => {
      mark.textContent = '';
      delete (mark as HTMLElement).dataset.mark;
    });
    root.querySelector('#op-prompt')?.classList.remove('is-marked');
    root
      .querySelectorAll<HTMLElement>('#op-trace .op-lane i')
      .forEach((bar) => (bar.style.transform = ''));
    text(root, '#op-pcache-status', '');
    text(root, '#op-judge-status', '');
  },

  apply(root, s) {
    root.querySelectorAll('.op-tokens').forEach((cell) => cell.classList.toggle('is-on', s.opBill));
    on(root, '#op-total', s.opBill);
    root
      .querySelector<HTMLElement>('#op-spent')
      ?.style.setProperty('--fill', budgetFill(s.opSpent).toFixed(3));
    text(root, '#op-count', s.opCount);
    root.querySelector('#op-budget')?.classList.toggle('is-down', s.opRedisDown);
    on(root, '#op-held', s.opCached);
    heights(s.opTtft).forEach((h, i) =>
      root
        .querySelector<HTMLElement>(`#op-bucket-${i + 1}`)
        ?.style.setProperty('--h', h.toFixed(3)),
    );
    root.querySelector('#op-trace')?.classList.toggle('is-traced', s.opTraced);
    root.querySelectorAll('.op-attr').forEach((row) => row.classList.toggle('is-on', s.opTraced));
  },

  wires(d) {
    for (const [a, b, dashed] of LINKS) {
      if (!d.shown(a) || !d.shown(b)) continue;
      d.stage.links.append(
        d.svg('path', {
          d: path(route(d, a, b)),
          class: dashed ? 'scene-link scene-link--dashed' : 'scene-link',
        }),
      );
    }
  },
};
