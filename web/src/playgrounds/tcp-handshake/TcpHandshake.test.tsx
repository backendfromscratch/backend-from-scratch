import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TcpHandshake from './TcpHandshake';

describe('TcpHandshake', () => {
  it('se pinta en español con el estado inicial', () => {
    const html = renderToString(<TcpHandshake lang="es" />);
    expect(html).toContain('laboratorio · handshake TCP');
    expect(html).toContain('Siguiente paso');
    expect(html).toContain('LISTEN');
    expect(html).toContain('El servidor ya está escuchando');
    expect(html).toContain('aria-live="polite"');
  });

  it('se pinta en inglés', () => {
    const html = renderToString(<TcpHandshake lang="en" />);
    expect(html).toContain('lab · TCP handshake');
    expect(html).toContain('Next step');
    expect(html).not.toContain('Siguiente paso');
  });
});
