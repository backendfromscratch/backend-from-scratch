import { describe, expect, it } from 'vitest';
import { parseChain, renderChain } from './chain';
import { classList, findByClass, textContent } from './hast';

const TCP_IP = `flowchart TB
    A["Tu portátil<br/>aplicación · transporte · red · enlace"] -->|wifi| B["Router de casa<br/>red · enlace"]
    B -->|fibra| C["Routers de tu operador y de internet<br/>red · enlace"]
    C -->|cable| D["Servidor<br/>aplicación · transporte · red · enlace"]`;

describe('parseChain', () => {
  it('lee una cadena vertical de nodos con sus enlaces', () => {
    expect(parseChain(TCP_IP)).toEqual({
      nodes: [
        ['Tu portátil', 'aplicación · transporte · red · enlace'],
        ['Router de casa', 'red · enlace'],
        ['Routers de tu operador y de internet', 'red · enlace'],
        ['Servidor', 'aplicación · transporte · red · enlace'],
      ],
      edges: ['wifi', 'fibra', 'cable'],
    });
  });

  it.each([
    ['flowchart LR\nA["a"] -->|x| B["b"]', /Solo se admite «flowchart TB»/],
    ['flowchart TB\nA["a"] --> B["b"]', /Línea no admitida/],
    ['flowchart TB\nA["a"] -->|x| B["b"]\nA -->|y| C["c"]', /«A» tiene dos salidas/],
    ['flowchart TB\nA["a"] -->|x| B', /«B» no tiene texto/],
    ['flowchart TB\nA["a"] -->|x| B["b"]\nC["c"] -->|y| D["d"]', /una sola cadena/],
  ])('falla con un mensaje claro ante lo que no admite (%#)', (source, error) => {
    expect(() => parseChain(source)).toThrow(error);
  });
});

describe('renderChain', () => {
  const figure = renderChain(parseChain(TCP_IP));

  it('una lista ordenada: cada paso con su nodo y, menos el último, el enlace al siguiente', () => {
    expect(classList(figure)).toEqual(['chain', 'not-content']);
    expect(findByClass(figure, 'chain__name').map(textContent)).toEqual([
      'Tu portátil',
      'Router de casa',
      'Routers de tu operador y de internet',
      'Servidor',
    ]);
    expect(findByClass(figure, 'chain__edge').map(textContent)).toEqual(['wifi', 'fibra', 'cable']);
    expect(textContent(findByClass(figure, 'chain__detail')[0]!)).toBe(
      'aplicación · transporte · red · enlace',
    );
  });
});

describe('parseChain: la línea del error', () => {
  it('un error de una línea dice cuál', () => {
    try {
      parseChain('flowchart TB\nA["a"] -->|x| B["b"]\nA -->|y| C["c"]');
      throw new Error('no ha lanzado');
    } catch (error) {
      expect((error as { line?: number }).line).toBe(3);
    }
  });
});
