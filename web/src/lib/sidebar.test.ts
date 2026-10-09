import { describe, expect, it } from 'vitest';
import type { Phase } from '../data/phases';
import { buildPhaseSidebar, phaseLabel } from './sidebar';

const phase = (number: number, status: Phase['status']): Phase => ({
  number,
  status,
  title: { es: `Título ${number}`, en: `Title ${number}` },
  summary: { es: '', en: '' },
});

describe('buildPhaseSidebar', () => {
  it('only includes the available phases, in order, with the folder of each language', () => {
    const groups = buildPhaseSidebar([
      phase(0, 'available'),
      phase(1, 'coming-soon'),
      phase(2, 'available'),
    ]);
    expect(groups.map((group) => group.items.map((item) => item.autogenerate.directory))).toEqual([
      ['fase-0', 'phase-0'],
      ['fase-2', 'phase-2'],
    ]);
  });

  it('labels each group in both languages', () => {
    const [group] = buildPhaseSidebar([phase(0, 'available')]);
    expect(group.label).toBe('Fase 0 · Título 0');
    expect(group.translations).toEqual({ en: 'Phase 0 · Title 0' });
  });

  it('returns an empty list if no phases are available', () => {
    expect(buildPhaseSidebar([phase(0, 'coming-soon')])).toEqual([]);
  });
});

describe('phaseLabel', () => {
  it('«Fase N · título» in each language', () => {
    expect(phaseLabel(phase(0, 'available'), 'es')).toBe('Fase 0 · Título 0');
    expect(phaseLabel(phase(0, 'available'), 'en')).toBe('Phase 0 · Title 0');
  });
});
