/**
 * The rag world (spec §4.2; the lesson «Qué es RAG y cómo responder con tus documentos»): the help's
 * returns page as Markdown, the table of the help's 16 chunks, one chunk's text, the three nearest
 * chunks of a search (or a search by words), the assistant's rules, the search results as
 * search_result blocks, the shop's JSON answer with its sources, and the evals that catch
 * hallucinations. It also uses the assistant world's `chat`, `api`, `model` and `shell`, and the
 * vectors world's `worker`. Its persistent state is whether the table has its chunks and how many,
 * what the top-k shows, which results the search_result card holds and the JSON answer's sources.
 * Everything else a scene lights up is undone by `reset`. Its markup is Rag.astro; its labels and
 * data, strings.ts. Ids start with `rg-`.
 */
import type { Director } from '../../core/director';
import { facing } from '../../core/geometry';
import type { Locale, Point, World } from '../../core/types';
import { strings, type List } from './strings';

export interface RagState {
  /** The table has the help's chunks (else it is empty), and how many rows it holds. */
  rgChunks: boolean;
  rgCount: 16 | 17;
  /** What the top-k shows. */
  rgList: List | '';
  /** The search the search_result card holds: the mug question's three results or the physical shop's. */
  rgResults: 'mug' | 'physical';
  /** The JSON answer: no answer yet, an answer that cites a section, or one that cites none. */
  rgSources: '' | 'cited' | 'none';
}

export const RAG_INITIAL: RagState = {
  rgChunks: true,
  rgCount: 16,
  rgList: '',
  rgResults: 'mug',
  rgSources: '',
};

/** The rows of the top-k: three, the most a search returns here (`k`). */
export const TOP = 3;

/** A section's tile in the table, by its name in the page's language (`#rg-tile-1` to `-16`). */
export function tile(lang: Locale, section: string): string {
  const pages = strings[lang].pages;
  const p = pages.findIndex((page) => page.sections.includes(section as never));
  if (p < 0) throw new Error(`[rag] No section called ${section}`);
  return `#rg-tile-${p * 4 + pages[p]!.sections.indexOf(section as never) + 1}`;
}

/** A distance, in either language's figures, as a number. */
const value = (distance: string) => Number(distance.replace(',', '.'));

/** Whether a threshold would drop a row: its distance is past it (a row by words has none). */
export function dropped(distance: string, threshold: string): boolean {
  return distance !== '' && value(distance) > value(threshold);
}

/** The sections the JSON answer lists: the cited one, or none (an uncited «no lo sé»). */
export function sources(lang: Locale, s: Pick<RagState, 'rgSources'>): string {
  if (s.rgSources === '') return '';
  if (s.rgSources === 'none') return '[]';
  return `["${strings[lang].thirty}"]`;
}

type D = Director<RagState>;

/** From one actor (or part) to another, between their facing sides, on lane -1 or 1 (or the middle). */
function route(d: Pick<D, 'box'>, from: string, to: string, lane = 0): Point[] {
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

/** A part lights up (reset puts it out). */
export function light(d: Pick<D, 'q' | 'glow'>, selector: string): void {
  d.q(selector).classList.add('is-lit');
  d.glow(selector, 'dns');
}

const path = (points: readonly Point[]) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

/** The lines between actors that talk, drawn whenever both are on stage (dashed: not a message). */
const LINKS: readonly (readonly [string, string, 'dashed'?])[] = [
  ['api', 'helpdb'],
  ['worker', 'helpdb'],
  ['shell', 'helpdb'],
  ['helpdoc', 'helpdb', 'dashed'],
  ['helpdb', 'topk', 'dashed'],
  ['rulecard', 'model', 'dashed'],
  ['results', 'model'],
  ['api', 'ragjson'],
  ['ragevals', 'api'],
];

const text = (root: ParentNode, selector: string, content: string) => {
  const element = root.querySelector(selector);
  if (element) element.textContent = content;
};

export const rag: World<RagState> = {
  id: 'rag',
  views: {
    retrieve: ['chat', 'api', 'model', 'helpdb'],
    chunking: ['helpdoc', 'helpdb', 'chunkcard'],
    swap: ['worker', 'helpdb', 'api'],
    nearest3: ['helpdb', 'topk'],
    rulebook: ['chat', 'api', 'model', 'rulecard'],
    citing: ['results', 'model', 'api', 'ragjson'],
    evalcheck: ['ragevals', 'api', 'model'],
    tryrag: ['shell', 'helpdb', 'topk'],
  },

  reset(root) {
    root
      .querySelectorAll('.rg-room.is-on, .rg-tile.is-on')
      .forEach((room) => room.classList.remove('is-on'));
    root
      .querySelectorAll('[class*="rg-"]')
      .forEach((part) => part.classList.remove('is-lit', 'is-cut', 'is-new'));
    root.querySelectorAll('.rg-mark').forEach((mark) => {
      mark.textContent = '';
      delete (mark as HTMLElement).dataset.mark;
    });
  },

  apply(root, s, lang) {
    const t = strings[lang];
    root.querySelector('#rg-db')?.classList.toggle('is-empty', !s.rgChunks);
    text(root, '#rg-count', String(s.rgChunks ? s.rgCount : 0));
    const list = s.rgList ? t.lists[s.rgList] : null;
    text(root, '#rg-query', list ? list.query : '');
    text(
      root,
      '#rg-how',
      s.rgList === 'sentence' || s.rgList === 'keywords' ? t.byWords : t.byMeaning,
    );
    for (let i = 0; i < TOP; i++) {
      const row = list?.rows[i];
      text(root, `#rg-sec-${i + 1}`, row ? row[0] : '');
      text(root, `#rg-dist-${i + 1}`, row ? row[1] : '');
      root.querySelector(`#rg-row-${i + 1}`)?.classList.toggle('is-empty', !row);
    }
    t.lists[s.rgResults].rows.forEach(([section], i) => text(root, `#rg-result-${i + 1}`, section));
    root.querySelector('#rg-json')?.classList.toggle('is-answered', s.rgSources !== '');
    text(root, '#rg-sources', sources(lang, s));
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
