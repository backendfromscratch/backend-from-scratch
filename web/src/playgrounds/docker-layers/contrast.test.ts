import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../lib/color';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const theme = read('../../styles/theme.css');
const lab = read('./docker-layers.css');

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

/** The token that `property` uses in the lab CSS rule that starts with `selector`. */
function labToken(selector: string, property: string): string {
  const start = lab.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Cannot find the rule «${selector}» in docker-layers.css`);
  const block = lab.slice(start, lab.indexOf('}', start));
  const match = block.match(new RegExp(`${property}:[^;]*var\\(--ide-([a-z-]+)\\)`));
  if (!match) throw new Error(`«${selector}» does not use an --ide-* token in ${property}`);
  return match[1]!;
}

const themes = { dark: tokens(':root'), light: tokens(":root[data-theme='light']") };

/** The edges that mark a layer: meaningful graphics, so they need 3:1 (WCAG 1.4.11). */
const edges = {
  'reused layer': labToken('.docker-lab__layer--cached', 'border-inline-start-color'),
  'rebuilt layer': labToken('.docker-lab__layer--rebuilt', 'border-inline-start-color'),
  'base image': labToken('.docker-lab__layer--base', 'border-inline-start-color'),
};

describe.each(Object.entries(themes))('lab, %s theme', (_name, t) => {
  it.each(Object.entries(edges))('%s: at least 3:1 against the layer background', (_e, token) => {
    expect(contrastRatio(t[token]!, t.bg!)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t[token]!, t.chrome!)).toBeGreaterThanOrEqual(3);
  });

  it('the marks’ words are text: at least 4.5:1 on the layer background', () => {
    for (const token of ['string', 'accent', 'muted']) {
      expect(contrastRatio(t[token]!, t.bg!)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
