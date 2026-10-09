import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../lib/color';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

/** Extrae los tokens --ide-* del primer bloque que empieza por `selector {`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No encuentro el bloque «${selector}» en theme.css`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--ide-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map(([, name, value]) => [
      name,
      value,
    ]),
  );
}

const themes = {
  oscuro: tokens(':root'),
  claro: tokens(":root[data-theme='light']"),
};
const TEXT = ['text', 'strong', 'muted', 'keyword', 'string', 'comment', 'accent'];
const BACKGROUNDS = ['bg', 'chrome', 'deep', 'selection', 'line'];

describe.each(Object.entries(themes))('tema %s', (_name, t) => {
  it('define todos los tokens de texto y de fondo', () => {
    for (const name of [...TEXT, ...BACKGROUNDS, 'on-accent']) expect(t[name], name).toMatch(/^#/);
  });

  it.each(TEXT.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg])))(
    '%s sobre %s llega a 4,5:1',
    (fg, bg) => {
      expect(contrastRatio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BACKGROUNDS)(
    'el borde de los campos de formulario (control) sobre %s llega a 3:1 (WCAG 1.4.11)',
    (bg) => {
      expect(t.control, 'control').toMatch(/^#/);
      expect(contrastRatio(t.control!, t[bg]!)).toBeGreaterThanOrEqual(3);
    },
  );

  it('on-accent sobre accent llega a 4,5:1', () => {
    expect(contrastRatio(t['on-accent'], t.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('campos de formulario de Starlight', () => {
  it('el campo del buscador usa el borde de control (el de Starlight no llega a 3:1)', () => {
    expect(css).toMatch(
      /#starlight__search input:not\(:focus\)\s*\{[^}]*--pagefind-ui-border:\s*var\(--ide-control\)/,
    );
  });
});
