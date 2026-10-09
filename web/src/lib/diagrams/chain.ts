/**
 * Vertical flow diagrams in Mermaid syntax (flowchart TB), converted to HTML at build time. Only a
 * chain is supported: A["text"] -->|link| B["text"], with no branches.
 */
import { DiagramError } from './errors';
import { el, text, type HastElement } from './hast';

export interface Chain {
  /** The lines of text of each node, in order; the first is its name. */
  nodes: string[][];
  /** The text of the link between each node and the next. */
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
      `Only «flowchart TB» (top to bottom) is supported; this diagram starts with «${first?.text}».`,
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
      throw new DiagramError(`«${id}» has two texts.`, number);
    labels.set(id, label);
  };

  for (const { text: line, number } of rest) {
    const match = EDGE.exec(line);
    if (!match) {
      throw new DiagramError(
        `Unsupported line: «${line}». Supported: A["text"] -->|link| B["text"].`,
        number,
      );
    }
    const [, from, fromLabel, edge, to, toLabel] = match;
    define(from!, fromLabel, number);
    define(to!, toLabel, number);
    if (next.has(from!))
      throw new DiagramError(`Only a chain is supported: «${from}» has two outputs.`, number);
    if (incoming.has(to!))
      throw new DiagramError(`Only a chain is supported: «${to}» has two inputs.`, number);
    next.set(from!, { to: to!, edge: edge!.trim() });
    incoming.add(to!);
  }

  if (next.size === 0) throw new Error('The diagram has no links.');
  for (const id of nodes) {
    if (!labels.has(id))
      throw new Error(`«${id}» has no text: write ${id}["…"] the first time it appears.`);
  }
  const starts = [...nodes].filter((id) => !incoming.has(id));
  if (starts.length !== 1) throw new Error('The diagram must be a single chain.');

  const chain: Chain = { nodes: [], edges: [] };
  let current: string | undefined = starts[0];
  while (current !== undefined) {
    chain.nodes.push(splitText(labels.get(current)!));
    const step = next.get(current);
    if (step) chain.edges.push(step.edge);
    current = step?.to;
  }
  if (chain.nodes.length !== nodes.size) throw new Error('The diagram must be a single chain.');
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
