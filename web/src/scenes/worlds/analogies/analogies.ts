/**
 * The analogies world: each Phase 11 lesson's analogy, one scene each. Lesson 1: the shop's counter
 * and the phone translation service it pays with its card. Lesson 2: a talk with simultaneous and
 * consecutive interpreting, and a listener who leaves. Lesson 3: a call center, where the warehouse
 * checks who is on the line. Lesson 4: phones and a laptop whose chargers fit only their own, until
 * USB-C. Lesson 5: a supermarket arranged by what things are. Lesson 6: an open-book exam. Lesson 7: a cafeteria card with a daily balance, and the kitchen's broth. Nothing persists from one scene to the
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

/** A charger carried from its place to a device's port: an arc from the plug up to the port. */
export function plugRoute(d: Pick<D, 'pt'>, plug: number, port: number): Point[] {
  const a = d.pt(`#an-plug-${plug}`, 't');
  const b = d.pt(`#an-port-${port}`);
  return curve(a, b, -Math.min(50, Math.hypot(b.x - a.x, b.y - a.y) * 0.4));
}

export const analogies: World<unknown> = {
  id: 'analogies',
  views: {
    phoneline: ['frontdesk', 'interp'],
    interpreting: ['speaker', 'booth', 'audience'],
    switchboard: ['caller', 'operator', 'warehouse'],
    usbc: ['chargers'],
    aisles: ['market'],
    notes: ['exam'],
    lunch: ['canteen', 'kitchen'],
  },
  zoom: {
    phoneline: 1.6,
    interpreting: 1.6,
    switchboard: 1.6,
    usbc: 2,
    aisles: 1.8,
    notes: 1.8,
    lunch: 1.7,
  },

  reset(root) {
    root.querySelectorAll('.an-cell, .an-room').forEach((part) => part.classList.remove('is-on'));
    root
      .querySelectorAll('.an-tab, .an-q')
      .forEach((part) => part.classList.remove('is-lit', 'is-scan'));
    const balance = root.querySelector<HTMLElement>('#an-balance');
    if (balance) balance.style.transform = '';
    const till = root.querySelector('#an-till-status');
    if (till) till.textContent = '';
    root.querySelector('#an-audience')?.classList.remove('is-gone');
    root.querySelector('#an-chargers')?.classList.remove('is-usbc');
    const mode = root.querySelector('#an-mode');
    if (mode) mode.textContent = '';
    root.querySelectorAll('.an-mark').forEach((mark) => {
      mark.textContent = '';
      delete (mark as HTMLElement).dataset.mark;
    });
    root.querySelectorAll('.person').forEach((person) => person.classList.remove('is-talking'));
  },
};
