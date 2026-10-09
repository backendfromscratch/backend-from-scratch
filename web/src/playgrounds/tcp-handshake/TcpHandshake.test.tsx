import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TcpHandshake from './TcpHandshake';

describe('TcpHandshake', () => {
  it('renders in Spanish with the initial state', () => {
    const html = renderToString(<TcpHandshake lang="es" />);
    expect(html).toContain('laboratorio · handshake TCP');
    expect(html).toContain('Siguiente paso');
    expect(html).toContain('LISTEN');
    expect(html).toContain('El servidor ya está escuchando');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders in English', () => {
    const html = renderToString(<TcpHandshake lang="en" />);
    expect(html).toContain('lab · TCP handshake');
    expect(html).toContain('Next step');
    expect(html).not.toContain('Siguiente paso');
  });
});
