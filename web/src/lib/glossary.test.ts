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
  it('builds the collection id from the language and the term', () => {
    expect(glossaryEntryId('es', 'port')).toBe('es/port');
  });

  it('extracts the term id from a collection id', () => {
    expect(termIdFromEntryId('en/port')).toBe('port');
  });

  it('throws if the id has no language', () => {
    expect(() => termIdFromEntryId('port')).toThrow(/without a language/);
  });
});

describe('sortGlossary', () => {
  const entry = (term: string) => ({ data: { term } });

  it('sorts by the rules of the language: in Spanish, «árbol» comes before «Base»', () => {
    const sorted = sortGlossary([entry('Servidor'), entry('árbol'), entry('Base')], 'es');
    expect(sorted.map((e) => e.data.term)).toEqual(['árbol', 'Base', 'Servidor']);
  });

  it('does not modify the original list', () => {
    const original = [entry('b'), entry('a')];
    sortGlossary(original, 'en');
    expect(original.map((e) => e.data.term)).toEqual(['b', 'a']);
  });
});

describe('termPopoverId', () => {
  it('the same HTML on every build: the id comes from the term and how many times it has appeared on the page', () => {
    const seen = new Map<string, number>();
    expect(termPopoverId(seen, 'port')).toBe('term-port');
    expect(termPopoverId(seen, 'tcp')).toBe('term-tcp');
    expect(termPopoverId(seen, 'port')).toBe('term-port-2');
    expect(termPopoverId(seen, 'port')).toBe('term-port-3');
  });

  it('each page starts from zero', () => {
    expect(termPopoverId(new Map(), 'port')).toBe('term-port');
  });
});

describe('termsSeenIn', () => {
  it('the same count for the whole page, even if each <Term> is rendered separately', () => {
    const page = {};
    termPopoverId(termsSeenIn(page), 'port');
    expect(termPopoverId(termsSeenIn(page), 'port')).toBe('term-port-2');
  });

  it('another page, another count', () => {
    termPopoverId(termsSeenIn({}), 'port');
    expect(termPopoverId(termsSeenIn({}), 'port')).toBe('term-port');
  });
});

describe('explainingLessons', () => {
  // In course order: the phase introduction comes first.
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

  it('with no lesson given, the first lesson in the course that uses the term, introductions included', () => {
    const result = explained([{ id: 'server' }, { id: 'terminal' }]);
    expect(result.get('server')).toBe('fase-0/modelo-cliente-servidor');
    expect(result.get('terminal')).toBe('fase-0');
  });

  it('the lesson given in the glossary takes precedence over the first use', () => {
    // «puerto» appears earlier in client-server, but it is explained in the IP and ports lesson.
    expect(explained([{ id: 'port', lesson: 'ip-ports-sockets' }]).get('port')).toBe(
      'fase-0/ip-puertos-y-sockets',
    );
  });

  it('does not confuse a term with another that starts the same, and if nobody uses it, none', () => {
    const result = explained([{ id: 'por' }, { id: 'dns' }]);
    expect(result.has('por')).toBe(false);
    expect(result.has('dns')).toBe(false);
  });

  it('a given lesson that is not yet in this language: falls back to the first use', () => {
    expect(explained([{ id: 'server', lesson: 'dns' }]).get('server')).toBe(
      'fase-0/modelo-cliente-servidor',
    );
  });

  it('a given lesson that does not exist in any language is an error (the build fails)', () => {
    expect(() => explained([{ id: 'port', lesson: 'ip-port-sockets' }])).toThrow(
      /"port".*"ip-port-sockets"/,
    );
  });
});
