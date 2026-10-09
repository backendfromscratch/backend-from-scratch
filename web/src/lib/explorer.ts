import type { Phase } from '../data/phases';
import { isLocale, type Locale } from './locales';

/** Subconjunto estructural de las entradas del sidebar de Starlight que usa el explorador. */
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
  /** Posición dentro de la fase: 0 es la introducción. */
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

/** «Qué es un protocolo», 2 → «02-que-es-un-protocolo.md». Sin posición: «glosario.md». */
export function toFileName(label: string, position?: number): string {
  const name = toKebab(label);
  if (!name) throw new Error(`[explorer] «${label}» no da para un nombre de fichero`);
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

/** Los enlaces del grupo de una fase, en orden. Se reconoce por «/<slug>/» en sus URLs. */
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

/** La etiqueta que el sidebar da a un href (en el idioma de la página), si está en el sidebar. */
export function linkLabel(sidebar: readonly ExplorerEntry[], href: string): string | undefined {
  return flattenLinks(sidebar).find((l) => l.href === href)?.label;
}

/**
 * Nombre de fichero de cualquier enlace: con posición si está dentro de una fase. Usa la etiqueta
 * del sidebar para ese href (la misma que muestran el explorador y la paginación); `link.label`
 * solo se usa si el href no está en el sidebar.
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

/** La fase y la posición de la página actual, si está dentro de una fase. */
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

/** Qué dice la barra de estado sobre la página actual: «introducción», «lección 2/8» o «lección 2». */
export function statusStep(current: CurrentLesson): StatusStep {
  const { index } = current.position;
  const total = current.phase.lessonCount;
  if (index === 0) return { key: 'status.intro' };
  return total
    ? { key: 'status.lesson', n: index, total }
    : { key: 'status.lessonNoTotal', n: index };
}

/** Las portadas: '' o 'index' (español, en la raíz) y 'en'. */
const isHomeId = (routeId: string) => routeId === '' || routeId === 'index' || isLocale(routeId);

/** La portada como fichero. No es README.md: a quien no programa, README no le dice nada. */
const HOME_FILE: Record<Locale, string> = { es: 'inicio.md', en: 'home.md' };

export function homeFileName(locale: Locale): string {
  return HOME_FILE[locale];
}

/** Nombre de fichero de la página actual: inicio.md / home.md para las portadas. */
export function pageFileName(routeId: string, title: string, position?: LessonPosition): string {
  if (position) return toFileName(position.links[position.index]!.label, position.index);
  if (isHomeId(routeId)) return homeFileName(isLocale(routeId) ? routeId : 'es');
  return toFileName(title);
}

/**
 * Cuánto desplazar el árbol del explorador para que se vea el fichero abierto, como hace un
 * editor: nada si ya se ve entero; si no, lo centra.
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

/** La carpeta de fase de un enlace («/fase-0/que-es-dns/» → «fase-0»), o ninguna. */
export function phaseSlugOf(href: string, phaseSlugs: readonly string[]): string | undefined {
  return phaseSlugs.find((slug) => href.includes(`/${slug}/`));
}

/**
 * El nombre de fichero de un enlace visto desde la página `currentHref`: el nombre solo si está en
 * la misma fase y, si no, con su carpeta delante («fase-1/00-introduccion.md»), como en un editor
 * cuando dos ficheros se llaman parecido. Lo usan la paginación y los requisitos de una lección.
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
 * Qué carpeta de fase abre el explorador al llegar: dentro de una fase, solo la suya; fuera (portada,
 * glosario…), la primera publicada. Las que el lector haya abierto o plegado se recuerdan aparte.
 */
export function folderOpenByDefault(
  phaseSlug: string,
  currentSlug: string | undefined,
  firstPublishedSlug: string | undefined,
): boolean {
  return currentSlug ? phaseSlug === currentSlug : phaseSlug === firstPublishedSlug;
}

/**
 * Lo que hay en el menú de Starlight y el explorador no pintaría: enlaces sueltos y grupos con
 * páginas fuera de las fases. El explorador solo sabe de la portada y de las fases; si aparece otra
 * cosa (alguien la añade a la configuración), el build tiene que fallar en vez de esconderla.
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
