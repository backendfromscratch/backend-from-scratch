import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CryptoKeys from './CryptoKeys';
import { strings } from './strings';

describe('CryptoKeys', () => {
  it('se pinta en español, con las dos partes y sus mensajes de ejemplo', () => {
    const html = renderToString(<CryptoKeys lang="es" />);
    expect(html).toContain('playground · criptografía real');
    expect(html).toContain('Generar par de claves');
    expect(html).toContain('Hola, servidor');
    expect(html).toContain('Transfiere 10 € a Ana');
    expect(html).toContain('aria-live="polite"');
  });

  it('se pinta en inglés', () => {
    const html = renderToString(<CryptoKeys lang="en" />);
    expect(html).toContain('Generate key pair');
    expect(html).not.toContain('Generar par de claves');
  });

  it('los dos idiomas tienen las mismas claves', () => {
    expect(Object.keys(strings.en).sort()).toEqual(Object.keys(strings.es).sort());
  });
});
