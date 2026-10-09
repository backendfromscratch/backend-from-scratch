/**
 * Sätteri plugin (Astro 7's Markdown processor): replaces each ```mermaid block with its diagram
 * as HTML (sequences or chains). No JavaScript in the browser, with the text in the HTML (search
 * engines and screen readers read it) and using the theme colors. A diagram that cannot be drawn
 * fails the build. Registered by src/integrations/diagrams.ts.
 */
import { fileURLToPath } from 'node:url';
import { parseChain, renderChain } from './chain';
import { DiagramError } from './errors';
import { toHtml, type HastElement } from './hast';
import { parseSequence, renderSequence } from './sequence';

export function diagramFromMermaid(source: string): HastElement {
  const kind = source.trim().split('\n')[0]?.trim();
  if (kind === 'sequenceDiagram') return renderSequence(parseSequence(source));
  if (kind === 'flowchart TB') return renderChain(parseChain(source));
  throw new Error(
    `Unsupported diagram type: «${kind}». Supported: sequenceDiagram and flowchart TB.`,
  );
}

/** What the plugin needs from an mdast code node. */
interface CodeNode {
  lang?: string | null;
  value: string;
  position?: { start: { line: number } };
}

export function satteriDiagrams() {
  return {
    name: 'diagrams',
    // With positions, the error says which line holds the diagram that cannot be drawn.
    options: { position: true },
    code(node: Readonly<CodeNode>, context: { readonly fileURL: URL | undefined }) {
      if (node.lang !== 'mermaid') return undefined;
      try {
        // An html node is inserted as is, in MDX too (braces are not interpreted).
        return { type: 'html' as const, value: toHtml(diagramFromMermaid(node.value)) };
      } catch (error) {
        const file = context.fileURL ? fileURLToPath(context.fileURL) : '?';
        // The block opens at `start`; line k of the diagram is at start + k.
        const start = node.position?.start.line;
        const offset = error instanceof DiagramError ? (error.line ?? 0) : 0;
        const line = start === undefined ? '?' : start + offset;
        throw new Error(`[diagrams] ${file}:${line}: ${(error as Error).message}`);
      }
    },
  };
}
