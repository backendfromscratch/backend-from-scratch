import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../lib/color';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const theme = read('../../styles/theme.css');
const lab = read('./tcp-handshake.css');

/** Los tokens --ide-* del primer bloque de theme.css que empieza por `selector {`. */
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

/** El token que usa `property` en la regla del CSS del laboratorio que empieza por `selector`. */
function labToken(selector: string, property: string): string {
  const start = lab.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No encuentro la regla «${selector}» en tcp-handshake.css`);
  const block = lab.slice(start, lab.indexOf('}', start));
  const match = block.match(new RegExp(`${property}:\\s*var\\(--ide-([a-z-]+)\\)`));
  if (!match) throw new Error(`«${selector}» no usa un token --ide-* en ${property}`);
  return match[1]!;
}

const themes = { oscuro: tokens(':root'), claro: tokens(":root[data-theme='light']") };

/** Las líneas que dibujan la escalera: son gráficos con significado, así que piden 3:1 (WCAG 1.4.11). */
const lines = {
  'líneas de vida': labToken('.tcp-lab__rows::before,\n.tcp-lab__rows::after', 'background'),
  'flechas del cliente': labToken('.tcp-lab__row--client .tcp-lab__line', 'color'),
  'flechas del servidor': labToken('.tcp-lab__row--server .tcp-lab__line', 'color'),
  'flechas perdidas': labToken('.tcp-lab__row--lost .tcp-lab__line', 'color'),
};

describe.each(Object.entries(themes))('laboratorio, tema %s', (_name, t) => {
  it.each(Object.entries(lines))('%s: al menos 3:1 sobre el fondo del panel', (_line, token) => {
    expect(contrastRatio(t[token]!, t.chrome!)).toBeGreaterThanOrEqual(3);
  });
});
