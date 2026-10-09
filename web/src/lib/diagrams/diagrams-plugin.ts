/**
 * Plugin de Sätteri (el procesador de Markdown de Astro 7): cambia cada bloque ```mermaid por su
 * diagrama en HTML (secuencias o cadenas). Sin JavaScript en el navegador, con el texto en el HTML
 * (lo leen los buscadores y los lectores de pantalla) y con los colores del tema. Un diagrama que
 * no se sabe dibujar hace fallar el build. Lo registra src/integrations/diagrams.ts.
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
    `Tipo de diagrama no admitido: «${kind}». Admitidos: sequenceDiagram y flowchart TB.`,
  );
}

/** Lo que el plugin necesita de un nodo de código de mdast. */
interface CodeNode {
  lang?: string | null;
  value: string;
  position?: { start: { line: number } };
}

export function satteriDiagrams() {
  return {
    name: 'diagrams',
    // Con posiciones, el error dice en qué línea está el diagrama que no se sabe dibujar.
    options: { position: true },
    code(node: Readonly<CodeNode>, context: { readonly fileURL: URL | undefined }) {
      if (node.lang !== 'mermaid') return undefined;
      try {
        // Un nodo html se inserta tal cual, también en MDX (las llaves no se interpretan).
        return { type: 'html' as const, value: toHtml(diagramFromMermaid(node.value)) };
      } catch (error) {
        const file = context.fileURL ? fileURLToPath(context.fileURL) : '?';
        // El bloque abre en `start`; la línea k del diagrama está en start + k.
        const start = node.position?.start.line;
        const offset = error instanceof DiagramError ? (error.line ?? 0) : 0;
        const line = start === undefined ? '?' : start + offset;
        throw new Error(`[diagrams] ${file}:${line}: ${(error as Error).message}`);
      }
    },
  };
}
