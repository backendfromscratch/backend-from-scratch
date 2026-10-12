import { mdxToJs } from 'satteri';
import { describe, expect, it } from 'vitest';
import { gluedPrefix, satteriTermPunctuation } from './term-punctuation';

/** The MDX content as compiled JSX, on one line, to look for what the plugin did. */
function compile(mdx: string): string {
  const { code } = mdxToJs(`import Term from 'x';\n\n${mdx}\n`, {
    mdastPlugins: [satteriTermPunctuation],
  });
  return code.slice(code.indexOf('function _createMdxContent')).replace(/\s+/g, ' ');
}

const group = (inner: string, glued: string) =>
  `_jsxs(_components.span, { class: "term-group", children: [${inner}, "${glued}"] })`;
const term = (text: string) => `_jsx(Term, { id: "x", children: "${text}" })`;

describe('gluedPrefix', () => {
  it('takes everything up to the first whitespace', () => {
    expect(gluedPrefix('. La otra')).toBe('.');
    expect(gluedPrefix('/1.1, la primera')).toBe('/1.1,');
    expect(gluedPrefix(' y otra')).toBe('');
    expect(gluedPrefix('')).toBe('');
  });
});

describe('satteriTermPunctuation', () => {
  it('keeps the period after a term with the term', () => {
    const js = compile('Se llama <Term id="x">frontend</Term>. La otra.');
    expect(js).toContain(`"Se llama ", ${group(term('frontend'), '.')}, " La otra."`);
  });

  it('keeps everything glued, up to the space: «HTTP/1.1,» stays whole', () => {
    const js = compile('En <Term id="x">HTTP</Term>/1.1, la primera.');
    expect(js).toContain(`${group(term('HTTP'), '/1.1,')}, " la primera."`);
  });

  it('climbs out of the bold the term ends: «**término**.»', () => {
    const js = compile('Un **<Term id="x">protocolo</Term>**.');
    expect(js).toContain(
      group(`_jsx(_components.strong, { children: ${term('protocolo')} })`, '.'),
    );
  });

  it('leaves alone a term followed by a space, or at the end of the paragraph', () => {
    const js = compile('Un <Term id="x">backend</Term> y otro <Term id="x">cliente</Term>');
    expect(js).not.toContain('term-group');
  });

  it('does not climb out of a bold that goes on after the term', () => {
    const js = compile('**<Term id="x">TCP</Term> se encarga**.');
    expect(js).not.toContain('term-group');
  });

  it('leaves other components alone', () => {
    const js = compile('Un <Other>x</Other>.');
    expect(js).not.toContain('term-group');
  });
});
