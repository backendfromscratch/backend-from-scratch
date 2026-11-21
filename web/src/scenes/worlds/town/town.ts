/**
 * The town world: the analogy of «De la URL a la página» (ordering furniture from a shop in another
 * city). Your home, the phone book, the shop with its shopkeeper and the road between them. Nothing
 * persists from one scene to the next: every scene of this world starts with the book closed and no
 * parcel anywhere. Its markup is Town.astro.
 */
import type { Director } from '../../core/director';
import { curve, lerp } from '../../core/geometry';
import type { Point, World } from '../../core/types';

type D = Director<unknown>;

/** The phone line: an arc from your phone over the road to the shopkeeper's. */
export function callRoute(d: Pick<D, 'pt'>): Point[] {
  const a = d.pt('#sc-you-phone');
  const b = d.pt('#sc-shop-phone');
  return curve(a, b, -Math.min(150, Math.hypot(b.x - a.x, b.y - a.y) * 0.42));
}

/** The road, drawn under both buildings, and the stretch the van drives: from the shop's door to yours. */
export function roadLine(d: D): { road: Point[]; van: Point[] } {
  const home = d.box('home');
  const shop = d.box('shop');
  const from = { x: shop.x + shop.w * 0.3, y: shop.y + shop.h - 12 };
  const to = { x: home.x + home.w * 0.7, y: home.y + home.h - 12 };
  const at = (x: number) => lerp(from, to, (x - from.x) / (to.x - from.x || 1));
  return { road: [from, to], van: [at(shop.x), at(home.x + home.w)] };
}

export const town: World<unknown> = {
  id: 'town',
  views: {
    town: ['home', 'book', 'road', 'shop'],
    counter: ['customers', 'shop'],
    call: ['home', 'road', 'shop'],
  },
  zoom: { town: 1.5, counter: 1.5, call: 1.5 },

  reset(root) {
    root.querySelector('#sc-book')?.classList.remove('is-open');
    for (const id of ['#sc-box-home', '#sc-shelf', '#sc-box-shop']) {
      const parcel = root.querySelector<HTMLElement>(id);
      if (parcel) parcel.hidden = true;
    }
    root.querySelectorAll('.person').forEach((person) => person.classList.remove('is-talking'));
  },

  wires(d) {
    if (!d.shown('home') || !d.shown('shop')) return;
    const shape = roadLine(d)
      .road.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    d.stage.links.append(
      d.svg('path', { d: shape, class: 'sc-road' }),
      d.svg('path', { d: shape, class: 'sc-road__line' }),
    );
  },
};
