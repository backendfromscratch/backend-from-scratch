/**
 * The loop world (spec §4.2; the lesson «El event loop de Node.js: qué bloquea y qué no»): the
 * shop's API with your code's single thread and a bar for what it calculates, the queue of what has
 * arrived (requests, timers, files read), the fulfilled promises' queue, libuv's four helper threads,
 * the operating system that watches the network, Luis and Ana, the two `curl` of the text's
 * diagrams and of «Pruébalo», `ejemplos/orden.ts` with what it prints, the text's four ways out, ten
 * people asking at once, and the analogy's restaurant with a single waiter.
 *
 * Its persistent state is what the reader has seen happen: what waits in each queue, what the
 * thread runs, the helpers at work, what Luis, Ana and each `curl` got back, the lines run and printed,
 * where the waiter is, the ways out lit and how many of the ten were served. The bars that fill
 * while something is calculated are drawn by the scene and undone by `reset`. Its markup is
 * Loop.astro; its labels, strings.ts. Ids start with `lp-`.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Kind, Point, World } from '../../core/types';
import { strings, type Clock, type Item, type Out } from './strings';

/** How many things the queue's drawing holds at once. */
export const QUEUE_SLOTS = 3;
export const HELPERS = 4;
export const PEOPLE = 10;

/** Where the waiter stands: beside a table, or at the kitchen's pass, where the bell is. */
export type Spot = 1 | 2 | 3 | 'pass';
/** The waiter's left edge for each spot, in em: under each table's centre, or the bell's (loop.css). */
export const SPOTS: Record<Spot, number> = { 1: 1.5, 2: 6.5, 3: 11.5, pass: 15 };

export interface LoopState {
  /** What waits in the queue, the first one first. */
  lpQueue: readonly Item[];
  /** What waits in the fulfilled promises' queue (the order of things). */
  lpPromises: readonly Item[];
  /** What your code's thread runs now; '' when it is free. */
  lpRun: Item | '';
  /** How many of libuv's four helper threads are busy (the first ones). */
  lpHelpers: number;
  /** The operating system watches a connection for libuv. */
  lpOsWaiting: boolean;
  lpLuis: Clock | '';
  lpAna: Clock | '';
  /** The first `curl`'s route: /lento, then /lento-asincrono. */
  lpSlowRoute: 'slow' | 'slowAsync';
  lpSlowOut: Out | '';
  lpListOut: Out | '';
  /** The line of orden.ts that runs (0: none), and how many lines it has printed. */
  lpLine: 0 | 1 | 2 | 3 | 4;
  lpPrinted: 0 | 1 | 2 | 3 | 4;
  lpWaiter: Spot;
  /** Table 3's potatoes, on the table and being peeled. */
  lpPotatoes: boolean;
  /** How many of the text's ways out are lit. */
  lpWays: 0 | 1 | 2 | 3 | 4;
  /** How many of the ten people have their report. */
  lpServed: number;
}

export const INITIAL: LoopState = {
  lpQueue: [],
  lpPromises: [],
  lpRun: '',
  lpHelpers: 0,
  lpOsWaiting: false,
  lpLuis: '',
  lpAna: '',
  lpSlowRoute: 'slow',
  lpSlowOut: '',
  lpListOut: '',
  lpLine: 0,
  lpPrinted: 0,
  lpWaiter: 1,
  lpPotatoes: false,
  lpWays: 0,
  lpServed: 0,
};

/** Requests that arrive from outside; everything else in a queue is a piece of your code. */
const REQUESTS: ReadonlySet<Item> = new Set<Item>([
  'luis',
  'ana',
  'req1',
  'req2',
  'req3',
  'products',
  'slow',
  'slowAsync',
  'list',
  'report',
]);

/** A request is an HTTP message; a piece of code is something the server runs itself. */
export function kindOf(item: Item): Kind {
  return REQUESTS.has(item) ? 'http' : 'tcp';
}

/** The queue with `item` at its end. More than the drawing holds is a mistake in a choreography. */
export function enqueue(queue: readonly Item[], item: Item): Item[] {
  if (queue.length >= QUEUE_SLOTS) throw new Error(`[loop] The queue holds ${QUEUE_SLOTS} at most`);
  return [...queue, item];
}

/** The queue without its first item: the event loop takes the first thing. */
export function dequeue(queue: readonly Item[]): Item[] {
  if (queue.length === 0) throw new Error('[loop] The event loop takes from an empty queue');
  return queue.slice(1);
}

/** What the tenth's mark says: a check for each one served, and the tenth's wait. */
export function mark(person: number, served: number, wait: string): string {
  if (person > served) return String(person);
  return person === PEOPLE ? wait : '✓';
}

type D = Director<LoopState>;

/** From one actor (or part) to another, between their facing sides. */
export function route(d: Pick<D, 'box'>, from: string | Element, to: string | Element): Point[] {
  return facing(d.box(from), d.box(to));
}

const path = (points: readonly Point[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

const EASE = 'cubic-bezier(.45,.05,.35,1)';

/** A bar's fill, tweened for the run (pause, speed, cancel); an instant run sets its end at once. */
export async function fill(d: D, selector: string, to: number, dur = 900): Promise<void> {
  const bar = d.q(selector);
  const from = bar.style.transform || 'scaleX(0)';
  const end = `scaleX(${to.toFixed(3)})`;
  bar.style.transform = end;
  if (d.run.instant) return;
  await d.run.track(
    d.run.adopt(
      bar.animate([{ transform: from }, { transform: end }], { duration: dur, easing: 'linear' }),
    ),
  );
}

/** Empties a bar at once (the next calculation starts from nothing). */
export function empty(d: D, selector: string): void {
  d.q(selector).style.transform = '';
}

/** The waiter walks to a spot. */
export async function walk(d: D, to: Spot, dur = 900): Promise<void> {
  const from = SPOTS[d.state.lpWaiter];
  d.set({ lpWaiter: to });
  if (d.run.instant) return;
  await d.run.track(
    d.run.adopt(
      d
        .q('#lp-waiter')
        .animate(
          [{ transform: `translateX(${from}em)` }, { transform: `translateX(${SPOTS[to]}em)` }],
          { duration: dur, easing: EASE },
        ),
    ),
  );
}

const text = (root: ParentNode, selector: string, content: string) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = content;
};

/** A slot that holds an item (a queue's, the thread's): its label and its colour. */
function slot(root: ParentNode, selector: string, item: Item | undefined, label: string): void {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.textContent = label;
  element.classList.toggle('is-on', !!item);
  if (item) element.dataset.kind = kindOf(item);
  else delete element.dataset.kind;
}

/** The lines between actors that talk, drawn whenever both are on stage (dashed: not a message). */
const LINKS: readonly (readonly [string, string, 'dashed'?])[] = [
  ['nodeapi', 'libuv', 'dashed'],
  ['libuv', 'os', 'dashed'],
];

function link(d: D, a: string, b: string, dashed = false): void {
  d.stage.links.append(
    d.svg('path', {
      d: path(route(d, a, b)),
      class: dashed ? 'scene-link scene-link--dashed' : 'scene-link',
    }),
  );
}

export const loop: World<LoopState> = {
  id: 'loop',
  views: {
    story: ['luis', 'ana', 'nodeapi'],
    dining: ['dining'],
    loop: ['luis', 'ana', 'nodeapi', 'eventq'],
    pool: ['nodeapi', 'eventq', 'libuv', 'os'],
    bench: ['slowcurl', 'listcurl', 'nodeapi', 'eventq', 'libuv'],
    order: ['orderts', 'nodeapi', 'promiseq', 'eventq', 'stdout'],
    ways: ['ways', 'nodeapi', 'eventq'],
    ten: ['ten', 'nodeapi', 'libuv'],
  },
  // As large as the type allows (stage.ts caps it at 21 px): the views are small next to a desktop stage.
  zoom: {
    story: 1.75,
    dining: 1.75,
    loop: 1.75,
    pool: 1.75,
    bench: 1.75,
    order: 1.75,
    ways: 1.75,
    ten: 1.75,
  },

  reset(root) {
    root
      .querySelectorAll<HTMLElement>('.lp-bar i')
      .forEach((bar) => bar.style.removeProperty('transform'));
    root.querySelectorAll('.person').forEach((person) => person.classList.remove('is-talking'));
  },

  apply(root, s, lang) {
    const t = strings[lang];
    for (let i = 0; i < QUEUE_SLOTS; i++) {
      const item = s.lpQueue[i];
      slot(root, `#lp-q-${i + 1}`, item, item ? t.items[item] : '');
    }
    const promise = s.lpPromises[0];
    slot(root, '#lp-p-1', promise, promise ? t.items[promise] : '');
    slot(root, '#lp-run', s.lpRun || undefined, s.lpRun ? t.items[s.lpRun] : t.free);
    for (let i = 1; i <= HELPERS; i++) {
      root.querySelector(`#lp-h-${i}`)?.classList.toggle('is-on', i <= s.lpHelpers);
    }
    text(root, '#lp-os-wait', s.lpOsWaiting ? t.osWaiting : '');
    root.querySelector('#lp-os-wait')?.classList.toggle('is-on', s.lpOsWaiting);
    text(root, '#lp-luis-clock', s.lpLuis ? t.clocks[s.lpLuis] : '');
    text(root, '#lp-ana-clock', s.lpAna ? t.clocks[s.lpAna] : '');
    text(root, '#lp-slow-route', t.routes[s.lpSlowRoute]);
    text(root, '#lp-slow-out', s.lpSlowOut ? t.outputs[s.lpSlowOut] : '');
    text(root, '#lp-list-out', s.lpListOut ? t.outputs[s.lpListOut] : '');
    for (let i = 1; i <= 4; i++) {
      root.querySelector(`#lp-line-${i}`)?.classList.toggle('is-lit', s.lpLine === i);
      root.querySelector(`#lp-out-${i}`)?.classList.toggle('is-on', i <= s.lpPrinted);
      root.querySelector(`#lp-way-${i}`)?.classList.toggle('is-lit', i <= s.lpWays);
    }
    const waiter = root.querySelector<HTMLElement>('#lp-waiter');
    if (waiter) waiter.style.transform = `translateX(${SPOTS[s.lpWaiter]}em)`;
    root.querySelector('#lp-dining')?.classList.toggle('is-peeling', s.lpPotatoes);
    for (let i = 1; i <= PEOPLE; i++) {
      const cell = root.querySelector(`#lp-ten-${i}`);
      cell?.classList.toggle('is-served', i <= s.lpServed);
      text(root, `#lp-ten-${i}-mark`, mark(i, s.lpServed, t.tenth));
    }
  },

  wires(d) {
    // The queue feeds the thread, through the fulfilled promises' queue when it is on stage.
    if (d.shown('promiseq')) {
      if (d.shown('nodeapi')) link(d, 'promiseq', 'nodeapi');
      if (d.shown('eventq')) link(d, 'eventq', 'promiseq');
    } else if (d.shown('nodeapi') && d.shown('eventq')) {
      link(d, 'eventq', 'nodeapi');
    }
    // Luis and Ana talk to the queue when it is on stage, and to the API when it is not.
    const door = d.shown('eventq') ? 'eventq' : 'nodeapi';
    for (const person of ['luis', 'ana']) {
      if (d.shown(person) && d.shown(door)) link(d, person, door);
    }
    for (const [a, b, dashed] of LINKS) {
      if (d.shown(a) && d.shown(b)) link(d, a, b, !!dashed);
    }
  },
};
