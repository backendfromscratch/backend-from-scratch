/**
 * The vectors world (spec §4.2; the lesson «Embeddings y búsqueda semántica con pgvector»): the
 * catalogue searched by name, the model that turns a text into a vector, the map of the 20 products
 * (not to scale: it keeps the order of the text's distances), two arrows and their angle, the
 * models volume, the products table with its vectors, HNSW's three floors, PostgreSQL with the
 * outbox, the queue and the worker, `docker stats` before and after the model, and the text's
 * table of searches. It also uses the assistant world's `chat`, `api` and `shell`. Its persistent
 * state is what the reader has seen happen: the map's products and question, the model in its
 * volume, the table's vectors and distances, the new product's vector and the memory. Everything
 * else a scene lights up is undone by `reset`. Its markup is Vectors.astro; its labels and data,
 * strings.ts. Ids start with `vx-`.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Kind, Locale, Point, World } from '../../core/types';
import { strings, type Product } from './strings';

export interface VectorsState {
  /** The map shows its products, and which question has landed on it. */
  vxDots: boolean;
  vxPin: '' | 'cold' | 'word';
  /** The model is in its volume (downloaded once). */
  vxModel: boolean;
  /** The table's rows have their vectors (else NULL), and the distances to «algo para el frío». */
  vxVectors: boolean;
  vxRanked: boolean;
  /** The lesson's new product: not created yet, created without its vector, or with it. */
  vxSocks: 'none' | 'null' | 'vector';
  /** `docker stats`: without the model, with it loaded, and the API killed by one more process. */
  vxMemory: 0 | 1 | 2;
}

export const VECTORS_INITIAL: VectorsState = {
  vxDots: true,
  vxPin: '',
  vxModel: true,
  vxVectors: true,
  vxRanked: false,
  vxSocks: 'none',
  vxMemory: 0,
};

/** The largest memory the bars draw, in MiB: the text's largest figure fits. */
export const MEMORY_SCALE = 600;

/** The products nearest to a point of the map, nearest first (the map's own distances). */
export function nearest(products: readonly Product[], at: readonly [number, number]): Product[] {
  const far = (p: Product) => Math.hypot(p.at[0] - at[0], p.at[1] - at[1]);
  return [...products].sort((a, b) => far(a) - far(b));
}

/** The distances of the table's rows, ranked: 1 for the nearest, in each language's figures. */
export function ranks(rows: readonly (readonly [string, string])[]): number[] {
  const value = (text: string) => Number(text.replace(',', '.'));
  const sorted = [...rows].map(([, d]) => value(d)).sort((a, b) => a - b);
  return rows.map(([, d]) => sorted.indexOf(value(d)) + 1);
}

/** A product's dot on the map, by its name in the page's language. */
export function dot(lang: Locale, name: string): string {
  const i = strings[lang].products.findIndex((p) => p.name === name);
  if (i < 0) throw new Error(`[vectors] No product called ${name}`);
  return `#vx-dot-${i + 1}`;
}

type D = Director<VectorsState>;

/** From one actor (or part) to another, between their facing sides, on lane -1 or 1 (or the middle). */
export function route(d: Pick<D, 'box'>, from: string, to: string, lane = 0): Point[] {
  const a = d.box(from);
  const b = d.box(to);
  const [p, q] = facing(a, b);
  const across = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
  const off = lane * (across ? Math.min(a.h, b.h) : Math.min(a.w, b.w)) * 0.2;
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

/**
 * A line on the map from one point to another, in the map's own em, drawn from end to end and left
 * there until the scene ends (inside the map, so the map's box does not cover it).
 */
export async function connect(
  d: D,
  from: readonly [number, number],
  to: readonly [number, number],
  kind: Kind,
  dashed = false,
  dur = 600,
): Promise<void> {
  const drawn = d.svg('path', {
    d: `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`,
    class: dashed ? 'vx-line vx-line--dashed' : 'vx-line',
    'data-kind': kind,
  });
  d.q('#vx-lines').append(drawn);
  await d.draw(drawn, dur);
}

const path = (points: readonly Point[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

function line(d: D, points: readonly Point[], dashed = false): void {
  d.stage.links.append(
    d.svg('path', {
      d: path(points),
      class: dashed ? 'scene-link scene-link--dashed' : 'scene-link',
    }),
  );
}

/** A part lights up (reset puts it out). */
export function light(d: D, selector: string, kind: Kind = 'dns'): void {
  d.q(selector).classList.add('is-lit');
  d.glow(selector, kind);
}

/**
 * A transform animated on an element inside an actor (the arrow's angle, a bar's length), adopted by
 * the scene's run so pausing, the speed and cancelling reach it; an instant run sets the end at once.
 */
export async function animate(
  d: D,
  selector: string,
  from: string,
  to: string,
  dur = 900,
): Promise<void> {
  const element = d.q(selector);
  element.style.transform = to;
  if (d.run.instant) return;
  await d.run.track(
    d.run.adopt(
      element.animate([{ transform: from }, { transform: to }], {
        duration: dur,
        easing: 'cubic-bezier(.45,.05,.35,1)',
      }),
    ),
  );
}

/** The arrow's resting angle, before a scene turns it. */
export const ARROW_REST = 40;
export const arrowAngle = (deg: number) => `rotate(${-deg}deg)`;
/** A memory bar's length for a figure in MiB. */
export const barLength = (mib: number) => `scaleX(${(mib / MEMORY_SCALE).toFixed(4)})`;

/** A piece of text between each language's quotation marks: «…» in Spanish, “…” in English. */
export const quote = (lang: Locale, value: string) => (lang === 'es' ? `«${value}»` : `“${value}”`);

const text = (root: ParentNode, selector: string, value: string) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
};
const on = (root: ParentNode, selector: string, value: boolean) =>
  root.querySelector(selector)?.classList.toggle('is-on', value);

export const vectors: World<VectorsState> = {
  id: 'vectors',
  views: {
    byname: ['chat', 'catalog'],
    embed: ['embedder', 'plane'],
    cosine: ['angle', 'plane'],
    lazyload: ['api', 'modelvol', 'worker'],
    pgv: ['vtable'],
    graph: ['hnsw'],
    map: ['plane'],
    outbox: ['api', 'pg', 'queue', 'worker'],
    ram: ['memory'],
    compare: ['words'],
    tryvec: ['shell', 'vtable'],
  },
  zoom: { embed: 1.8, cosine: 1.8, pgv: 1.6, graph: 2, map: 2.2, ram: 1.6, compare: 1.6 },

  reset(root) {
    root
      .querySelectorAll('.vx-room.is-on, .vx-dot.is-on')
      .forEach((room) => room.classList.remove('is-on'));
    root.querySelectorAll('.is-lit').forEach((part) => part.classList.remove('is-lit'));
    root
      .querySelectorAll('.vx-node')
      .forEach((node) => node.classList.remove('is-path', 'is-best', 'is-missed'));
    root.querySelectorAll('.vx-written').forEach((cell) => (cell.textContent = ''));
    root.querySelector('#vx-lines')?.replaceChildren();
    const arrow = root.querySelector<HTMLElement>('#vx-arrow');
    if (arrow) arrow.style.transform = arrowAngle(ARROW_REST);
  },

  apply(root, s, lang) {
    const t = strings[lang];
    root.querySelector('#vx-plane')?.classList.toggle('is-empty', !s.vxDots);
    on(root, '#vx-pin-cold', s.vxPin === 'cold');
    on(root, '#vx-pin-word', s.vxPin === 'word');
    text(root, '#vx-query', s.vxPin ? quote(lang, t[s.vxPin].query) : '');
    root.querySelector('#vx-volume')?.classList.toggle('is-full', s.vxModel);
    const placed = ranks(t.table.rows);
    t.table.rows.forEach(([, distance], i) => {
      text(root, `#vx-emb-${i + 1}`, s.vxVectors ? '[…]' : 'NULL');
      text(root, `#vx-dist-${i + 1}`, s.vxRanked ? distance : '');
      text(root, `#vx-rank-${i + 1}`, s.vxRanked ? String(placed[i]) : '');
    });
    on(root, '#vx-added', s.vxSocks !== 'none');
    text(root, '#vx-emb-added', s.vxSocks === 'vector' ? '[…]' : 'NULL');
    on(root, '#vx-pg-row', s.vxSocks !== 'none');
    text(root, '#vx-pg-emb', s.vxSocks === 'vector' ? '[…]' : 'NULL');
    t.memory.rows.forEach(([, before, after], i) => {
      const value = s.vxMemory > 0 ? after : before;
      const bar = root.querySelector<HTMLElement>(`#vx-bar-${i + 1}`);
      if (bar) bar.style.transform = barLength(value);
      text(root, `#vx-mib-${i + 1}`, `${value} ${t.memory.unit}`);
    });
    root.querySelector('#vx-memory')?.classList.toggle('is-killed', s.vxMemory === 2);
  },

  wires(d) {
    const link = (a: string, b: string, dashed = false) => {
      if (d.shown(a) && d.shown(b)) line(d, route(d, a, b), dashed);
    };
    link('chat', 'catalog');
    link('embedder', 'plane', true);
    link('api', 'modelvol', true);
    link('worker', 'modelvol', true);
    link('api', 'pg');
    link('queue', 'pg');
    link('queue', 'worker');
    link('worker', 'pg');
    link('shell', 'vtable');
  },
};
