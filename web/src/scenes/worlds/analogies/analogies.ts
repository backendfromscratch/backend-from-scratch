/**
 * The analogies world: each Phase 11 lesson's analogy, one scene each. Lesson 1: the shop's counter
 * and the phone translation service it pays with its card. Lesson 2: a talk with simultaneous and
 * consecutive interpreting, and a listener who leaves. Lesson 3: a call center, where the warehouse
 * checks who is on the line. Nothing persists from one scene to the
 * next (like the town of «De la URL a la página»): `reset` puts every tally and sign back. Its markup
 * is Analogies.astro; its labels, strings.ts.
 */
import type { Director } from '../../core/director';
import { curve } from '../../core/geometry';
import type { Point, World } from '../../core/types';

type D = Director<unknown>;

/** The phone line: an arc from Ana's phone to the translation service. */
export function phoneRoute(d: Pick<D, 'pt'>, back = false): Point[] {
  const a = d.pt('#an-ana-phone');
  const b = d.pt('interp', 'l');
  const arc = curve(a, b, -Math.min(70, Math.hypot(b.x - a.x, b.y - a.y) * 0.35));
  return back ? arc.reverse() : arc;
}

/** The internal phone: an arc from the operator's phone to the warehouse. */
export function internalRoute(d: Pick<D, 'pt'>, back = false): Point[] {
  const a = d.pt('#an-operator-phone');
  const b = d.pt('warehouse', 'l');
  const arc = curve(a, b, -Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.35));
  return back ? arc.reverse() : arc;
}

export const analogies: World<unknown> = {
  id: 'analogies',
  views: {
    phoneline: ['frontdesk', 'interp'],
    interpreting: ['speaker', 'booth', 'audience'],
    switchboard: ['caller', 'operator', 'warehouse'],
  },
  zoom: { phoneline: 1.6, interpreting: 1.6, switchboard: 1.6 },

  reset(root) {
    root.querySelectorAll('.an-cell, .an-room').forEach((part) => part.classList.remove('is-on'));
    root.querySelector('#an-audience')?.classList.remove('is-gone');
    const mode = root.querySelector('#an-mode');
    if (mode) mode.textContent = '';
    root.querySelectorAll('.an-mark').forEach((mark) => {
      mark.textContent = '';
      delete (mark as HTMLElement).dataset.mark;
    });
    root.querySelectorAll('.person').forEach((person) => person.classList.remove('is-talking'));
  },
};
