import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SqlPlayground from './SqlPlayground';
import { strings } from './strings';

describe('SqlPlayground', () => {
  it('renders in Spanish, with its default query and no engine yet', () => {
    const html = renderToString(<SqlPlayground lang="es" />);
    expect(html).toContain('playground · PostgreSQL en tu navegador');
    expect(html).toContain('SELECT * FROM productos;');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders the lesson’s query, in English', () => {
    const html = renderToString(<SqlPlayground lang="en" query="SELECT name FROM products;" />);
    expect(html).toContain('SELECT name FROM products;');
    expect(html).toContain('Run');
    expect(html).not.toContain('Ejecutar');
  });

  it('both languages have the same keys', () => {
    expect(Object.keys(strings.en).sort()).toEqual(Object.keys(strings.es).sort());
  });
});
