import type { Phase } from '../data/phases';
import { phaseFolderName } from './explorer';
import { defaultLocale, type Locale } from './locales';

/**
 * A lesson is any page inside a phase folder that is not its introduction:
 * "fase-0/que-es-dns" and "en/phase-0/what-is-dns" yes; "fase-0", "roadmap" and "en/glossary" no.
 */
export function isLessonId(entryId: string): boolean {
  return /^(?:fase-\d+|en\/phase-\d+)\/[^/]+$/.test(entryId);
}

/**
 * The phase number of a lesson or a phase introduction: "fase-0/que-es-dns" → 0,
 * "en/phase-1" → 1. Outside the phases ("glosario", "en/glossary"), none.
 */
export function phaseNumberOf(entryId: string): number | undefined {
  const match = /^(?:fase|en\/phase)-(\d+)(?:\/[^/]+)?$/.exec(entryId);
  return match ? Number(match[1]) : undefined;
}

/** Published lessons of a phase in a language (not counting the introduction). */
export function countLessons(
  entryIds: readonly string[],
  locale: Locale,
  phaseNumber: number,
): number {
  const prefix = locale === defaultLocale ? '' : `${locale}/`;
  const folder = `${prefix}${phaseFolderName(locale, phaseNumber)}/`;
  return entryIds.filter((id) => isLessonId(id) && id.startsWith(folder)).length;
}

/**
 * A phase is published in a language if it is available and its introduction exists in that language.
 * A Spanish-only phase is not published in English: its link under /en/ would 404.
 */
export function isPhasePublished(
  entryIds: readonly string[],
  locale: Locale,
  phase: Pick<Phase, 'number' | 'status'>,
): boolean {
  const prefix = locale === defaultLocale ? '' : `${locale}/`;
  return (
    phase.status === 'available' &&
    entryIds.includes(`${prefix}${phaseFolderName(locale, phase.number)}`)
  );
}
