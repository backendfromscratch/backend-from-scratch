import { describe, expect, it } from 'vitest';
import { parseChain, renderChain } from './chain';
import { classList, findByClass, textContent } from './hast';

const TCP_IP = `flowchart TB
    A["Tu portátil<br/>aplicación · transporte · red · enlace"] -->|wifi| B["Router de casa<br/>red · enlace"]
    B -->|fibra| C["Routers de tu operador y de internet<br/>red · enlace"]
    C -->|cable| D["Servidor<br/>aplicación · transporte · red · enlace"]`;

describe('parseChain', () => {
  it('reads a vertical chain of nodes with their links', () => {
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
    ['flowchart LR\nA["a"] -->|x| B["b"]', /Only «flowchart TB»/],
    ['flowchart TB\nA["a"] --> B["b"]', /Unsupported line/],
    ['flowchart TB\nA["a"] -->|x| B["b"]\nA -->|y| C["c"]', /«A» has two outputs/],
    ['flowchart TB\nA["a"] -->|x| B', /«B» has no text/],
    ['flowchart TB\nA["a"] -->|x| B["b"]\nC["c"] -->|y| D["d"]', /a single chain/],
  ])('fails with a clear message on unsupported input (%#)', (source, error) => {
    expect(() => parseChain(source)).toThrow(error);
  });
});

describe('renderChain', () => {
  const figure = renderChain(parseChain(TCP_IP));

  it('an ordered list: each step with its node and, except the last, the link to the next', () => {
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

describe('parseChain: the error line', () => {
  it('a single-line error says which line', () => {
    try {
      parseChain('flowchart TB\nA["a"] -->|x| B["b"]\nA -->|y| C["c"]');
      throw new Error('did not throw');
    } catch (error) {
      expect((error as { line?: number }).line).toBe(3);
    }
  });
});
