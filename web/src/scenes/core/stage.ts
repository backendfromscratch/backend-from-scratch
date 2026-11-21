/**
 * The stage: a camera over a board (spec §4.3). The visible actors sit on the board, absolutely
 * positioned, and only ever move with transforms, so changing view never shifts the page's layout
 * (Google's CLS counts every shift during a visit, and scrolling is not input). Each view's grid is
 * laid out on an invisible copy of the actors, `.scene-layout`; its boxes are measured there, the
 * board's actors slide to those places, and one transform on the board scales and centres the whole
 * scene: that is the zoom.
 */
import { sidePoint } from './geometry';
import type { Run } from './run';
import type { Box, Point, Side, Size } from './types';

/** How long the camera takes to move to a new view, in ms at normal speed. */
const MOVE_MS = 820;
const EASE = 'cubic-bezier(.55,0,.2,1)';
/** The largest type the zoom may reach, in px. */
const MAX_TYPE_PX = 21;
const MIN_ZOOM = 0.55;

interface Camera {
  x: number;
  y: number;
  k: number;
}

const cameraTransform = (c: Camera) =>
  `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) scale(${c.k.toFixed(4)})`;
const at = (p: Point) => `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;

export class Stage {
  readonly root: HTMLElement;
  /** The visible actors, placed with transforms. */
  readonly board: HTMLElement;
  /** An invisible copy of the actors, where each view's grid is laid out and measured. */
  readonly layout: HTMLElement;
  /** What moves or appears over the actors: packets, labels, bubbles. */
  readonly fx: HTMLElement;
  readonly wires: SVGSVGElement;
  readonly links: SVGGElement;
  readonly tube: SVGGElement;
  readonly trails: SVGGElement;
  readonly caption: HTMLElement;
  private camera: Camera = { x: 0, y: 0, k: 1 };
  /** Where each actor on stage is, in board units (px at the base type size). */
  private places = new Map<HTMLElement, Point>();
  private placed = false;

  constructor(root: HTMLElement) {
    const need = <T extends Element>(selector: string): T => {
      const found = root.querySelector<T>(selector);
      if (!found) throw new Error(`[scenes] The stage has no ${selector}`);
      return found;
    };
    this.root = root;
    this.board = need('.scene-board');
    this.layout = need('.scene-layout');
    this.fx = need('.scene-fx');
    this.wires = need('.scene-wires');
    this.links = need('[data-wires="links"]');
    this.tube = need('[data-wires="tube"]');
    this.trails = need('[data-wires="trails"]');
    this.caption = need('.scene-caption');
  }

  actors(): HTMLElement[] {
    return [...this.board.querySelectorAll<HTMLElement>('[data-actor]')];
  }

  actor(name: string): HTMLElement | null {
    return this.board.querySelector<HTMLElement>(`[data-actor="${name}"]`);
  }

  /** An actor by name (its `.anchor`, the part that matters), or anything on stage by selector. */
  el(target: string | Element): Element | null {
    if (typeof target !== 'string') return target;
    if (/^[#.[]/.test(target))
      return this.board.querySelector(target) ?? this.fx.querySelector(target);
    const actor = this.actor(target);
    return actor ? (actor.querySelector('.anchor') ?? actor) : null;
  }

  /** A box in stage pixels, as it is drawn (transforms included). */
  box(target: string | Element): Box {
    const element = this.el(target);
    if (!element) throw new Error(`[scenes] Nothing on stage matches ${String(target)}`);
    const r = element.getBoundingClientRect();
    const origin = this.root.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
  }

  pt(target: string | Element, side: Side = 'c', dx = 0, dy = 0): Point {
    return sidePoint(this.box(target), side, dx, dy);
  }

  /** Whether an actor is on stage and laid out (a narrow layout may hide it with CSS). */
  shown(name: string): boolean {
    const actor = this.actor(name);
    return !!actor && !actor.hidden && actor.getClientRects().length > 0;
  }

  size(): Size {
    const r = this.root.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  /** The type size of the labels and packets, in px: the board's, zoomed. */
  zoomedType(): number {
    return parseFloat(getComputedStyle(this.layout).fontSize) * this.camera.k;
  }

  clearFx(): void {
    this.fx.replaceChildren();
    this.trails.replaceChildren();
    this.links.replaceChildren();
    this.tube.replaceChildren();
  }

  sizeWires(): void {
    const { w, h } = this.size();
    this.wires.setAttribute('viewBox', `0 0 ${w.toFixed(1)} ${h.toFixed(1)}`);
  }

  /** Lays a view out on the invisible copy and measures where its actors go and the camera that fits them. */
  private plan(
    view: string,
    onStage: ReadonlySet<string>,
    maxZoom: number,
  ): { camera: Camera; places: Map<string, Point> } {
    this.root.dataset.view = view;
    // A fresh copy of the actors as they are now (their content decides their size), without ids.
    const copies = [...this.board.children].map((child) => {
      const copy = child.cloneNode(true) as HTMLElement;
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      return copy;
    });
    this.layout.replaceChildren(...copies);
    for (const actor of this.layout.querySelectorAll<HTMLElement>('[data-actor]')) {
      actor.hidden = !onStage.has(actor.dataset.actor ?? '');
      actor.style.removeProperty('transform');
      actor.style.removeProperty('opacity');
    }
    for (const group of this.layout.querySelectorAll<HTMLElement>('[data-group]')) {
      group.hidden = ![...group.querySelectorAll<HTMLElement>('[data-actor]')].some(
        (actor) => !actor.hidden,
      );
    }

    const origin = this.layout.getBoundingClientRect();
    const places = new Map<string, Point>();
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const actor of this.layout.querySelectorAll<HTMLElement>('[data-actor]')) {
      if (actor.hidden || actor.getClientRects().length === 0) continue;
      const r = actor.getBoundingClientRect();
      const x = r.left - origin.left;
      const y = r.top - origin.top;
      places.set(actor.dataset.actor ?? '', { x, y });
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + r.width);
      bottom = Math.max(bottom, y + r.height);
    }
    if (places.size === 0) return { camera: this.camera, places };

    const style = getComputedStyle(this.layout);
    const pad = {
      left: parseFloat(style.paddingLeft),
      right: parseFloat(style.paddingRight),
      top: parseFloat(style.paddingTop),
      bottom: parseFloat(style.paddingBottom),
    };
    const stage = this.size();
    const room = { w: stage.w - pad.left - pad.right, h: stage.h - pad.top - pad.bottom };
    const content = { w: Math.max(1, right - left), h: Math.max(1, bottom - top) };
    const largest = Math.min(maxZoom, MAX_TYPE_PX / parseFloat(style.fontSize));
    const k = Math.max(
      MIN_ZOOM,
      Math.min(largest, Math.min(room.w / content.w, room.h / content.h) * 0.94),
    );
    return {
      places,
      camera: {
        k,
        x: pad.left + (room.w - content.w * k) / 2 - left * k,
        y: pad.top + (room.h - content.h * k) / 2 - top * k,
      },
    };
  }

  /**
   * Shows a view: its actors slide to their places and the camera moves and zooms to fit them.
   * Without `animate` (the first frame, a redraw, reduced motion), everything is put in place at once.
   */
  async setView(
    view: string,
    onStage: ReadonlySet<string>,
    run: Run,
    animate: boolean,
    maxZoom: number,
  ): Promise<void> {
    const { camera, places } = this.plan(view, onStage, maxZoom);
    const moving = animate && !run.instant && this.placed;
    const fromCamera = this.camera;
    const before = new Map(this.places);
    const visibleBefore = new Set(this.actors().filter((actor) => !actor.hidden));
    this.camera = camera;
    this.fx.style.fontSize = `${this.zoomedType().toFixed(2)}px`;
    this.links.replaceChildren();
    this.tube.replaceChildren();
    this.board.style.transform = cameraTransform(camera);

    const moves: Promise<void>[] = [];
    const track = (animation: Animation) => moves.push(run.track(run.adopt(animation)));
    if (moving) {
      track(
        this.board.animate(
          [{ transform: cameraTransform(fromCamera) }, { transform: cameraTransform(camera) }],
          { duration: MOVE_MS, easing: EASE },
        ),
      );
    }

    for (const actor of this.actors()) {
      const place = places.get(actor.dataset.actor ?? '');
      if (place) {
        actor.hidden = false;
        actor.style.transform = at(place);
        this.places.set(actor, place);
        if (!moving) continue;
        const from = before.get(actor);
        if (from && visibleBefore.has(actor)) {
          if (from.x !== place.x || from.y !== place.y) {
            track(
              actor.animate([{ transform: at(from) }, { transform: at(place) }], {
                duration: MOVE_MS,
                easing: EASE,
              }),
            );
          }
          continue;
        }
        // An actor marked data-morph-from grows out of the one it replaces (the server room out of the server).
        const source = actor.dataset.morphFrom ? this.actor(actor.dataset.morphFrom) : null;
        const sourcePlace = source ? before.get(source) : undefined;
        if (source && sourcePlace && visibleBefore.has(source)) {
          const sx = source.offsetWidth / Math.max(1, actor.offsetWidth);
          const sy = source.offsetHeight / Math.max(1, actor.offsetHeight);
          track(
            actor.animate(
              [
                {
                  transform: `${at(sourcePlace)} scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`,
                  opacity: 0.4,
                },
                { transform: at(place), opacity: 1 },
              ],
              { duration: MOVE_MS, easing: EASE },
            ),
          );
        } else {
          track(
            actor.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: 520,
              delay: 260,
              easing: 'ease-out',
              fill: 'backwards',
            }),
          );
        }
      } else {
        this.places.delete(actor);
        if (moving && visibleBefore.has(actor)) {
          const fade = run.adopt(
            actor.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 320,
              easing: 'ease-in',
              fill: 'forwards',
            }),
          );
          moves.push(
            run.track(fade).then(() => {
              actor.hidden = true;
              fade.cancel();
            }),
          );
        } else {
          actor.hidden = true;
        }
      }
    }
    if (!this.placed) {
      this.placed = true;
      this.board.classList.add('is-placed');
    }
    await Promise.all(moves);
  }
}
