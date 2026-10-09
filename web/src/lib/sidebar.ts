import type { Phase } from '../data/phases';
import { phaseFolderName } from './explorer';
import { locales, type Locale } from './locales';

export interface PhaseSidebarGroup {
  label: string;
  translations: { en: string };
  items: { autogenerate: { directory: string } }[];
}

const PHASE_WORD: Record<Locale, string> = { es: 'Fase', en: 'Phase' };

/** «Fase 0 · Cómo funciona internet»: el nombre de una fase en el menú y en las migas. */
export function phaseLabel(phase: Pick<Phase, 'number' | 'title'>, locale: Locale): string {
  return `${PHASE_WORD[locale]} ${phase.number} · ${phase.title[locale]}`;
}

/**
 * Un grupo del menú lateral por cada fase publicada. Cada idioma tiene su carpeta (fase-0 y
 * phase-0), y Starlight usa la misma configuración para todos: el grupo autogenera desde las dos, y
 * el middleware (src/routeData.ts) quita lo que en cada idioma son copias de respaldo.
 */
export function buildPhaseSidebar(phases: readonly Phase[]): PhaseSidebarGroup[] {
  return phases
    .filter((phase) => phase.status === 'available')
    .map((phase) => ({
      label: phaseLabel(phase, 'es'),
      translations: { en: phaseLabel(phase, 'en') },
      items: locales.map((locale) => ({
        autogenerate: { directory: phaseFolderName(locale, phase.number) },
      })),
    }));
}
