import { describe, expect, it } from 'vitest';
import { parsePage } from './page';

const PAGE = `<!doctype html><html lang="es" dir="ltr" data-theme="dark"><head>
<meta charset="utf-8"/><title>DNS | Backend desde cero</title>
<link rel="canonical" href="https://backenddesdecero.com/fase-0/que-es-dns/"/>
<meta name="description" content="Cómo se convierte un nombre en una IP &amp; por qué"/>
<meta property="og:image" content="https://backenddesdecero.com/og/fase-0/que-es-dns.png"/>
<link rel="alternate" hreflang="es" href="https://backenddesdecero.com/fase-0/que-es-dns/"/>
<link rel="alternate" hreflang="en" href="https://backenddesdecero.com/en/phase-0/what-is-dns/"/>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
</head><body>
<starlight-lang-select><label><select><option value="/fase-0/que-es-dns/" selected>Español</option><option value="/en/phase-0/what-is-dns/">English</option></select></label></starlight-lang-select>
<h1 id="_top">DNS</h1>
<button data-code="<html><body><h1>400 Bad Request</h1></body></html>">Copiar</button>
<pre class="mermaid">sequenceDiagram</pre>
</body></html>`;

describe('parsePage', () => {
  const facts = parsePage(PAGE);

  it('lee el idioma, el título, la descripción y la URL canónica', () => {
    expect(facts.lang).toBe('es');
    expect(facts.title).toBe('DNS | Backend desde cero');
    expect(facts.description).toBe('Cómo se convierte un nombre en una IP & por qué');
    expect(facts.canonical).toBe('https://backenddesdecero.com/fase-0/que-es-dns/');
  });

  it('lee los hreflang, la imagen para redes y el JSON-LD', () => {
    expect(facts.alternates).toEqual([
      { hreflang: 'es', href: 'https://backenddesdecero.com/fase-0/que-es-dns/' },
      { hreflang: 'en', href: 'https://backenddesdecero.com/en/phase-0/what-is-dns/' },
    ]);
    expect(facts.ogImage).toBe('https://backenddesdecero.com/og/fase-0/que-es-dns.png');
    expect(facts.jsonLd).toEqual([{ '@type': 'BreadcrumbList', itemListElement: [] }]);
  });

  it('lee a dónde lleva el selector de idioma', () => {
    expect(facts.languageOptions).toEqual(['/fase-0/que-es-dns/', '/en/phase-0/what-is-dns/']);
  });

  it('no cuenta como etiqueta el HTML que va dentro de un atributo (el botón de copiar)', () => {
    expect(facts.h1Count).toBe(1);
  });

  it('cuenta los diagramas Mermaid sin convertir', () => {
    expect(facts.mermaidBlocks).toBe(1);
  });

  it('una página sin esas etiquetas da undefined o listas vacías', () => {
    const empty = parsePage('<html><head><title>X</title></head><body></body></html>');
    expect(empty.lang).toBeUndefined();
    expect(empty.description).toBeUndefined();
    expect(empty.canonical).toBeUndefined();
    expect(empty.robots).toBeUndefined();
    expect(empty.alternates).toEqual([]);
    expect(empty.jsonLd).toEqual([]);
    expect(empty.languageOptions).toEqual([]);
    expect(empty.h1Count).toBe(0);
  });

  it('lee robots y marca el JSON-LD que no se puede leer', () => {
    const page = parsePage(
      '<html lang="en"><head><meta name="robots" content="noindex"/><script type="application/ld+json">{roto</script></head></html>',
    );
    expect(page.robots).toBe('noindex');
    expect(page.jsonLd).toEqual([{ invalidJson: '{roto' }]);
  });

  it('lee los enlaces de la página, pero no los que van dentro de un atributo', () => {
    const page = parsePage(
      '<html><body><a href="/fase-0/">x</a><a class="b" href="https://otra.com/">y</a><button data-code="<a href=&quot;/no/&quot;>z</a>"></button></body></html>',
    );
    expect(page.links).toEqual(['/fase-0/', 'https://otra.com/']);
  });
});
