import { describe, expect, it } from 'vitest';
import { closureBytes, jsImports, scriptEntries } from './js-budget';

describe('scriptEntries', () => {
  it('finds scripts, modulepreloads, Astro islands and inline imports', () => {
    const html = `<script type="module" src="/_astro/page.js"></script>
<link rel="modulepreload" href="/_astro/pre.js">
<astro-island component-url="/_astro/Lab.js" renderer-url="/_astro/client.js"></astro-island>
<script type="module">import("/_astro/inline.js")</script>
<script src="https://example.com/fuera.js"></script>`;
    expect(scriptEntries(html)).toEqual([
      '/_astro/Lab.js',
      '/_astro/client.js',
      '/_astro/inline.js',
      '/_astro/page.js',
      '/_astro/pre.js',
    ]);
  });
});

describe('jsImports', () => {
  it('resolves static and dynamic imports, with double, single or backtick quotes', () => {
    const code =
      'import{a}from"./a.js";import "./b.js";const c=()=>import(`./sub/c.js`);import(\'/_astro/d.js\');';
    expect(jsImports(code, '/_astro/page.js').sort()).toEqual([
      '/_astro/a.js',
      '/_astro/b.js',
      '/_astro/d.js',
      '/_astro/sub/c.js',
    ]);
  });

  it('resolves paths with ../', () => {
    expect(jsImports('import"../x.js"', '/_astro/sub/y.js')).toEqual(['/_astro/x.js']);
  });
});

describe('closureBytes', () => {
  const files: Record<string, string> = {
    '/_astro/page.js': 'import"./shared.js";import(`./heavy.js`)',
    '/_astro/shared.js': 'export const s=1',
    '/_astro/heavy.js': 'import"./shared.js";' + 'x'.repeat(1000),
  };
  const read = (path: string) => files[path];
  const size = (code: string) => new TextEncoder().encode(code).length;

  it('adds up each reachable file once, dynamic imports included', () => {
    const expected =
      size(files['/_astro/page.js']!) +
      size(files['/_astro/shared.js']!) +
      size(files['/_astro/heavy.js']!);
    expect(closureBytes(['/_astro/page.js'], read)).toBe(expected);
  });

  it('ignores files that do not exist', () => {
    expect(closureBytes(['/_astro/no-existe.js'], read)).toBe(0);
  });
});
