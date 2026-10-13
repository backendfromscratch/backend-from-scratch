import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CorsLab from './CorsLab';

describe('CorsLab', () => {
  it('renders in Spanish with the first step of the usual error', () => {
    const html = renderToString(<CorsLab lang="es" />);
    expect(html).toContain('laboratorio · CORS');
    expect(html).toContain('El error de siempre');
    expect(html).toContain('Siguiente paso');
    expect(html).toContain('https://api.tienda.example/pedidos');
    expect(html).toContain('Aún no se sabe');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders in English with the English names', () => {
    const html = renderToString(<CorsLab lang="en" />);
    expect(html).toContain('lab · CORS');
    expect(html).toContain('Next step');
    expect(html).toContain('https://api.shop.example/orders');
    expect(html).not.toContain('tienda');
    expect(html).not.toContain('Siguiente paso');
  });
});
