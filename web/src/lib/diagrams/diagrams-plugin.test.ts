import { describe, expect, it } from 'vitest';
import { satteriDiagrams } from './diagrams-plugin';

const plugin = satteriDiagrams();
const context = { fileURL: new URL('file:///proyecto/src/content/docs/fase-0/x.mdx') };
const SEQUENCE = 'sequenceDiagram\nparticipant A as Uno\nparticipant B as Dos\nA->>B: hola';

describe('satteriDiagrams', () => {
  it('asks for node positions, to say which line a diagram fails on', () => {
    expect(plugin.options).toEqual({ position: true });
  });

  it('replaces a mermaid sequence block with the HTML figure', () => {
    const result = plugin.code({ lang: 'mermaid', value: SEQUENCE }, context);
    expect(result?.type).toBe('html');
    expect(result?.value).toMatch(/^<figure class="seq seq--n2 not-content">/);
    expect(result?.value).toContain('Uno → Dos');
  });

  it('chains too (flowchart TB)', () => {
    const result = plugin.code(
      { lang: 'mermaid', value: 'flowchart TB\nA["a"] -->|x| B["b"]' },
      context,
    );
    expect(result?.value).toMatch(/^<figure class="chain not-content">/);
  });

  it('the HTML is on a single line: a blank line would cut the HTML block', () => {
    expect(plugin.code({ lang: 'mermaid', value: SEQUENCE }, context)?.value).not.toContain('\n');
  });

  it('leaves other code blocks alone', () => {
    expect(plugin.code({ lang: 'sh', value: 'curl example.com' }, context)).toBeUndefined();
  });

  it('the error points to the bad line of the file, not to the block opening', () => {
    // The block opens at line 12; «loop x» is its fourth line: line 16 of the file.
    const node = {
      lang: 'mermaid',
      value: 'sequenceDiagram\nparticipant A as A\nparticipant B as B\nloop x',
      position: { start: { line: 12 } },
    };
    expect(() => plugin.code(node, context)).toThrow(/x\.mdx:16: Unsupported line/);
  });

  it('an unsupported diagram fails the build, with the file and line', () => {
    const node = { lang: 'mermaid', value: 'graph LR\nA --> B', position: { start: { line: 12 } } };
    expect(() => plugin.code(node, context)).toThrow(
      /\/proyecto\/src\/content\/docs\/fase-0\/x\.mdx:12: Unsupported diagram type: «graph LR»/,
    );
  });
});
