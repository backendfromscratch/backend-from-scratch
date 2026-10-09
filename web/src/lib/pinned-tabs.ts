/**
 * The tab strip (src/components/EditorTabs.astro). First, always visible, the tab of
 * the open page; then the pinned tabs, like an editor's: always the same ones
 * (playgrounds and glossary). On a pinned page, that one is the open one and is not repeated; the first
 * tab cannot be closed: it links to the last page the reader was on.
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

/** A tab in the strip: the open page's, the last open page's or a pinned one. */
export type StripTab = { kind: 'page' } | { kind: 'last' } | ({ kind: 'pinned' } & PinnedTab);

export function tabStrip(locale: Locale, pathname: string): StripTab[] {
  const pinned = pinnedTabs(locale, pathname).map((tab) => ({ kind: 'pinned' as const, ...tab }));
  const onPinnedPage = pinned.some((tab) => tab.current);
  return [onPinnedPage ? { kind: 'last' } : { kind: 'page' }, ...pinned];
}
