import { describe, expect, it } from 'vitest';
import { satteriDiagrams } from './diagrams-plugin';

const plugin = satteriDiagrams();
const context = { fileURL: new URL('file:///proyecto/src/content/docs/fase-0/x.mdx') };
const SEQUENCE = 'sequenceDiagram\nparticipant A as Uno\nparticipant B as Dos\nA->>B: hola';

describe('satteriDiagrams', () => {
  it('pide las posiciones de los nodos, para decir en qué línea falla un diagrama', () => {
    expect(plugin.options).toEqual({ position: true });
  });

  it('cambia un bloque mermaid de secuencia por la figura en HTML', () => {
    const result = plugin.code({ lang: 'mermaid', value: SEQUENCE }, context);
    expect(result?.type).toBe('html');
    expect(result?.value).toMatch(/^<figure class="seq seq--n2 not-content">/);
    expect(result?.value).toContain('Uno → Dos');
  });

  it('también las cadenas (flowchart TB)', () => {
    const result = plugin.code(
      { lang: 'mermaid', value: 'flowchart TB\nA["a"] -->|x| B["b"]' },
      context,
    );
    expect(result?.value).toMatch(/^<figure class="chain not-content">/);
  });

  it('el HTML va en una sola línea: una línea en blanco cortaría el bloque HTML', () => {
    expect(plugin.code({ lang: 'mermaid', value: SEQUENCE }, context)?.value).not.toContain('\n');
  });

  it('no toca los demás bloques de código', () => {
    expect(plugin.code({ lang: 'sh', value: 'curl example.com' }, context)).toBeUndefined();
  });

  it('el error apunta a la línea mala del fichero, no a la apertura del bloque', () => {
    // El bloque abre en la línea 12; «loop x» es su cuarta línea: la 16 del fichero.
    const node = {
      lang: 'mermaid',
      value: 'sequenceDiagram\nparticipant A as A\nparticipant B as B\nloop x',
      position: { start: { line: 12 } },
    };
    expect(() => plugin.code(node, context)).toThrow(/x\.mdx:16: Línea no admitida/);
  });

  it('un diagrama no admitido hace fallar el build, con el fichero y la línea', () => {
    const node = { lang: 'mermaid', value: 'graph LR\nA --> B', position: { start: { line: 12 } } };
    expect(() => plugin.code(node, context)).toThrow(
      /\/proyecto\/src\/content\/docs\/fase-0\/x\.mdx:12: Tipo de diagrama no admitido: «graph LR»/,
    );
  });
});
