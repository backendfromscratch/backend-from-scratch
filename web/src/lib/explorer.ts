import type { Phase } from '../data/phases';
import { isLocale, type Locale } from './locales';

/** Structural subset of the Starlight sidebar entries that the explorer uses. */
export interface ExplorerLink {
  type: 'link';
  label: string;
  href: string;
  isCurrent: boolean;
}
export interface ExplorerGroup {
  type: 'group';
  label: string;
  entries: readonly ExplorerEntry[];
}
export type ExplorerEntry = ExplorerLink | ExplorerGroup;

export interface LessonPosition {
  phaseSlug: string;
  /** Position within the phase: 0 is the introduction. */
  index: number;
  links: ExplorerLink[];
}

/** «¿Qué es un protocolo?» → «que-es-un-protocolo». */
export function toKebab(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** «Qué es un protocolo», 2 → «02-que-es-un-protocolo.md». Without a position: «glosario.md». */
export function toFileName(label: string, position?: number): string {
  const name = toKebab(label);
  if (!name) throw new Error(`[explorer] «${label}» cannot be turned into a file name`);
  const prefix = position === undefined ? '' : `${String(position).padStart(2, '0')}-`;
  return `${prefix}${name}.md`;
}

const FOLDER_WORD: Record<Locale, string> = { es: 'fase', en: 'phase' };

export function phaseFolderName(locale: Locale, phaseNumber: number): string {
  return `${FOLDER_WORD[locale]}-${phaseNumber}`;
}

function flattenLinks(entries: readonly ExplorerEntry[]): ExplorerLink[] {
  return entries.flatMap((entry) =>
    entry.type === 'link' ? [entry] : flattenLinks(entry.entries),
  );
}

/** The links of a phase's group, in order. Recognised by «/<slug>/» in their URLs. */
export function findPhaseLinks(
  sidebar: readonly ExplorerEntry[],
  phaseSlug: string,
): ExplorerLink[] {
  const marker = `/${phaseSlug}/`;
  for (const entry of sidebar) {
    if (entry.type !== 'group') continue;
    const links = flattenLinks(entry.entries);
    if (links.some((l) => l.href.includes(marker))) return links;
  }
  return [];
}

export function locateCurrent(
  sidebar: readonly ExplorerEntry[],
  phaseSlugs: readonly string[],
): LessonPosition | undefined {
  for (const phaseSlug of phaseSlugs) {
    const links = findPhaseLinks(sidebar, phaseSlug);
    const index = links.findIndex((l) => l.isCurrent);
    if (index !== -1) return { phaseSlug, index, links };
  }
  return undefined;
}

/** The label the sidebar gives an href (in the page's language), if it is in the sidebar. */
export function linkLabel(sidebar: readonly ExplorerEntry[], href: string): string | undefined {
  return flattenLinks(sidebar).find((l) => l.href === href)?.label;
}

/**
 * File name of any link: with a position if it is inside a phase. Uses the sidebar's
 * label for that href (the same one the explorer and the pagination show); `link.label`
 * is only used if the href is not in the sidebar.
 */
export function fileNameFor(
  sidebar: readonly ExplorerEntry[],
  phaseSlugs: readonly string[],
  link: { href: string; label: string },
): string {
  const label = linkLabel(sidebar, link.href) ?? link.label;
  for (const phaseSlug of phaseSlugs) {
    const index = findPhaseLinks(sidebar, phaseSlug).findIndex((l) => l.href === link.href);
    if (index !== -1) return toFileName(label, index);
  }
  return toFileName(label);
}

export interface CurrentLesson {
  phase: Phase;
  position: LessonPosition;
}

/** The phase and position of the current page, if it is inside a phase. */
export function currentLesson(
  sidebar: readonly ExplorerEntry[],
  phases: readonly Phase[],
  locale: Locale,
): CurrentLesson | undefined {
  const folderOf = (phase: Phase) => phaseFolderName(locale, phase.number);
  const position = locateCurrent(sidebar, phases.map(folderOf));
  const phase = position && phases.find((p) => folderOf(p) === position.phaseSlug);
  return phase && position ? { phase, position } : undefined;
}

export type StatusStep =
  | { key: 'status.intro' }
  | { key: 'status.lesson'; n: number; total: number }
  | { key: 'status.lessonNoTotal'; n: number };

/** What the status bar says about the current page: «introducción», «lección 2/8» or «lección 2». */
export function statusStep(current: CurrentLesson): StatusStep {
  const { index } = current.position;
  const total = current.phase.lessonCount;
  if (index === 0) return { key: 'status.intro' };
  return total
    ? { key: 'status.lesson', n: index, total }
    : { key: 'status.lessonNoTotal', n: index };
}

/** The home pages: '' or 'index' (Spanish, at the root) and 'en'. */
const isHomeId = (routeId: string) => routeId === '' || routeId === 'index' || isLocale(routeId);

/** The home page as a file. Not README.md: README means nothing to someone who does not program. */
const HOME_FILE: Record<Locale, string> = { es: 'inicio.md', en: 'home.md' };

export function homeFileName(locale: Locale): string {
  return HOME_FILE[locale];
}

/**
 * Accessible name of a link that shows a file name: the real name first, so a screen reader does not
 * start by spelling out «05-ip-puertos-y-sockets.md», and then the file name as it is shown, so
 * someone using voice control can say what they see (WCAG 2.5.3, "Label in Name"). With a comma, not
 * in parentheses: checkers such as axe (Lighthouse) drop what is in parentheses before comparing.
 */
export function fileLinkName(name: string, file: string): string {
  return `${name}, ${file}`;
}

/** File name of the current page: inicio.md / home.md for the home pages. */
export function pageFileName(routeId: string, title: string, position?: LessonPosition): string {
  if (position) return toFileName(position.links[position.index]!.label, position.index);
  if (isHomeId(routeId)) return homeFileName(isLocale(routeId) ? routeId : 'es');
  return toFileName(title);
}

/**
 * How far to scroll the explorer tree so the open file is visible, as an
 * editor does: nothing if it is already fully visible; otherwise, center it.
 */
export function revealScrollTop(
  view: { scrollTop: number; height: number },
  item: { top: number; height: number },
): number {
  const visible =
    item.top >= view.scrollTop && item.top + item.height <= view.scrollTop + view.height;
  if (visible) return view.scrollTop;
  return Math.max(0, item.top - (view.height - item.height) / 2);
}

/** The phase folder of a link («/fase-0/que-es-dns/» → «fase-0»), or none. */
export function phaseSlugOf(href: string, phaseSlugs: readonly string[]): string | undefined {
  return phaseSlugs.find((slug) => href.includes(`/${slug}/`));
}

/**
 * The file name of a link seen from the page `currentHref`: the name alone if it is in
 * the same phase and, if not, with its folder in front («fase-1/00-introduccion.md»), as in an editor
 * when two files have similar names. Used by the pagination and a lesson's prerequisites.
 */
export function qualifiedFileName(
  sidebar: readonly ExplorerEntry[],
  phaseSlugs: readonly string[],
  link: { href: string; label: string },
  currentHref: string,
): string {
  const fileName = fileNameFor(sidebar, phaseSlugs, link);
  const linkPhase = phaseSlugOf(link.href, phaseSlugs);
  return linkPhase && linkPhase !== phaseSlugOf(currentHref, phaseSlugs)
    ? `${linkPhase}/${fileName}`
    : fileName;
}

/**
 * Which phase folder the explorer opens on arrival: inside a phase, only its own; outside (home,
 * glossary…), the first published one. Those the reader has opened or collapsed are remembered separately.
 */
export function folderOpenByDefault(
  phaseSlug: string,
  currentSlug: string | undefined,
  firstPublishedSlug: string | undefined,
): boolean {
  return currentSlug ? phaseSlug === currentSlug : phaseSlug === firstPublishedSlug;
}

/**
 * What is in the Starlight menu that the explorer would not draw: loose links and groups with
 * pages outside the phases. The explorer only knows about the home page and the phases; if anything else
 * shows up (someone adds it to the configuration), the build must fail instead of hiding it.
 */
export function unexpectedSidebarEntries(
  sidebar: readonly ExplorerEntry[],
  phaseSlugs: readonly string[],
): string[] {
  return sidebar
    .filter((entry) =>
      entry.type === 'link'
        ? true
        : !flattenLinks(entry.entries).every((link) => phaseSlugOf(link.href, phaseSlugs)),
    )
    .map((entry) => entry.label);
}
