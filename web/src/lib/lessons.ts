import type { Phase } from '../data/phases';
import { phaseFolderName } from './explorer';
import { defaultLocale, type Locale } from './locales';

/**
 * Una lección es cualquier página dentro de la carpeta de una fase que no sea su introducción:
 * "fase-0/que-es-dns" y "en/phase-0/what-is-dns" sí; "fase-0", "roadmap" y "en/glossary" no.
 */
export function isLessonId(entryId: string): boolean {
  return /^(?:fase-\d+|en\/phase-\d+)\/[^/]+$/.test(entryId);
}

/**
 * El número de fase de una lección o de la introducción de una fase: "fase-0/que-es-dns" → 0,
 * "en/phase-1" → 1. Fuera de las fases ("glosario", "en/glossary"), ninguno.
 */
export function phaseNumberOf(entryId: string): number | undefined {
  const match = /^(?:fase|en\/phase)-(\d+)(?:\/[^/]+)?$/.exec(entryId);
  return match ? Number(match[1]) : undefined;
}

/** Lecciones publicadas de una fase en un idioma (sin contar la introducción). */
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
 * Una fase está publicada en un idioma si está disponible y su introducción existe en ese idioma.
 * Una fase solo en español no está publicada en inglés: su enlace en /en/ daría 404.
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
