/**
 * The restaurant world (the analogy of «Qué es el backend»): one actor, a restaurant seen from the
 * side, with you at a table in the dining room, the waiter in the doorway and the cook at the stove,
 * next to the pantry. The supplier is the van prop. It keeps no state. Its markup is Restaurant.astro.
 */
import type { Director } from '../../core/director';
import type { Point, World } from '../../core/types';

/** The van's road: along the floor, from beyond the stage's right edge to its parking spot by the kitchen. */
export function supplierRoute(d: Pick<Director<unknown>, 'box' | 'stage'>): Point[] {
  const park = d.box('parking');
  const y = park.y + park.h - 2;
  return [
    { x: d.stage.size().w + 80, y },
    { x: park.x + park.w / 2, y },
  ];
}

export const restaurant: World<unknown> = {
  id: 'restaurant',
  views: { restaurant: ['restaurant', 'parking'] },
  zoom: { restaurant: 1.5 },
  reset(root) {
    root
      .querySelectorAll('.rs-place .person')
      .forEach((person) => person.classList.remove('is-talking'));
  },
};
