/**
 * Diagramas de flujo verticales con la sintaxis de Mermaid (flowchart TB), convertidos a HTML en el
 * build. Solo se admite una cadena: A["texto"] -->|enlace| B["texto"], sin ramas.
 */
import { DiagramError } from './errors';
import { el, text, type HastElement } from './hast';

export interface Chain {
  /** Las líneas de texto de cada nodo, en orden; la primera es su nombre. */
  nodes: string[][];
  /** El texto del enlace entre cada nodo y el siguiente. */
  edges: string[];
}

const EDGE = /^(\w+)(?:\["([^"]+)"\])?\s*-->\|([^|]+)\|\s*(\w+)(?:\["([^"]+)"\])?$/;
const splitText = (value: string) => value.split(/<br\s*\/?>/i).map((part) => part.trim());

export function parseChain(source: string): Chain {
  const [first, ...rest] = source
    .split('\n')
    .map((text, i) => ({ text: text.trim(), number: i + 1 }))
    .filter((line) => line.text);
  if (first?.text !== 'flowchart TB') {
    throw new DiagramError(
      `Solo se admite «flowchart TB» (de arriba abajo); este diagrama empieza por «${first?.text}».`,
      first?.number,
    );
  }
  const labels = new Map<string, string>();
  const next = new Map<string, { to: string; edge: string }>();
  const incoming = new Set<string>();
  const nodes = new Set<string>();
  const define = (id: string, label: string | undefined, number: number) => {
    nodes.add(id);
    if (label === undefined) return;
    if (labels.has(id) && labels.get(id) !== label)
      throw new DiagramError(`«${id}» tiene dos textos.`, number);
    labels.set(id, label);
  };

  for (const { text: line, number } of rest) {
    const match = EDGE.exec(line);
    if (!match) {
      throw new DiagramError(
        `Línea no admitida: «${line}». Admitido: A["texto"] -->|enlace| B["texto"].`,
        number,
      );
    }
    const [, from, fromLabel, edge, to, toLabel] = match;
    define(from!, fromLabel, number);
    define(to!, toLabel, number);
    if (next.has(from!))
      throw new DiagramError(`Solo se admite una cadena: «${from}» tiene dos salidas.`, number);
    if (incoming.has(to!))
      throw new DiagramError(`Solo se admite una cadena: «${to}» tiene dos entradas.`, number);
    next.set(from!, { to: to!, edge: edge!.trim() });
    incoming.add(to!);
  }

  if (next.size === 0) throw new Error('El diagrama no tiene ningún enlace.');
  for (const id of nodes) {
    if (!labels.has(id))
      throw new Error(`«${id}» no tiene texto: escribe ${id}["…"] la primera vez que aparece.`);
  }
  const starts = [...nodes].filter((id) => !incoming.has(id));
  if (starts.length !== 1) throw new Error('El diagrama tiene que ser una sola cadena.');

  const chain: Chain = { nodes: [], edges: [] };
  let current: string | undefined = starts[0];
  while (current !== undefined) {
    chain.nodes.push(splitText(labels.get(current)!));
    const step = next.get(current);
    if (step) chain.edges.push(step.edge);
    current = step?.to;
  }
  if (chain.nodes.length !== nodes.size)
    throw new Error('El diagrama tiene que ser una sola cadena.');
  return chain;
}

export function renderChain(chain: Chain): HastElement {
  return el('figure', { className: ['chain', 'not-content'] }, [
    el(
      'ol',
      { className: ['chain__list'] },
      chain.nodes.map(([name, ...details], i) =>
        el('li', { className: ['chain__step'] }, [
          el('div', { className: ['chain__node'] }, [
            el('span', { className: ['chain__name'] }, [text(name!)]),
            ...details.map((detail) =>
              el('span', { className: ['chain__detail'] }, [text(detail)]),
            ),
          ]),
          ...(i < chain.edges.length
            ? [el('p', { className: ['chain__edge'] }, [text(chain.edges[i]!)])]
            : []),
        ]),
      ),
    ),
  ]);
}
