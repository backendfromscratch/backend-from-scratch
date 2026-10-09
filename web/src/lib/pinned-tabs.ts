/**
 * La franja de pestañas (src/components/EditorTabs.astro). Primero, siempre visible, la pestaña de
 * la página abierta; después, las pestañas fijadas, como las de un editor: siempre las mismas
 * (playgrounds y glosario). En la página de una fijada, esa es la abierta y no se repite; la primera
 * pestaña no se cierra: enlaza a la última página en la que estaba el lector.
 */
import { localizedHref } from './links';
import type { Locale } from './locales';

export type PinnedTabId = 'playgrounds' | 'glossary';

export interface PinnedTab {
  id: PinnedTabId;
  href: string;
  current: boolean;
}

const PINNED: readonly PinnedTabId[] = ['playgrounds', 'glossary'];

export function pinnedTabs(locale: Locale, pathname: string): PinnedTab[] {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return PINNED.map((id) => {
    const href = localizedHref(locale, id);
    return { id, href, current: path === href };
  });
}

/** Una pestaña de la franja: la de la página abierta, la de la última página abierta o una fijada. */
export type StripTab = { kind: 'page' } | { kind: 'last' } | ({ kind: 'pinned' } & PinnedTab);

export function tabStrip(locale: Locale, pathname: string): StripTab[] {
  const pinned = pinnedTabs(locale, pathname).map((tab) => ({ kind: 'pinned' as const, ...tab }));
  const onPinnedPage = pinned.some((tab) => tab.current);
  return [onPinnedPage ? { kind: 'last' } : { kind: 'page' }, ...pinned];
}
