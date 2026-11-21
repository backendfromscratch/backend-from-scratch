/**
 * The shared types of the scene engine (docs/specs/2026-11-20-visual-lessons-design.md).
 * Imports are relative inside src/scenes/: Vitest does not know the `~/` alias.
 */
import type { Locale } from '../../lib/locales';
import type { Director } from './director';

export type { Locale };

/** Every string a reader sees, in both languages: TypeScript requires the two. */
export type Text = Record<Locale, string>;

/** The colour of a message, a chip or a phase: one per protocol, plus a neutral one. */
export type Kind = 'dns' | 'tcp' | 'tls' | 'http' | 'muted';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** A box on the stage, in pixels from its top-left corner. */
export interface Box extends Point, Size {}

/** A side of a box: centre, top, bottom, left, right and the corners. */
export type Side = 'c' | 't' | 'b' | 'l' | 'r' | 'tl' | 'tr' | 'bl' | 'br';

/** Where a label goes with respect to a point. */
export type Place = 'above' | 'below' | 'left' | 'right' | 'center';

/** Choices the reader makes with a control of the panel (the RTT scene's near or far server). */
export type Options = Record<string, string>;

/**
 * A set of actors drawn together (spec §4.2): their markup is an Astro component of the world; this
 * is what the engine needs of it.
 */
export interface World<S> {
  id: string;
  /** For each view, the actors on stage (their `data-actor`). */
  views: Readonly<Record<string, readonly string[]>>;
  /** The largest zoom of a view; 1.5 if not given. */
  zoom?: Readonly<Record<string, number>>;
  /** Undoes what a scene changed that the next one must not inherit (an open book, a lit row…). */
  reset(root: HTMLElement): void;
  /** Draws the persistent state, without animation. */
  apply?(root: HTMLElement, state: S, lang: Locale): void;
  /** Draws the lines between the actors on stage, for the current view and state. */
  wires?(d: Director<S>): void;
}

/** One scene: what plays while one part of the text is being read (spec §3.2). */
export interface SceneDef<S> {
  /** The id of its cue, `<Scene id="…" />`, the same in both languages. */
  id: string;
  view: string;
  kind: Kind;
  chip: Text;
  title: Text;
  /** The options it reads; the panel shows their controls only during this scene. */
  options?: readonly string[];
  /** The persistent state at its start and at its end. */
  start(options: Options): Partial<S>;
  end(options: Options): Partial<S>;
  play(d: Director<S>): Promise<void>;
}

/** What the panel draws under the stage and how the engine talks to it (the time bar). */
export interface Instrument<S> {
  /** The name ScenePanel.astro uses to render its markup. */
  name: string;
  create(panel: HTMLElement, lang: Locale): InstrumentView<S>;
}

export interface InstrumentView<S> {
  apply(state: S): void;
  /** The clock it shows, in ms of the lesson's story (not the run's clock). */
  clock(): number;
  setClock(ms: number): void;
  /** Marks a phase as done (it fills) or not. */
  setDone(phase: string, done: boolean): void;
  hint(phase: string, on: boolean): void;
}

/** A lesson's choreography: src/scenes/lessons/<translationKey>.ts, as its default export. */
export interface LessonModule<S> {
  /** The state before any scene's `start`. */
  initial: S;
  worlds: readonly World<S>[];
  instrument?: Instrument<S>;
  scenes: readonly SceneDef<S>[];
}
