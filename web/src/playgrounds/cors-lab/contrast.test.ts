import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../lib/color';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const theme = read('../../styles/theme.css');
const lab = read('./cors-lab.css');

/** The --ide-* tokens of the first theme.css block that starts with `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = theme.indexOf(`${selector} {`);
  const block = theme.slice(start, theme.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--ide-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map(([, name, value]) => [
      name,
      value,
    ]),
  );
}

/** Every --ide-* token that `property` uses in the lab CSS rule that starts with `selector`. */
function labTokens(selector: string, property: string): string[] {
  const start = lab.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Cannot find the rule «${selector}» in cors-lab.css`);
  const block = lab.slice(start, lab.indexOf('}', start));
  const declaration = block.match(new RegExp(`${property}:([^;]+);`))?.[1] ?? '';
  const found = [...declaration.matchAll(/var\(--ide-([a-z-]+)\)/g)].map(([, name]) => name!);
  if (found.length === 0) throw new Error(`«${selector}» uses no --ide-* token in ${property}`);
  return found;
}

const themes = { dark: tokens(':root'), light: tokens(":root[data-theme='light']") };

/** What draws the sequence: meaningful graphics, so they need 3:1 (WCAG 1.4.11). */
const lines = {
  lifelines: labTokens('.cors-lab__rows', 'background'),
  'the page’s arrows': labTokens('.cors-lab__row--from-page .cors-lab__line', 'color'),
  'the browser’s arrows': labTokens('.cors-lab__row--from-browser .cors-lab__line', 'color'),
  'the server’s arrows': labTokens('.cors-lab__row--from-server .cors-lab__line', 'color'),
  'a request not sent': labTokens('.cors-lab__row--not-sent .cors-lab__line', 'color'),
};

describe.each(Object.entries(themes))('lab, %s theme', (_name, t) => {
  it.each(Object.entries(lines))('%s: at least 3:1 against the panel', (_line, used) => {
    for (const token of used) expect(contrastRatio(t[token]!, t.chrome!)).toBeGreaterThanOrEqual(3);
  });
});
