import { describe, expect, it } from 'vitest';
import { countLessons, isLessonId, isPhasePublished, phaseNumberOf } from './lessons';

describe('isLessonId', () => {
  it('recognises a lesson: a page inside a phase folder', () => {
    expect(isLessonId('fase-0/que-es-dns')).toBe(true);
    expect(isLessonId('en/phase-11/mcp')).toBe(true);
  });

  it('a page in a subfolder of a phase is not a lesson (lessons go directly in the phase)', () => {
    expect(isLessonId('fase-0/extra/que-es-dns')).toBe(false);
    expect(isLessonId('en/phase-0/extra/what-is-dns')).toBe(false);
    expect(isLessonId('fase-0/que-es-dns/')).toBe(false);
  });

  it('a phase introduction is not a lesson', () => {
    expect(isLessonId('fase-0')).toBe(false);
    expect(isLessonId('en/phase-0')).toBe(false);
  });

  it('general pages are not lessons', () => {
    expect(isLessonId('roadmap')).toBe(false);
    expect(isLessonId('en/glossary')).toBe(false);
    expect(isLessonId('')).toBe(false);
    expect(isLessonId('en')).toBe(false);
  });

  it('each language uses its own word: no phase-N in Spanish and no fase-N in English', () => {
    expect(isLessonId('phase-0/dns')).toBe(false);
    expect(isLessonId('en/fase-0/que-es-dns')).toBe(false);
  });
});

describe('countLessons', () => {
  const ids = [
    'fase-0',
    'fase-0/modelo-cliente-servidor',
    'fase-0/que-es-un-protocolo',
    'en/phase-0',
    'en/phase-0/client-server-model',
    'fase-10/x',
    'roadmap',
  ];

  it('counts the lessons of a phase in a language, without the introduction', () => {
    expect(countLessons(ids, 'es', 0)).toBe(2);
    expect(countLessons(ids, 'en', 0)).toBe(1);
  });

  it('does not confuse phase 1 with phase 10', () => {
    expect(countLessons(ids, 'es', 1)).toBe(0);
  });
});

describe('isPhasePublished', () => {
  const ids = ['fase-0', 'fase-0/que-es-dns', 'en/phase-0', 'fase-1', 'fase-1/shell'];
  const phase = (number: number, status: 'available' | 'coming-soon' = 'available') => ({
    number,
    status,
  });

  it('a phase is published in a language if its introduction exists in that language', () => {
    expect(isPhasePublished(ids, 'es', phase(0))).toBe(true);
    expect(isPhasePublished(ids, 'en', phase(0))).toBe(true);
  });

  it('a Spanish-only phase is not published in English: its link would 404', () => {
    expect(isPhasePublished(ids, 'es', phase(1))).toBe(true);
    expect(isPhasePublished(ids, 'en', phase(1))).toBe(false);
  });

  it('a «coming soon» phase is not published even if it has pages', () => {
    expect(isPhasePublished(ids, 'es', phase(1, 'coming-soon'))).toBe(false);
  });
});

describe('phaseNumberOf', () => {
  it('the phase number of a lesson or a phase introduction', () => {
    expect(phaseNumberOf('fase-0/que-es-dns')).toBe(0);
    expect(phaseNumberOf('en/phase-1/shell')).toBe(1);
    expect(phaseNumberOf('fase-11')).toBe(11);
    expect(phaseNumberOf('en/phase-0')).toBe(0);
  });

  it('none outside the phases', () => {
    expect(phaseNumberOf('glosario')).toBeUndefined();
    expect(phaseNumberOf('en/glossary')).toBeUndefined();
    expect(phaseNumberOf('fase-0/sub/pagina')).toBeUndefined();
  });
});
