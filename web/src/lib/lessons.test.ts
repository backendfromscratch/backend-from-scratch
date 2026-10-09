import { describe, expect, it } from 'vitest';
import { countLessons, isLessonId, isPhasePublished, phaseNumberOf } from './lessons';

describe('isLessonId', () => {
  it('reconoce una lección: una página dentro de la carpeta de una fase', () => {
    expect(isLessonId('fase-0/que-es-dns')).toBe(true);
    expect(isLessonId('en/phase-11/mcp')).toBe(true);
  });

  it('una página en una subcarpeta de una fase no es una lección (las lecciones van directamente en la fase)', () => {
    expect(isLessonId('fase-0/extra/que-es-dns')).toBe(false);
    expect(isLessonId('en/phase-0/extra/what-is-dns')).toBe(false);
    expect(isLessonId('fase-0/que-es-dns/')).toBe(false);
  });

  it('la introducción de una fase no es una lección', () => {
    expect(isLessonId('fase-0')).toBe(false);
    expect(isLessonId('en/phase-0')).toBe(false);
  });

  it('las páginas generales no son lecciones', () => {
    expect(isLessonId('roadmap')).toBe(false);
    expect(isLessonId('en/glossary')).toBe(false);
    expect(isLessonId('')).toBe(false);
    expect(isLessonId('en')).toBe(false);
  });

  it('cada idioma usa su palabra: en español no hay phase-N ni en inglés fase-N', () => {
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

  it('cuenta las lecciones de una fase en un idioma, sin la introducción', () => {
    expect(countLessons(ids, 'es', 0)).toBe(2);
    expect(countLessons(ids, 'en', 0)).toBe(1);
  });

  it('no confunde la fase 1 con la 10', () => {
    expect(countLessons(ids, 'es', 1)).toBe(0);
  });
});

describe('isPhasePublished', () => {
  const ids = ['fase-0', 'fase-0/que-es-dns', 'en/phase-0', 'fase-1', 'fase-1/shell'];
  const phase = (number: number, status: 'available' | 'coming-soon' = 'available') => ({
    number,
    status,
  });

  it('una fase está publicada en un idioma si su introducción existe en ese idioma', () => {
    expect(isPhasePublished(ids, 'es', phase(0))).toBe(true);
    expect(isPhasePublished(ids, 'en', phase(0))).toBe(true);
  });

  it('una fase solo en español no está publicada en inglés: su enlace daría 404', () => {
    expect(isPhasePublished(ids, 'es', phase(1))).toBe(true);
    expect(isPhasePublished(ids, 'en', phase(1))).toBe(false);
  });

  it('una fase «próximamente» no está publicada aunque tenga páginas', () => {
    expect(isPhasePublished(ids, 'es', phase(1, 'coming-soon'))).toBe(false);
  });
});

describe('phaseNumberOf', () => {
  it('el número de fase de una lección o de la introducción de una fase', () => {
    expect(phaseNumberOf('fase-0/que-es-dns')).toBe(0);
    expect(phaseNumberOf('en/phase-1/shell')).toBe(1);
    expect(phaseNumberOf('fase-11')).toBe(11);
    expect(phaseNumberOf('en/phase-0')).toBe(0);
  });

  it('ninguno fuera de las fases', () => {
    expect(phaseNumberOf('glosario')).toBeUndefined();
    expect(phaseNumberOf('en/glossary')).toBeUndefined();
    expect(phaseNumberOf('fase-0/sub/pagina')).toBeUndefined();
  });
});
