import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DnsLookup from './DnsLookup';

describe('DnsLookup', () => {
  it('se pinta en español, con el formulario listo y el aviso de que el recorrido se reconstruye', () => {
    const html = renderToString(<DnsLookup lang="es" />);
    expect(html).toContain('laboratorio · consulta DNS');
    expect(html).toContain('Dominio');
    expect(html).toContain('value="example.com"');
    expect(html).toContain('Consultar');
    expect(html).toContain('La consulta es real');
    expect(html).toContain('dig +trace lo hace de verdad');
    expect(html).toContain('aria-live="polite"');
  });

  it('se pinta en inglés', () => {
    const html = renderToString(<DnsLookup lang="en" />);
    expect(html).toContain('lab · DNS lookup');
    expect(html).toContain('Look up');
    expect(html).not.toContain('Consultar');
  });
});
