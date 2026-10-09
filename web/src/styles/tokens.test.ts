import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../lib/color';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

/** Extracts the --ide-* tokens from the first block that starts with `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Cannot find the "${selector}" block in theme.css`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--ide-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map(([, name, value]) => [
      name,
      value,
    ]),
  );
}

const themes = {
  dark: tokens(':root'),
  light: tokens(":root[data-theme='light']"),
};
const TEXT = ['text', 'strong', 'muted', 'keyword', 'string', 'comment', 'accent'];
const BACKGROUNDS = ['bg', 'chrome', 'deep', 'selection', 'line'];

describe.each(Object.entries(themes))('%s theme', (_name, t) => {
  it('defines all the text and background tokens', () => {
    for (const name of [...TEXT, ...BACKGROUNDS, 'on-accent']) expect(t[name], name).toMatch(/^#/);
  });

  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg])))(
    '%s on %s reaches 4.5:1',
    (fg, bg) => {
      expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BACKGROUNDS)('the form field border (control) on %s reaches 3:1 (WCAG 1.4.11)', (bg) => {
    expect(t.control, 'control').toMatch(/^#/);
    expect(contrastRatio(t.control!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it('on-accent on accent reaches 4.5:1', () => {
    expect(contrastRatio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Starlight form fields', () => {
  it('the search field uses the control border (the Starlight one does not reach 3:1)', () => {
    expect(css).toMatch(
      /#starlight__search input:not\(:focus\)\s*\{[^}]*--pagefind-ui-border:\s*var\(--ide-control\)/,
    );
  });
});
