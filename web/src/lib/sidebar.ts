import type { Phase } from '../data/phases';
import { phaseFolderName } from './explorer';
import { locales, type Locale } from './locales';

export interface PhaseSidebarGroup {
  label: string;
  translations: { en: string };
  items: { autogenerate: { directory: string } }[];
}

const PHASE_WORD: Record<Locale, string> = { es: 'Fase', en: 'Phase' };

/** «Fase 0 · Cómo funciona internet»: a phase's name in the menu and in the breadcrumbs. */
export function phaseLabel(phase: Pick<Phase, 'number' | 'title'>, locale: Locale): string {
  return `${PHASE_WORD[locale]} ${phase.number} · ${phase.title[locale]}`;
}

/**
 * One side-menu group per published phase. Each language has its own folder (fase-0 and
 * phase-0), and Starlight uses the same configuration for all of them: the group autogenerates from both, and
 * the middleware (src/routeData.ts) removes what are fallback copies in each language.
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
