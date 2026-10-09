import { describe, expect, it } from 'vitest';
import {
  glossaryEntryId,
  sortGlossary,
  termIdFromEntryId,
  termPopoverId,
  termsSeenIn,
  explainingLessons,
} from './glossary';

describe('glossaryEntryId / termIdFromEntryId', () => {
  it('construye el id de la colección a partir del idioma y el término', () => {
    expect(glossaryEntryId('es', 'port')).toBe('es/port');
  });

  it('extrae el id del término de un id de la colección', () => {
    expect(termIdFromEntryId('en/port')).toBe('port');
  });

  it('lanza un error si el id no lleva idioma', () => {
    expect(() => termIdFromEntryId('port')).toThrow(/sin idioma/);
  });
});

describe('sortGlossary', () => {
  const entry = (term: string) => ({ data: { term } });

  it('ordena según las reglas del idioma: en español, «árbol» va antes que «Base»', () => {
    const sorted = sortGlossary([entry('Servidor'), entry('árbol'), entry('Base')], 'es');
    expect(sorted.map((e) => e.data.term)).toEqual(['árbol', 'Base', 'Servidor']);
  });

  it('no modifica la lista original', () => {
    const original = [entry('b'), entry('a')];
    sortGlossary(original, 'en');
    expect(original.map((e) => e.data.term)).toEqual(['b', 'a']);
  });
});

describe('termPopoverId', () => {
  it('el mismo HTML en cada build: el id sale del término y de cuántas veces ha salido en la página', () => {
    const seen = new Map<string, number>();
    expect(termPopoverId(seen, 'port')).toBe('term-port');
    expect(termPopoverId(seen, 'tcp')).toBe('term-tcp');
    expect(termPopoverId(seen, 'port')).toBe('term-port-2');
    expect(termPopoverId(seen, 'port')).toBe('term-port-3');
  });

  it('cada página empieza de cero', () => {
    expect(termPopoverId(new Map(), 'port')).toBe('term-port');
  });
});

describe('termsSeenIn', () => {
  it('la misma cuenta para toda la página, aunque cada <Term> se pinte por separado', () => {
    const page = {};
    termPopoverId(termsSeenIn(page), 'port');
    expect(termPopoverId(termsSeenIn(page), 'port')).toBe('term-port-2');
  });

  it('otra página, otra cuenta', () => {
    termPopoverId(termsSeenIn({}), 'port');
    expect(termPopoverId(termsSeenIn({}), 'port')).toBe('term-port');
  });
});

describe('explainingLessons', () => {
  // En el orden del curso: la introducción de la fase va primero.
  const lessons = [
    {
      id: 'fase-0',
      translationKey: 'phase-0',
      body: 'Abre una <Term id="terminal">terminal</Term>.',
    },
    {
      id: 'fase-0/modelo-cliente-servidor',
      translationKey: 'client-server',
      body: 'Un <Term id="server">servidor</Term> escucha en un <Term id="port">puerto</Term>.',
    },
    {
      id: 'fase-0/ip-puertos-y-sockets',
      translationKey: 'ip-ports-sockets',
      body: 'Cada <Term id=\'port\'>puerto</Term> y otro <Term id="port">.',
    },
  ];
  const knownKeys = new Set(['phase-0', 'client-server', 'ip-ports-sockets', 'dns']);
  const explained = (terms: { id: string; lesson?: string }[]) =>
    explainingLessons(terms, lessons, knownKeys);

  it('sin lección indicada, la primera del curso que usa el término, introducciones incluidas', () => {
    const result = explained([{ id: 'server' }, { id: 'terminal' }]);
    expect(result.get('server')).toBe('fase-0/modelo-cliente-servidor');
    expect(result.get('terminal')).toBe('fase-0');
  });

  it('la lección indicada en el glosario manda sobre el primer uso', () => {
    // «puerto» sale antes en cliente-servidor, pero se explica en la lección de IP y puertos.
    expect(explained([{ id: 'port', lesson: 'ip-ports-sockets' }]).get('port')).toBe(
      'fase-0/ip-puertos-y-sockets',
    );
  });

  it('no confunde un término con otro que empieza igual, y si nadie lo usa, ninguna', () => {
    const result = explained([{ id: 'por' }, { id: 'dns' }]);
    expect(result.has('por')).toBe(false);
    expect(result.has('dns')).toBe(false);
  });

  it('una lección indicada que aún no está en este idioma: vuelve al primer uso', () => {
    expect(explained([{ id: 'server', lesson: 'dns' }]).get('server')).toBe(
      'fase-0/modelo-cliente-servidor',
    );
  });

  it('una lección indicada que no existe en ningún idioma es un error (falla el build)', () => {
    expect(() => explained([{ id: 'port', lesson: 'ip-port-sockets' }])).toThrow(
      /"port".*"ip-port-sockets"/,
    );
  });
});
