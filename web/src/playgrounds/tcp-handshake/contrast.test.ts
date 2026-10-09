import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../lib/color';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const theme = read('../../styles/theme.css');
const lab = read('./tcp-handshake.css');

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
  if (start === -1) throw new Error(`Cannot find the rule «${selector}» in tcp-handshake.css`);
  const block = lab.slice(start, lab.indexOf('}', start));
  const match = block.match(new RegExp(`${property}:\\s*var\\(--ide-([a-z-]+)\\)`));
  if (!match) throw new Error(`«${selector}» does not use an --ide-* token in ${property}`);
  return match[1]!;
}

const themes = { oscuro: tokens(':root'), claro: tokens(":root[data-theme='light']") };

/** The lines that draw the ladder: they are meaningful graphics, so they need 3:1 (WCAG 1.4.11). */
const lines = {
  'líneas de vida': labToken('.tcp-lab__rows::before,\n.tcp-lab__rows::after', 'background'),
  'flechas del cliente': labToken('.tcp-lab__row--client .tcp-lab__line', 'color'),
  'flechas del servidor': labToken('.tcp-lab__row--server .tcp-lab__line', 'color'),
  'flechas perdidas': labToken('.tcp-lab__row--lost .tcp-lab__line', 'color'),
};

describe.each(Object.entries(themes))('laboratorio, tema %s', (_name, t) => {
  it.each(Object.entries(lines))(
    '%s: at least 3:1 against the panel background',
    (_line, token) => {
      expect(contrastRatio(t[token]!, t.chrome!)).toBeGreaterThanOrEqual(3);
    },
  );
});
