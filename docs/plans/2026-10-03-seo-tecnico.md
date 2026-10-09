# Plan de implementación: SEO técnico

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** dar a la web la base técnica de SEO del spec. El build deja de publicarse si algo de SEO se rompe. Lo que entra:
- español en la raíz con rutas traducidas;
- sitemap, canónicas, `hreflang` y `robots.txt`;
- migas en JSON-LD, imagen para redes por página y título de portada;
- diagramas sin JavaScript;
- una auditoría SEO dentro del build.

**Arquitectura:**
- **Auditoría:** lee el HTML generado al final del build (`src/integrations/seo-audit.ts`). Sus reglas son funciones puras con tests (`src/lib/seo/`), y cada tarea añade la suya antes de implementar lo que comprueba.
- **Rutas traducidas,** con tres piezas:
  - un índice de traducciones puro (`src/lib/translations.ts`);
  - un *route middleware* de Starlight (`src/routeData.ts`) que corrige el sidebar, la paginación y los `hreflang`;
  - una integración que borra las copias de respaldo antes de que Pagefind indexe.
- **Los bloques ```` ```mermaid ````** se convierten a HTML en el build con un plugin de remark (`src/lib/diagrams/`).

**Stack:**
- **Ya en el proyecto:** Astro 7.3.5, Starlight 0.42.5, MDX, Vitest 5, TypeScript y pnpm.
- **Se añaden:** `@astrojs/sitemap`, `satori`, `@resvg/resvg-js`, `@fontsource/atkinson-hyperlegible-next` y `@fontsource/jetbrains-mono`.
- **Se quitan:** `astro-mermaid` y `mermaid`.

**Spec:** `docs/specs/2026-10-03-seo-design.md` (§2.2, §3 y la prueba de concepto). Referencia de código, desechable: `docs/research/2026-10-03-prueba-rutas-traducidas.patch`.

## Restricciones globales

**Forma de trabajar**
- **Sin commits ni push:** el autor no quiere commits. Cada tarea termina con su verificación.
- **Comandos,** desde la raíz del repo:

  | Para qué | Comando |
  |---|---|
  | Un fichero de tests | `pnpm --filter web exec vitest run <ruta desde web/>` |
  | Todos los tests | `pnpm test` |
  | Tipos | `pnpm check` |
  | Formato | `pnpm format:check` |
  | Build (desde la Tarea 1 incluye la auditoría SEO) | `pnpm build` |

- **Sin `/tmp`:** los ficheros temporales van al scratchpad de la sesión. Sin datos personales en las salidas.
- **Código:** comentarios, mensajes de error y textos en español, como el resto del código.

**Decisiones fijas**
- **Dominio:** `https://backenddesdecero.com`.
- **Idiomas:** español en la raíz, sin prefijo; inglés en `/en/`. `x-default` apunta al español.
- **Rutas de la Fase 0.** Son definitivas: el autor las revisa al aprobar este plan, porque cambiarlas después de publicar cuesta redirecciones. La `translationKey` es el nombre de fichero actual.

  | `translationKey` | Español (`src/content/docs/…`) | Inglés (`src/content/docs/en/…`) |
  |---|---|---|
  | `phase-0` | `fase-0/index.mdx` | `phase-0/index.mdx` |
  | `client-server` | `fase-0/modelo-cliente-servidor.mdx` | `phase-0/client-server-model.mdx` |
  | `protocols` | `fase-0/que-es-un-protocolo.mdx` | `phase-0/what-is-a-protocol.mdx` |
  | `tcp-ip-model` | `fase-0/modelo-tcp-ip.mdx` | `phase-0/tcp-ip-model.mdx` |
  | `ip-ports-sockets` | `fase-0/ip-puertos-y-sockets.mdx` | `phase-0/ip-ports-sockets.mdx` |
  | `tcp-vs-udp` | `fase-0/tcp-vs-udp.mdx` | `phase-0/tcp-vs-udp.mdx` |
  | `dns` | `fase-0/que-es-dns.mdx` | `phase-0/what-is-dns.mdx` |
  | `tls-https` | `fase-0/tls-y-https.mdx` | `phase-0/tls-and-https.mdx` |
  | `from-url-to-page` | `fase-0/que-pasa-cuando-escribes-una-url.mdx` | `phase-0/what-happens-when-you-type-a-url.mdx` |

- **`roadmap` y `glossary`** mantienen la misma ruta en los dos idiomas. El sidebar de Starlight enlaza esas páginas por `slug`, que tiene que existir con la misma ruta en cada idioma.
- **Límite de JavaScript por página:** 300 KB sin comprimir, contando todo lo que la página puede llegar a importar (imports estáticos y dinámicos).
- **Diagramas:** un bloque ```` ```mermaid ```` admite solo `sequenceDiagram` y `flowchart TB` en cadena. Cualquier otra cosa hace fallar el build con el fichero y la línea.

**Qué contenido se toca**
- **Solo:** rutas, enlaces internos y frontmatter (`translationKey`, `prerequisites` y el `head` de las portadas).
- **No:** los títulos y descripciones nuevos de §4 del spec ni la revisión «para todos los públicos». Van en otro plan, que el autor revisa con su voz.

## Review Focus

1. **Una lección que solo existe en español** (como serán las de la Fase 1 al principio):
   - ni copia en `/en/`, ni en el sitemap, ni en el buscador;
   - sin `hreflang`;
   - el selector de idioma lleva a `/en/`.

   Tests en la Tarea 3: `fallbackUrls`, `alternateLinks` con un solo idioma, `languageTargets` y `translationsOf`.
2. **Las portadas,** que llegan con ids distintos según quién los dé (`''`, `index` y `en`). Esperado: viven en `/` y `/en/`, se emparejan entre sí, su pestaña es `README.md` y su imagen para redes es `/og/index.png`. Tests en las Tareas 3, 4 y 7.
3. **Dos páginas del mismo idioma con la misma `translationKey`** (un copia-pega): el build falla y nombra las dos. Test en la Tarea 3.
4. **Un diagrama con sintaxis no admitida:**
   - `loop` o `alt`;
   - `flowchart LR`;
   - un participante sin declarar;
   - un mensaje a sí mismo;
   - una cadena con ramas.

   El build falla con el fichero y la línea. Tests en la Tarea 5.
5. **Texto que se parece a otra cosa:**
   - un `<h1>` dentro del `data-code` del botón de copiar no es una etiqueta (Tarea 1);
   - una página española cuya ruta empieza por `en` (`enlaces`) no es inglesa (Tarea 3);
   - la fase 1 no se confunde con la 10 (Tarea 4).

## Estructura de ficheros

**Nuevos** (rutas relativas a `web/`):

| Fichero | Responsabilidad |
|---|---|
| `src/lib/seo/page.ts` | Leer de una página HTML lo que la auditoría necesita (`parsePage`) |
| `src/lib/seo/js-budget.ts` | Calcular el JavaScript que puede descargar una página |
| `src/lib/seo/audit.ts` | Reglas de la auditoría (`defaultRules`, `auditSite`) |
| `src/integrations/seo-audit.ts` | Integración: aplica la auditoría al build y lo hace fallar |
| `src/data/site.ts` | Dominio y título de la web, en un solo sitio |
| `public/robots.txt` | Permitir todo y apuntar al sitemap |
| `src/lib/translations.ts` | Índice de traducciones y URLs de las copias de respaldo (puro) |
| `src/lib/translations-astro.ts` | El índice, alimentado con la colección `docs` |
| `src/lib/route-fixes.ts` | Correcciones puras del sidebar, la paginación, los `hreflang` y el selector |
| `src/routeData.ts` | *Route middleware* de Starlight: aplica las correcciones, las migas y la imagen para redes |
| `src/components/overrides/LanguageSelect.astro` | Selector que lleva a la traducción real |
| `src/integrations/drop-fallbacks.ts` | Borrar del build las copias de respaldo |
| `src/lib/diagrams/hast.ts` | Construir y recorrer nodos HTML (hast) |
| `src/lib/diagrams/sequence.ts` | `sequenceDiagram` → HTML |
| `src/lib/diagrams/chain.ts` | `flowchart TB` → HTML |
| `src/lib/diagrams/remark-diagrams.ts` | Plugin de remark que cambia los bloques `mermaid` por esos diagramas |
| `src/styles/diagrams.css` | Estilos de los diagramas |
| `src/lib/structured-data.ts` | JSON-LD de las migas |
| `src/lib/og/card.ts` | Tarjeta para redes (árbol para satori) y sus rutas |
| `src/pages/og/[...route].png.ts` | Genera un PNG de 1200 × 630 por página |

**Modificados:**
- **Configuración:** `astro.config.ts`, `src/content.config.ts`, `src/data/phases.ts`, `src/styles/theme.css` y `package.json` (dependencias).
- **Lógica, con sus tests:** `src/lib/{locales,links,lessons,explorer,sidebar}.ts`.
- **Componentes:** `PageTitle`, `Footer`, `Sidebar`, `Pagination`, `PhaseList` y `LessonIntro`.
- **Contenido:** se mueve y renombra, y cambian sus enlaces internos y su frontmatter.
- **Documentación:** `docs/style-guide.md`, `docs/pendientes.md`, `CLAUDE.md` y el spec de SEO.

**Borrados:** `public/_redirects`, `src/scripts/mermaid-min-width.ts` y `src/components/overrides/MarkdownContent.astro`.

---

### Tarea 1: Auditoría SEO en el build

**Ficheros:**
- Crear: `web/src/lib/seo/page.ts`, `web/src/lib/seo/js-budget.ts`, `web/src/lib/seo/audit.ts` y `web/src/integrations/seo-audit.ts`
- Test: `web/src/lib/seo/page.test.ts`, `web/src/lib/seo/js-budget.test.ts` y `web/src/lib/seo/audit.test.ts`
- Modificar: `web/astro.config.ts`

**Interfaces:**
- Produce:
  - `parsePage(html: string): PageFacts`, con `PageFacts` = `{ lang, title, description, canonical, alternates: Alternate[], robots, ogImage, jsonLd: unknown[], languageOptions: string[], h1Count, mermaidBlocks }`;
  - `scriptEntries(html)`, `jsImports(code, fromPath)` y `closureBytes(entries, read)`;
  - `AuditPage`, `AuditInput`, `Issue` y `Rule`, las reglas `oneH1`, `titleAndDescription` y `langMatchesUrl`, y `defaultRules` y `auditSite(input, rules?)`;
  - `seoAudit(): AstroIntegration`.

  Las tareas siguientes añaden reglas a `audit.ts` y a `defaultRules`.

- [ ] **Paso 1: test de `parsePage`**

`web/src/lib/seo/page.test.ts`:

```ts
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
});
```

- [ ] **Paso 2: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/seo/page.test.ts`
Expected: FAIL, porque no encuentra `./page`.

- [ ] **Paso 3: implementar `parsePage`**

`web/src/lib/seo/page.ts`:

```ts
/**
 * Lo que la auditoría SEO necesita saber de una página generada. Se lee con expresiones regulares:
 * el HTML lo genera Astro, siempre con los atributos entre comillas dobles.
 */
export interface Alternate {
  hreflang: string;
  href: string;
}

export interface PageFacts {
  lang: string | undefined;
  title: string | undefined;
  description: string | undefined;
  canonical: string | undefined;
  alternates: Alternate[];
  robots: string | undefined;
  ogImage: string | undefined;
  /** Los bloques JSON-LD de la cabecera; uno que no sea JSON válido llega como { invalidJson }. */
  jsonLd: unknown[];
  /** Las URLs a las que lleva el selector de idioma. */
  languageOptions: string[];
  h1Count: number;
  mermaidBlocks: number;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};
const decode = (value: string) =>
  value.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity]!);

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [, name, value] of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g)) {
    result[name!] = decode(value!);
  }
  return result;
}

function tags(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(([tag]) => attributes(tag));
}

function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { invalidJson: raw };
  }
}

export function parsePage(html: string): PageFacts {
  const head = html.split(/<\/head>/i)[0] ?? '';
  const metas = tags(head, 'meta');
  const links = tags(head, 'link');
  const meta = (key: 'name' | 'property', value: string) =>
    metas.find((m) => m[key] === value)?.content;
  const title = /<title>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const languageSelect =
    /<starlight-lang-select>([\s\S]*?)<\/starlight-lang-select>/i.exec(html)?.[1] ?? '';
  // Sin el contenido de los atributos: el botón de copiar guarda el código en data-code, y un
  // «<h1>» ahí dentro no es una etiqueta.
  const markup = html.replace(/="[^"]*"/g, '=""');
  return {
    lang: attributes(/<html\b[^>]*>/i.exec(html)?.[0] ?? '').lang,
    title: title === undefined ? undefined : decode(title.trim()),
    description: meta('name', 'description'),
    canonical: links.find((l) => l.rel === 'canonical')?.href,
    alternates: links
      .filter((l) => l.rel === 'alternate' && l.hreflang !== undefined)
      .map((l) => ({ hreflang: l.hreflang!, href: l.href ?? '' })),
    robots: meta('name', 'robots'),
    ogImage: meta('property', 'og:image'),
    jsonLd: [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map(
      ([, raw]) => readJson(raw!),
    ),
    languageOptions: tags(languageSelect, 'option')
      .map((o) => o.value ?? '')
      .filter(Boolean),
    h1Count: (markup.match(/<h1\b/gi) ?? []).length,
    mermaidBlocks: (html.match(/class="mermaid"/g) ?? []).length,
  };
}
```

- [ ] **Paso 4: comprobar que pasa**

Run: `pnpm --filter web exec vitest run src/lib/seo/page.test.ts`
Expected: PASS (7 tests).

- [ ] **Paso 5: test del peso de JavaScript**

`web/src/lib/seo/js-budget.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { closureBytes, jsImports, scriptEntries } from './js-budget';

describe('scriptEntries', () => {
  it('encuentra los scripts, los modulepreload, las islas de Astro y los imports en línea', () => {
    const html = `<script type="module" src="/_astro/page.js"></script>
<link rel="modulepreload" href="/_astro/pre.js">
<astro-island component-url="/_astro/Lab.js" renderer-url="/_astro/client.js"></astro-island>
<script type="module">import("/_astro/inline.js")</script>
<script src="https://example.com/fuera.js"></script>`;
    expect(scriptEntries(html)).toEqual([
      '/_astro/Lab.js',
      '/_astro/client.js',
      '/_astro/inline.js',
      '/_astro/page.js',
      '/_astro/pre.js',
    ]);
  });
});

describe('jsImports', () => {
  it('resuelve imports estáticos y dinámicos, con comillas dobles, simples o invertidas', () => {
    const code =
      'import{a}from"./a.js";import "./b.js";const c=()=>import(`./sub/c.js`);import(\'/_astro/d.js\');';
    expect(jsImports(code, '/_astro/page.js').sort()).toEqual([
      '/_astro/a.js',
      '/_astro/b.js',
      '/_astro/d.js',
      '/_astro/sub/c.js',
    ]);
  });

  it('resuelve rutas con ../', () => {
    expect(jsImports('import"../x.js"', '/_astro/sub/y.js')).toEqual(['/_astro/x.js']);
  });
});

describe('closureBytes', () => {
  const files: Record<string, string> = {
    '/_astro/page.js': 'import"./shared.js";import(`./heavy.js`)',
    '/_astro/shared.js': 'export const s=1',
    '/_astro/heavy.js': 'import"./shared.js";' + 'x'.repeat(1000),
  };
  const read = (path: string) => files[path];
  const size = (code: string) => new TextEncoder().encode(code).length;

  it('suma cada fichero alcanzable una sola vez, también los imports dinámicos', () => {
    const expected =
      size(files['/_astro/page.js']!) +
      size(files['/_astro/shared.js']!) +
      size(files['/_astro/heavy.js']!);
    expect(closureBytes(['/_astro/page.js'], read)).toBe(expected);
  });

  it('ignora los ficheros que no existen', () => {
    expect(closureBytes(['/_astro/no-existe.js'], read)).toBe(0);
  });
});
```

- [ ] **Paso 6: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/seo/js-budget.test.ts`
Expected: FAIL, porque no encuentra `./js-budget`.

- [ ] **Paso 7: implementar el cálculo**

`web/src/lib/seo/js-budget.ts`:

```ts
/**
 * Cuánto JavaScript puede llegar a descargar una página: sus scripts y todo lo que importan, también
 * con import() dinámico. Es una cota superior (no todo se descarga siempre), pero habría detectado
 * los 3,4 MB que Mermaid podía cargar en cada lección.
 */
import path from 'node:path';

const IMPORT = /(?:import|from)\s*\(?\s*["'`]((?:\.{1,2}\/|\/_astro\/)[^"'`]+\.js)["'`]/g;

/** Los ficheros JS propios que pide una página: scripts, modulepreload, islas e imports en línea. */
export function scriptEntries(html: string): string[] {
  const entries = new Set<string>();
  for (const [, src] of html.matchAll(
    /(?:src|href|component-url|renderer-url)="(\/_astro\/[^"]+\.js)"/g,
  )) {
    entries.add(src!);
  }
  for (const [, src] of html.matchAll(/import\s*\(?\s*["'`](\/_astro\/[^"'`]+\.js)["'`]/g)) {
    entries.add(src!);
  }
  return [...entries].sort();
}

/** Los ficheros JS que importa un fichero compilado (estáticos y dinámicos), como rutas absolutas. */
export function jsImports(code: string, fromPath: string): string[] {
  const found = new Set<string>();
  for (const [, target] of code.matchAll(IMPORT)) {
    found.add(
      target!.startsWith('/')
        ? target!
        : path.posix.join(path.posix.dirname(fromPath), target!),
    );
  }
  return [...found];
}

/** Bytes de todo el JavaScript alcanzable desde `entries`. Cada fichero cuenta una vez. */
export function closureBytes(
  entries: readonly string[],
  read: (path: string) => string | undefined,
): number {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const pending = [...entries];
  let bytes = 0;
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = read(file);
    if (code === undefined) continue;
    bytes += encoder.encode(code).length;
    pending.push(...jsImports(code, file));
  }
  return bytes;
}
```

- [ ] **Paso 8: comprobar que pasa**

Run: `pnpm --filter web exec vitest run src/lib/seo/js-budget.test.ts`
Expected: PASS (5 tests).

- [ ] **Paso 9: test de las reglas básicas**

`web/src/lib/seo/audit.test.ts`. Las tareas siguientes añaden reglas, y con ellas `describe` a este fichero e imports a su primera línea.

```ts
import { describe, expect, it } from 'vitest';
import {
  auditSite,
  defaultRules,
  langMatchesUrl,
  oneH1,
  titleAndDescription,
  type AuditInput,
  type AuditPage,
} from './audit';
import type { PageFacts } from './page';

const SITE = 'https://backenddesdecero.com';

const facts = (overrides: Partial<PageFacts> = {}): PageFacts => ({
  lang: 'es',
  title: 'DNS | Backend desde cero',
  description: 'Una descripción',
  canonical: undefined,
  alternates: [],
  robots: undefined,
  ogImage: undefined,
  jsonLd: [],
  languageOptions: [],
  h1Count: 1,
  mermaidBlocks: 0,
  ...overrides,
});
const page = (url: string, overrides: Partial<PageFacts> = {}, jsBytes = 0): AuditPage => ({
  url,
  facts: facts(overrides),
  jsBytes,
});
const input = (pages: AuditPage[], overrides: Partial<AuditInput> = {}): AuditInput => ({
  site: SITE,
  pages,
  sitemap: undefined,
  robotsTxt: undefined,
  files: new Set(),
  ...overrides,
});

describe('oneH1', () => {
  it('una página con un <h1> pasa; con cero o con dos, no', () => {
    expect(oneH1(input([page('/')]))).toEqual([]);
    const issues = oneH1(input([page('/a/', { h1Count: 0 }), page('/b/', { h1Count: 2 })]));
    expect(issues.map((i) => i.url)).toEqual(['/a/', '/b/']);
  });
});

describe('titleAndDescription', () => {
  it('exige un título y una descripción no vacíos', () => {
    expect(titleAndDescription(input([page('/')]))).toEqual([]);
    const issues = titleAndDescription(
      input([page('/a/', { title: '' }), page('/b/', { description: undefined })]),
    );
    expect(issues.map((i) => i.url)).toEqual(['/a/', '/b/']);
  });
});

describe('langMatchesUrl', () => {
  it('lang="en" bajo /en/ y lang="es" en el resto', () => {
    const pages = [
      page('/'),
      page('/fase-0/que-es-dns/'),
      page('/en/', { lang: 'en' }),
      page('/en/phase-0/', { lang: 'en' }),
    ];
    expect(langMatchesUrl(input(pages))).toEqual([]);
    expect(langMatchesUrl(input([page('/en/roadmap/', { lang: 'es' })]))[0]?.message).toMatch(
      /debería ser "en"/,
    );
  });
});

describe('auditSite', () => {
  it('junta los problemas de las reglas que se le pasan', () => {
    const issues = auditSite(input([page('/', { h1Count: 2, description: undefined })]), [
      oneH1,
      titleAndDescription,
    ]);
    expect(issues.map((i) => i.rule).sort()).toEqual(['one-h1', 'title-description']);
  });

  it('defaultRules son las reglas de la web', () => {
    expect(defaultRules).toEqual([oneH1, titleAndDescription, langMatchesUrl]);
  });
});
```

- [ ] **Paso 10: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: FAIL, porque no encuentra `./audit`.

- [ ] **Paso 11: implementar las reglas**

`web/src/lib/seo/audit.ts`:

```ts
/**
 * Reglas de la auditoría SEO. Cada regla recibe el build entero y devuelve sus problemas; el build
 * falla si hay alguno (src/integrations/seo-audit.ts). Son funciones puras, con tests.
 */
import type { PageFacts } from './page';

export interface AuditPage {
  /** Ruta pública de la página: '/', '/fase-0/que-es-dns/'… */
  url: string;
  facts: PageFacts;
  /** JavaScript que puede descargar la página, en bytes. */
  jsBytes: number;
}

export interface AuditInput {
  /** Dominio de la web (`site` de Astro). */
  site: string;
  pages: AuditPage[];
  /** URLs del sitemap, o undefined si no hay sitemap. */
  sitemap: string[] | undefined;
  robotsTxt: string | undefined;
  /** Todos los ficheros del build, como rutas públicas ('/og/index.png'). */
  files: Set<string>;
}

export interface Issue {
  url: string;
  rule: string;
  message: string;
}

export type Rule = (input: AuditInput) => Issue[];

/** Una regla que mira cada página por separado: `check` devuelve el problema o undefined. */
function perPage(
  rule: string,
  check: (page: AuditPage, input: AuditInput) => string | undefined,
): Rule {
  return (input) =>
    input.pages.flatMap((page) => {
      const message = check(page, input);
      return message === undefined ? [] : [{ url: page.url, rule, message }];
    });
}

export const oneH1 = perPage('one-h1', ({ facts }) =>
  facts.h1Count === 1 ? undefined : `tiene ${facts.h1Count} <h1>; debe tener uno`,
);

export const titleAndDescription = perPage('title-description', ({ facts }) => {
  if (!facts.title) return 'no tiene <title>';
  if (!facts.description) return 'no tiene meta description';
  return undefined;
});

export const langMatchesUrl = perPage('lang', ({ url, facts }) => {
  const expected = url === '/en/' || url.startsWith('/en/') ? 'en' : 'es';
  return facts.lang === expected
    ? undefined
    : `lang="${facts.lang}", y por su URL debería ser "${expected}"`;
});

export const defaultRules: Rule[] = [oneH1, titleAndDescription, langMatchesUrl];

export function auditSite(input: AuditInput, rules: readonly Rule[] = defaultRules): Issue[] {
  return rules.flatMap((rule) => rule(input));
}
```

- [ ] **Paso 12: comprobar que pasa**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: PASS (5 tests).

- [ ] **Paso 13: la integración**

`web/src/integrations/seo-audit.ts`:

```ts
/**
 * Auditoría SEO del build: lee el HTML generado y hace fallar el build si algo de SEO se ha roto
 * (reglas en src/lib/seo/audit.ts). Va la ÚLTIMA en `integrations`: necesita el sitemap ya escrito.
 */
import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSite, type AuditPage } from '../lib/seo/audit';
import { closureBytes, scriptEntries } from '../lib/seo/js-budget';
import { parsePage } from '../lib/seo/page';

/** Todos los ficheros del build, como rutas públicas: '/fase-0/que-es-dns/index.html'. */
function listFiles(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map(
      (entry) =>
        '/' + path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    );
}

export function seoAudit(): AstroIntegration {
  let site = 'http://localhost';
  return {
    name: 'seo-audit',
    hooks: {
      'astro:config:done': ({ config }) => {
        // Sin `site` (antes de la Tarea 2), las reglas que comparan URLs absolutas dan un fallo
        // claro («canonical=…, y debería ser…») en lugar de romper con «Invalid URL».
        site = config.site ?? 'http://localhost';
      },
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = listFiles(root);
        const read = (file: string) => {
          const full = path.join(root, file);
          return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined;
        };
        const pages: AuditPage[] = files
          .filter((file) => file.endsWith('/index.html') && !file.startsWith('/pagefind/'))
          .map((file) => {
            const html = read(file)!;
            return {
              url: file.slice(0, -'index.html'.length),
              facts: parsePage(html),
              jsBytes: closureBytes(scriptEntries(html), read),
            };
          });
        const sitemapXml = read('/sitemap-0.xml');
        const issues = auditSite({
          site,
          pages,
          files: new Set(files),
          robotsTxt: read('/robots.txt'),
          sitemap:
            sitemapXml === undefined
              ? undefined
              : [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc!),
        });

        const heaviest = pages.reduce<AuditPage | undefined>(
          (max, page) => (max === undefined || page.jsBytes > max.jsBytes ? page : max),
          undefined,
        );
        if (heaviest) {
          logger.info(
            `JavaScript más pesado: ${Math.round(heaviest.jsBytes / 1024)} KB, en ${heaviest.url}`,
          );
        }
        if (issues.length > 0) {
          for (const issue of issues) logger.error(`${issue.url} [${issue.rule}] ${issue.message}`);
          throw new Error(
            `[seo-audit] ${issues.length} problemas de SEO: el build falla para que no se publiquen.`,
          );
        }
        logger.info(`${pages.length} páginas auditadas, sin problemas.`);
      },
    },
  };
}
```

En `web/astro.config.ts`, importa la integración y añádela la **última** del array `integrations`, después de `react()`:

```ts
import { seoAudit } from './src/integrations/seo-audit';
```

```ts
    // Los playgrounds (src/playgrounds/) son islas de React.
    react(),
    // La última: audita el build ya terminado (sitemap incluido) y lo hace fallar si algo de SEO se rompe.
    seoAudit(),
  ],
```

- [ ] **Paso 14: build**

Run: `pnpm build`
Expected: el build termina. El log incluye:
- `[seo-audit] JavaScript más pesado: …`, con unos 3.600 KB en una lección con laboratorio, por Mermaid;
- `[seo-audit] 24 páginas auditadas, sin problemas.`

La lección de protocolos ya no cuenta dos `<h1>`.

- [ ] **Paso 15: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected:
- **tests:** los 238 de antes, más los nuevos, todos en verde;
- **tipos:** 0 errores;
- **formato:** todo con el estilo de Prettier (si no, `pnpm format` y repetir).

Sin commit.

---

### Tarea 2: Dominio, sitemap, canónicas y `robots.txt`

**Ficheros:**
- Crear: `web/src/data/site.ts` y `web/public/robots.txt`
- Modificar: `web/astro.config.ts`, `web/package.json` (dependencia), `web/src/lib/seo/audit.ts` y `web/src/lib/seo/audit.test.ts`

**Interfaces:**
- Consume: `AuditInput`, `perPage` y `defaultRules`, de la Tarea 1.
- Produce:
  - `siteUrl` y `siteTitle` (`src/data/site.ts`);
  - las reglas `canonicalIsSelf`, `sitemapMatchesPages` y `robotsTxtPointsToSitemap`;
  - el sitemap en `/sitemap-index.xml`.

- [ ] **Paso 1: tests de las reglas nuevas**

Añade a los imports de `audit.test.ts` `canonicalIsSelf`, `robotsTxtPointsToSitemap` y `sitemapMatchesPages`, y estos bloques:

```ts
describe('canonicalIsSelf', () => {
  it('la canónica es la URL absoluta de la propia página', () => {
    expect(canonicalIsSelf(input([page('/fase-0/', { canonical: `${SITE}/fase-0/` })]))).toEqual([]);
    const issues = canonicalIsSelf(
      input([page('/fase-0/', { canonical: undefined }), page('/en/', { canonical: `${SITE}/` })]),
    );
    expect(issues.map((i) => i.url)).toEqual(['/fase-0/', '/en/']);
  });
});

describe('sitemapMatchesPages', () => {
  const pages = [page('/'), page('/en/')];

  it('el sitemap lista exactamente las páginas del build', () => {
    expect(sitemapMatchesPages(input(pages, { sitemap: [`${SITE}/`, `${SITE}/en/`] }))).toEqual([]);
  });

  it('avisa de las páginas que faltan y de las URLs que sobran', () => {
    const issues = sitemapMatchesPages(
      input(pages, { sitemap: [`${SITE}/`, `${SITE}/en/fase-0/`] }),
    );
    expect(issues.map((i) => [i.url, i.message])).toEqual([
      ['/en/', 'falta en el sitemap'],
      ['/en/fase-0/', 'está en el sitemap, pero no es una página del build'],
    ]);
  });

  it('sin sitemap es un problema', () => {
    expect(sitemapMatchesPages(input(pages))[0]?.message).toBe('no hay sitemap');
  });
});

describe('robotsTxtPointsToSitemap', () => {
  const ok = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap-index.xml\n`;

  it('robots.txt existe, apunta al sitemap y no bloquea la web', () => {
    expect(robotsTxtPointsToSitemap(input([], { robotsTxt: ok }))).toEqual([]);
    expect(robotsTxtPointsToSitemap(input([]))[0]?.message).toBe('no existe');
    expect(
      robotsTxtPointsToSitemap(input([], { robotsTxt: 'User-agent: *\nAllow: /\n' }))[0]?.message,
    ).toMatch(/le falta la línea/);
    expect(
      robotsTxtPointsToSitemap(input([], { robotsTxt: `${ok}Disallow: /\n` }))[0]?.message,
    ).toMatch(/bloquea toda la web/);
  });
});
```

Y cambia la expectativa de `defaultRules`:

```ts
    expect(defaultRules).toEqual([
      oneH1,
      titleAndDescription,
      langMatchesUrl,
      canonicalIsSelf,
      sitemapMatchesPages,
      robotsTxtPointsToSitemap,
    ]);
```

- [ ] **Paso 2: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: FAIL. Las tres reglas no existen: `canonicalIsSelf is not a function`.

- [ ] **Paso 3: implementar las reglas**

En `audit.ts`, antes de `defaultRules`:

```ts
export const canonicalIsSelf = perPage('canonical', ({ url, facts }, { site }) => {
  const expected = new URL(url, site).href;
  return facts.canonical === expected
    ? undefined
    : `canonical="${facts.canonical}", y debería ser ${expected}`;
});

export const sitemapMatchesPages: Rule = ({ site, pages, sitemap }) => {
  if (sitemap === undefined) return [{ url: '/sitemap-0.xml', rule: 'sitemap', message: 'no hay sitemap' }];
  const pageUrls = new Set(pages.map((p) => new URL(p.url, site).href));
  const listed = new Set(sitemap);
  return [
    ...[...pageUrls]
      .filter((u) => !listed.has(u))
      .map((u) => ({ url: new URL(u).pathname, rule: 'sitemap', message: 'falta en el sitemap' })),
    ...sitemap
      .filter((u) => !pageUrls.has(u))
      .map((u) => ({
        url: new URL(u).pathname,
        rule: 'sitemap',
        message: 'está en el sitemap, pero no es una página del build',
      })),
  ];
};

export const robotsTxtPointsToSitemap: Rule = ({ site, robotsTxt }) => {
  const issue = (message: string) => [{ url: '/robots.txt', rule: 'robots', message }];
  if (robotsTxt === undefined) return issue('no existe');
  const line = `Sitemap: ${new URL('/sitemap-index.xml', site).href}`;
  if (!robotsTxt.split('\n').some((l) => l.trim() === line)) return issue(`le falta la línea «${line}»`);
  if (/^Disallow:\s*\/\s*$/m.test(robotsTxt)) return issue('bloquea toda la web (Disallow: /)');
  return [];
};
```

Y `defaultRules`:

```ts
export const defaultRules: Rule[] = [
  oneH1,
  titleAndDescription,
  langMatchesUrl,
  canonicalIsSelf,
  sitemapMatchesPages,
  robotsTxtPointsToSitemap,
];
```

- [ ] **Paso 4: comprobar que pasa**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: PASS.

- [ ] **Paso 5: comprobar que el build falla con las reglas nuevas**

Run: `pnpm build`
Expected: FAIL. Hay errores `[canonical]` en las 24 páginas, y otros que dicen «no hay sitemap» y que `robots.txt` «no existe».

- [ ] **Paso 6: dominio, sitemap y `robots.txt`**

Run: `pnpm --filter web add @astrojs/sitemap@^3.7.4`

`web/src/data/site.ts`:

```ts
/** Dirección pública de la web, sin barra final. También está en public/robots.txt. */
export const siteUrl = 'https://backenddesdecero.com';

/** Nombre de la web en cada idioma. */
export const siteTitle = { es: 'Backend desde cero', en: 'Backend from Scratch' };
```

`web/public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://backenddesdecero.com/sitemap-index.xml
```

En `web/astro.config.ts`:
- importa `sitemap` y `siteTitle`/`siteUrl`;
- añade `site`;
- usa `siteTitle` como título;
- pon `sitemap()` justo antes de `seoAudit()`.

```ts
import sitemap from '@astrojs/sitemap';
import { siteTitle, siteUrl } from './src/data/site';
```

```ts
export default defineConfig({
  // Con `site`, Starlight genera la URL canónica, los hreflang y el og:url de cada página.
  site: siteUrl,
  integrations: [
```

```ts
      title: siteTitle,
```

```ts
    react(),
    // Sitemap propio (Starlight no añade el suyo si ya hay uno): la Tarea 3 le pone un filtro.
    sitemap(),
    seoAudit(),
```

- [ ] **Paso 7: comprobar que el build pasa**

Run: `pnpm build`
Expected:
- `[seo-audit] 24 páginas auditadas, sin problemas.`;
- `web/dist/sitemap-index.xml` existe, y `web/dist/sitemap-0.xml` tiene 24 `<loc>`;
- `grep -c 'rel="canonical"' web/dist/es/phase-0/dns/index.html` → `1`.

- [ ] **Paso 8: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 3: Índice de traducciones, middleware, selector de idioma y copias de respaldo

Esta tarea monta el mecanismo, y la Tarea 4 cambia las rutas. Hasta entonces, cada página tiene la misma ruta en los dos idiomas: el middleware no cambia nada visible y no hay copias de respaldo. Las reglas de la auditoría se prueban con tests unitarios aquí, y la Tarea 4 las pone a prueba en el build.

**Ficheros:**
- Crear:
  - `web/src/lib/translations.ts` (+ `.test.ts`) y `web/src/lib/translations-astro.ts`;
  - `web/src/lib/route-fixes.ts` (+ `.test.ts`) y `web/src/routeData.ts`;
  - `web/src/components/overrides/LanguageSelect.astro` y `web/src/integrations/drop-fallbacks.ts`.
- Modificar: `web/src/content.config.ts`, `web/src/lib/locales.ts` (+ test), `web/astro.config.ts` y `web/src/lib/seo/audit.ts` (+ test).

**Interfaces:**
- Consume: `localizedHref(locale, slug?)` (`src/lib/links.ts`) y `locales`/`Locale` (`src/lib/locales.ts`).
- Produce:
  - **`src/lib/translations.ts`:** `normalizeId`, `localeOfId`, `urlOfId`, `translationKeyOf`, `buildTranslationIndex`, `translationsOf`, `idFromContentPath` y `fallbackUrls`, y los tipos `DocRef` y `TranslationIndex` (`{ byKey: Map<string, Partial<Record<Locale, string>>>; keyById: Map<string, string> }`, con ids normalizados);
  - **`src/lib/translations-astro.ts`:** `getTranslationIndex(): Promise<TranslationIndex>`;
  - **`src/lib/route-fixes.ts`:** `pruneSidebar`, `paginationFrom`, `alternateLinks` y `languageTargets`;
  - **`src/lib/locales.ts`:** `localeLabels`;
  - **auditoría:** las reglas `hreflangReciprocal`, `noFallbackCopies` y `languageSelectorMatchesHreflang`.

- [ ] **Paso 1: tests del índice de traducciones**

`web/src/lib/translations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildTranslationIndex,
  fallbackUrls,
  idFromContentPath,
  localeOfId,
  normalizeId,
  translationKeyOf,
  translationsOf,
  urlOfId,
} from './translations';

describe('normalizeId, localeOfId y urlOfId', () => {
  it('la portada en español llega como "index" o como "" y vive en /', () => {
    expect(normalizeId('index')).toBe('');
    expect(urlOfId('index')).toBe('/');
    expect(urlOfId('')).toBe('/');
    expect(localeOfId('')).toBe('es');
  });

  it('el inglés vive en la carpeta en/', () => {
    expect(localeOfId('en')).toBe('en');
    expect(localeOfId('en/phase-0/what-is-dns')).toBe('en');
    expect(urlOfId('en')).toBe('/en/');
    expect(urlOfId('en/phase-0/what-is-dns')).toBe('/en/phase-0/what-is-dns/');
  });

  it('el español puede ir en la raíz o, como hasta ahora, en es/', () => {
    expect(localeOfId('fase-0/que-es-dns')).toBe('es');
    expect(localeOfId('es/phase-0/dns')).toBe('es');
    expect(urlOfId('fase-0/que-es-dns')).toBe('/fase-0/que-es-dns/');
  });

  it('una página española cuya ruta empieza por «en» sigue siendo española', () => {
    expect(localeOfId('enlaces')).toBe('es');
  });
});

describe('translationKeyOf', () => {
  it('usa translationKey si la hay', () => {
    expect(translationKeyOf({ id: 'fase-0/que-es-dns', translationKey: 'dns' })).toBe('dns');
  });

  it('si no, la ruta sin el prefijo de idioma', () => {
    expect(translationKeyOf({ id: 'en/roadmap' })).toBe('roadmap');
    expect(translationKeyOf({ id: 'roadmap' })).toBe('roadmap');
    expect(translationKeyOf({ id: 'es/roadmap' })).toBe('roadmap');
    expect(translationKeyOf({ id: 'index' })).toBe('');
    expect(translationKeyOf({ id: 'en' })).toBe('');
  });
});

describe('buildTranslationIndex y translationsOf', () => {
  const index = buildTranslationIndex([
    { id: 'index' },
    { id: 'en' },
    { id: 'fase-0/que-es-dns', translationKey: 'dns' },
    { id: 'en/phase-0/what-is-dns', translationKey: 'dns' },
    { id: 'fase-1/solo-en-espanol', translationKey: 'solo' },
  ]);

  it('une cada página con su traducción aunque las rutas no se parezcan', () => {
    const both = { es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' };
    expect(translationsOf(index, 'fase-0/que-es-dns')).toEqual(both);
    expect(translationsOf(index, 'en/phase-0/what-is-dns')).toEqual(both);
  });

  it('une las portadas, venga el id como "index" o como ""', () => {
    expect(translationsOf(index, '')).toEqual({ es: '/', en: '/en/' });
    expect(translationsOf(index, 'index')).toEqual({ es: '/', en: '/en/' });
  });

  it('una página sin traducir solo tiene su idioma', () => {
    expect(translationsOf(index, 'fase-1/solo-en-espanol')).toEqual({
      es: '/fase-1/solo-en-espanol/',
    });
  });

  it('una página que no existe no tiene traducciones', () => {
    expect(translationsOf(index, 'no-existe')).toEqual({});
  });

  it('dos páginas del mismo idioma con la misma clave hacen fallar el build, y se nombran las dos', () => {
    expect(() =>
      buildTranslationIndex([
        { id: 'fase-0/a', translationKey: 'x' },
        { id: 'fase-0/b', translationKey: 'x' },
      ]),
    ).toThrow(/"fase-0\/a" y "fase-0\/b"/);
  });
});

describe('idFromContentPath', () => {
  it('quita la extensión y el /index final, como Astro', () => {
    expect(idFromContentPath('index.mdx')).toBe('index');
    expect(idFromContentPath('en/index.mdx')).toBe('en');
    expect(idFromContentPath('fase-0/index.mdx')).toBe('fase-0');
    expect(idFromContentPath('fase-0/que-es-dns.mdx')).toBe('fase-0/que-es-dns');
    expect(idFromContentPath('roadmap.md')).toBe('roadmap');
  });
});

describe('fallbackUrls', () => {
  it('con el español en es/, solo las páginas que no tienen la misma ruta en inglés', () => {
    expect(
      fallbackUrls(['es', 'en', 'es/phase-0/dns', 'en/phase-0/dns', 'es/phase-1/shell']),
    ).toEqual(['/en/phase-1/shell/']);
  });

  it('con el español en la raíz y rutas traducidas, cada página española de una fase tiene copia', () => {
    expect(
      fallbackUrls([
        'index',
        'en',
        'roadmap',
        'en/roadmap',
        'fase-0',
        'fase-0/que-es-dns',
        'en/phase-0',
        'en/phase-0/what-is-dns',
      ]),
    ).toEqual(['/en/fase-0/', '/en/fase-0/que-es-dns/']);
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/translations.test.ts`
Expected: FAIL, porque no encuentra `./translations`.

- [ ] **Paso 3: implementar el índice**

`web/src/lib/translations.ts`:

```ts
/**
 * Índice de traducciones: une cada página con su traducción aunque sus rutas sean distintas
 * (/fase-0/que-es-dns/ ↔ /en/phase-0/what-is-dns/). Starlight no sabe hacerlo: deduce la traducción
 * cambiando el prefijo de idioma de la URL. Lógica pura; src/lib/translations-astro.ts la alimenta
 * con la colección de contenido.
 */
import type { Locale } from './locales';

export interface DocRef {
  id: string;
  translationKey?: string | undefined;
}

export interface TranslationIndex {
  /** Clave de traducción → id de la página en cada idioma. */
  byKey: Map<string, Partial<Record<Locale, string>>>;
  /** Id de cada página → su clave. */
  keyById: Map<string, string>;
}

/** Astro llama "index" a la portada de la raíz y Starlight la normaliza a "". Aquí siempre es "". */
export function normalizeId(id: string): string {
  return id === 'index' ? '' : id;
}

/** El inglés vive en la carpeta en/; todo lo demás es español (en la raíz o, antes, en es/). */
export function localeOfId(id: string): Locale {
  return normalizeId(id).split('/')[0] === 'en' ? 'en' : 'es';
}

/** La URL pública de una página: '' → '/', 'fase-0/que-es-dns' → '/fase-0/que-es-dns/'. */
export function urlOfId(id: string): string {
  const clean = normalizeId(id);
  return clean ? `/${clean}/` : '/';
}

/** La clave que une la página con su traducción: translationKey o, si no hay, su ruta sin idioma. */
export function translationKeyOf(doc: DocRef): string {
  return doc.translationKey ?? normalizeId(doc.id).replace(/^(?:es|en)(?:\/|$)/, '');
}

export function buildTranslationIndex(docs: readonly DocRef[]): TranslationIndex {
  const byKey = new Map<string, Partial<Record<Locale, string>>>();
  const keyById = new Map<string, string>();
  for (const doc of docs) {
    const id = normalizeId(doc.id);
    const key = translationKeyOf(doc);
    const locale = localeOfId(id);
    const pair = byKey.get(key) ?? {};
    const other = pair[locale];
    if (other !== undefined) {
      throw new Error(
        `[translations] "${other}" y "${id}" tienen la misma clave de traducción ("${key}") en el mismo idioma. Cambia la translationKey de una de las dos.`,
      );
    }
    pair[locale] = id;
    byKey.set(key, pair);
    keyById.set(id, key);
  }
  return { byKey, keyById };
}

/** Las URLs de la página `id` en cada idioma en que existe. */
export function translationsOf(
  index: TranslationIndex,
  id: string,
): Partial<Record<Locale, string>> {
  const key = index.keyById.get(normalizeId(id));
  const pair = key === undefined ? {} : (index.byKey.get(key) ?? {});
  return Object.fromEntries(
    Object.entries(pair).map(([locale, pageId]) => [locale, urlOfId(pageId)]),
  );
}

/** El id que Astro da a un fichero de src/content/docs: sin extensión y sin el /index final. */
export function idFromContentPath(relativePath: string): string {
  const id = relativePath.replace(/\.mdx?$/, '');
  return id === 'index' ? id : id.replace(/\/index$/, '');
}

/**
 * Las copias de respaldo que genera Starlight: para cada página en español, una en /en/ con la misma
 * ruta si en inglés no existe esa ruta. Con rutas traducidas, Starlight no sabe que la traducción
 * existe con otra ruta, y habría una copia por lección.
 */
export function fallbackUrls(ids: readonly string[]): string[] {
  const existing = new Set(ids.map(normalizeId));
  return [...existing]
    .filter((id) => localeOfId(id) === 'es')
    .map((id) => {
      const rest = id.replace(/^es(?:\/|$)/, '');
      return rest ? `en/${rest}` : 'en';
    })
    .filter((englishId) => !existing.has(englishId))
    .map(urlOfId);
}
```

- [ ] **Paso 4: comprobar que pasa**

Run: `pnpm --filter web exec vitest run src/lib/translations.test.ts`
Expected: PASS (14 tests).

- [ ] **Paso 5: tests de las correcciones de ruta y de `localeLabels`**

`web/src/lib/route-fixes.test.ts`:

```ts
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { describe, expect, it } from 'vitest';
import { alternateLinks, languageTargets, paginationFrom, pruneSidebar } from './route-fixes';

type SidebarEntry = StarlightRouteData['sidebar'][number];
const link = (href: string, isCurrent = false) =>
  ({ type: 'link', label: href, href, isCurrent, badge: undefined, attrs: {} }) as SidebarEntry;
const group = (label: string, entries: SidebarEntry[]) =>
  ({ type: 'group', label, entries, collapsed: false, badge: undefined }) as SidebarEntry;
const SITE = 'https://backenddesdecero.com/';

describe('pruneSidebar', () => {
  it('quita los enlaces a páginas que no existen de verdad (las copias de respaldo)', () => {
    const sidebar = [
      link('/en/roadmap/'),
      group('Phase 0', [
        link('/en/fase-0/'),
        link('/en/fase-0/que-es-dns/'),
        link('/en/phase-0/'),
        link('/en/phase-0/what-is-dns/', true),
      ]),
    ];
    const real = new Set(['/en/roadmap/', '/en/phase-0/', '/en/phase-0/what-is-dns/']);
    expect(pruneSidebar(sidebar, (href) => real.has(href))).toEqual([
      link('/en/roadmap/'),
      group('Phase 0', [link('/en/phase-0/'), link('/en/phase-0/what-is-dns/', true)]),
    ]);
  });

  it('quita los grupos que se quedan vacíos', () => {
    expect(pruneSidebar([group('Phase 1', [link('/en/fase-1/')])], () => false)).toEqual([]);
  });
});

describe('paginationFrom', () => {
  it('anterior y siguiente según el orden del sidebar, atravesando grupos', () => {
    const sidebar = [
      link('/roadmap/'),
      group('Fase 0', [link('/fase-0/'), link('/fase-0/que-es-dns/', true), link('/fase-0/tls-y-https/')]),
    ];
    const pagination = paginationFrom(sidebar);
    expect(pagination?.prev?.href).toBe('/fase-0/');
    expect(pagination?.next?.href).toBe('/fase-0/tls-y-https/');
  });

  it('la primera página no tiene anterior, y la última no tiene siguiente', () => {
    expect(paginationFrom([link('/a/', true), link('/b/')])?.prev).toBeUndefined();
    expect(paginationFrom([link('/a/'), link('/b/', true)])?.next).toBeUndefined();
  });

  it('si la página actual no está en el sidebar, devuelve undefined', () => {
    expect(paginationFrom([link('/roadmap/')])).toBeUndefined();
  });
});

describe('alternateLinks', () => {
  it('un hreflang por idioma y x-default al español, con URLs absolutas', () => {
    expect(
      alternateLinks({ es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' }, SITE),
    ).toEqual([
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'es', href: `${SITE}fase-0/que-es-dns/` } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'en', href: `${SITE}en/phase-0/what-is-dns/` } },
      { tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: `${SITE}fase-0/que-es-dns/` } },
    ]);
  });

  it('una página sin traducir no lleva hreflang', () => {
    expect(alternateLinks({ es: '/fase-1/x/' }, SITE)).toEqual([]);
  });
});

describe('languageTargets', () => {
  it('lleva a la traducción de la página', () => {
    expect(languageTargets({ es: '/fase-0/que-es-dns/', en: '/en/phase-0/what-is-dns/' })).toEqual({
      es: '/fase-0/que-es-dns/',
      en: '/en/phase-0/what-is-dns/',
    });
  });

  it('sin traducción, lleva a la portada de ese idioma', () => {
    expect(languageTargets({ es: '/fase-1/x/' }).en).toBe('/en/');
  });
});
```

En `web/src/lib/locales.test.ts`, añade `localeLabels` y `locales` al import y este bloque:

```ts
describe('localeLabels', () => {
  it('cada idioma tiene su nombre para el selector', () => {
    expect(Object.keys(localeLabels)).toEqual([...locales]);
  });
});
```

- [ ] **Paso 6: comprobar que fallan**

Run: `pnpm --filter web exec vitest run src/lib/route-fixes.test.ts src/lib/locales.test.ts`
Expected: FAIL, porque no encuentra `./route-fixes` y `localeLabels` es `undefined`.

- [ ] **Paso 7: implementar las correcciones y `localeLabels`**

En `web/src/lib/locales.ts`, después de `defaultLocale`:

```ts
/** Nombre de cada idioma en el selector de idioma. */
export const localeLabels: Record<Locale, string> = { es: 'Español', en: 'English' };
```

`web/src/lib/route-fixes.ts`:

```ts
/**
 * Correcciones puras de lo que Starlight deduce suponiendo que una traducción tiene la misma ruta
 * con otro prefijo de idioma. Las aplica src/routeData.ts.
 */
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { localizedHref } from './links';
import { locales, type Locale } from './locales';

type SidebarEntry = StarlightRouteData['sidebar'][number];
type SidebarLink = Extract<SidebarEntry, { type: 'link' }>;
type HeadEntry = StarlightRouteData['head'][number];

/** Quita del sidebar los enlaces que no cumplen `keep` y los grupos que se quedan vacíos. */
export function pruneSidebar(
  entries: readonly SidebarEntry[],
  keep: (href: string) => boolean,
): SidebarEntry[] {
  return entries.flatMap((entry): SidebarEntry[] => {
    if (entry.type === 'link') return keep(entry.href) ? [entry] : [];
    const children = pruneSidebar(entry.entries, keep);
    return children.length > 0 ? [{ ...entry, entries: children }] : [];
  });
}

function flatten(entries: readonly SidebarEntry[]): SidebarLink[] {
  return entries.flatMap((entry) => (entry.type === 'link' ? [entry] : flatten(entry.entries)));
}

/** Anterior y siguiente según el orden del sidebar, o undefined si la página no está en él. */
export function paginationFrom(
  entries: readonly SidebarEntry[],
): StarlightRouteData['pagination'] | undefined {
  const links = flatten(entries);
  const index = links.findIndex((link) => link.isCurrent);
  return index === -1 ? undefined : { prev: links[index - 1], next: links[index + 1] };
}

/** Los hreflang de una página que existe en varios idiomas; x-default apunta al español. */
export function alternateLinks(urls: Partial<Record<Locale, string>>, site: string): HeadEntry[] {
  const present = locales.filter((locale) => urls[locale] !== undefined);
  if (present.length < 2) return [];
  const link = (hreflang: string, url: string): HeadEntry => ({
    tag: 'link',
    attrs: { rel: 'alternate', hreflang, href: new URL(url, site).href },
  });
  return [
    ...present.map((locale) => link(locale, urls[locale]!)),
    ...(urls.es === undefined ? [] : [link('x-default', urls.es)]),
  ];
}

/** A dónde lleva el selector de idioma: a la traducción o, si no la hay, a la portada del idioma. */
export function languageTargets(urls: Partial<Record<Locale, string>>): Record<Locale, string> {
  return Object.fromEntries(
    locales.map((locale) => [locale, urls[locale] ?? localizedHref(locale)]),
  ) as Record<Locale, string>;
}
```

- [ ] **Paso 8: comprobar que pasan**

Run: `pnpm --filter web exec vitest run src/lib/route-fixes.test.ts src/lib/locales.test.ts`
Expected: PASS.

- [ ] **Paso 9: tests de las reglas de traducción**

Añade a los imports de `audit.test.ts` `hreflangReciprocal`, `languageSelectorMatchesHreflang` y `noFallbackCopies`, y estos bloques:

```ts
describe('hreflangReciprocal', () => {
  const es = `${SITE}/fase-0/que-es-dns/`;
  const en = `${SITE}/en/phase-0/what-is-dns/`;
  const pair = [
    { hreflang: 'es', href: es },
    { hreflang: 'en', href: en },
    { hreflang: 'x-default', href: es },
  ];

  it('pasa si las dos páginas se declaran mutuamente, con x-default', () => {
    const pages = [
      page('/fase-0/que-es-dns/', { alternates: pair }),
      page('/en/phase-0/what-is-dns/', { lang: 'en', alternates: pair }),
    ];
    expect(hreflangReciprocal(input(pages))).toEqual([]);
  });

  it('una página sin hreflang no se comprueba', () => {
    expect(hreflangReciprocal(input([page('/fase-1/x/')]))).toEqual([]);
  });

  it('avisa si apunta a una página que no existe (la misma ruta con otro prefijo)', () => {
    const wrong = [
      { hreflang: 'es', href: es },
      { hreflang: 'en', href: `${SITE}/en/fase-0/que-es-dns/` },
      { hreflang: 'x-default', href: es },
    ];
    const issues = hreflangReciprocal(input([page('/fase-0/que-es-dns/', { alternates: wrong })]));
    expect(issues.map((i) => i.message)).toEqual([
      `en apunta a ${SITE}/en/fase-0/que-es-dns/, que no es una página del build`,
    ]);
  });

  it('avisa si no se incluye a sí misma, si falta x-default o si la otra no la declara de vuelta', () => {
    const pages = [
      page('/fase-0/que-es-dns/', { alternates: [{ hreflang: 'en', href: en }] }),
      page('/en/phase-0/what-is-dns/', { lang: 'en' }),
    ];
    expect(hreflangReciprocal(input(pages)).map((i) => i.message)).toEqual([
      'no se incluye a sí misma',
      'no tiene x-default',
      `${en} no la declara de vuelta`,
    ]);
  });
});

describe('noFallbackCopies', () => {
  it('ninguna página del build lleva noindex: las copias de respaldo se borran', () => {
    expect(noFallbackCopies(input([page('/')]))).toEqual([]);
    expect(noFallbackCopies(input([page('/en/fase-0/', { robots: 'noindex' })]))[0]?.url).toBe(
      '/en/fase-0/',
    );
  });
});

describe('languageSelectorMatchesHreflang', () => {
  const alternates = [
    { hreflang: 'es', href: `${SITE}/fase-0/que-es-dns/` },
    { hreflang: 'en', href: `${SITE}/en/phase-0/what-is-dns/` },
    { hreflang: 'x-default', href: `${SITE}/fase-0/que-es-dns/` },
  ];

  it('el selector lleva a las mismas páginas que los hreflang', () => {
    const ok = page('/fase-0/que-es-dns/', {
      alternates,
      languageOptions: ['/fase-0/que-es-dns/', '/en/phase-0/what-is-dns/'],
    });
    expect(languageSelectorMatchesHreflang(input([ok]))).toEqual([]);
  });

  it('avisa si el selector lleva a la misma ruta con otro prefijo', () => {
    const wrong = page('/fase-0/que-es-dns/', {
      alternates,
      languageOptions: ['/fase-0/que-es-dns/', '/en/fase-0/que-es-dns/'],
    });
    expect(languageSelectorMatchesHreflang(input([wrong]))[0]?.message).toBe(
      'el selector de idioma no lleva a /en/phase-0/what-is-dns/',
    );
  });
});
```

Y la expectativa de `defaultRules` pasa a terminar en `…, robotsTxtPointsToSitemap, hreflangReciprocal, noFallbackCopies, languageSelectorMatchesHreflang]`.

- [ ] **Paso 10: comprobar que falla**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: FAIL, con `hreflangReciprocal is not a function`.

- [ ] **Paso 11: implementar las reglas**

En `audit.ts`:

```ts
/** Si una página declara hreflang: se incluye a sí misma, tiene x-default, y cada alternativa existe y la declara de vuelta. */
export const hreflangReciprocal: Rule = ({ site, pages }) => {
  const byHref = new Map(pages.map((p) => [new URL(p.url, site).href, p]));
  return pages.flatMap((page) => {
    const alternates = page.facts.alternates;
    if (alternates.length === 0) return [];
    const self = new URL(page.url, site).href;
    const problems: string[] = [];
    if (!alternates.some((a) => a.href === self && a.hreflang === page.facts.lang)) {
      problems.push('no se incluye a sí misma');
    }
    if (!alternates.some((a) => a.hreflang === 'x-default')) problems.push('no tiene x-default');
    for (const alternate of alternates) {
      const target = byHref.get(alternate.href);
      if (target === undefined) {
        problems.push(`${alternate.hreflang} apunta a ${alternate.href}, que no es una página del build`);
      } else if (!target.facts.alternates.some((a) => a.href === self)) {
        problems.push(`${alternate.href} no la declara de vuelta`);
      }
    }
    return problems.map((message) => ({ url: page.url, rule: 'hreflang', message }));
  });
};

export const noFallbackCopies = perPage('fallback', ({ facts }) =>
  facts.robots?.includes('noindex')
    ? 'es una copia de respaldo (noindex) y no debería estar en el build'
    : undefined,
);

export const languageSelectorMatchesHreflang = perPage('language-select', ({ facts }) => {
  const missing = facts.alternates
    .filter((a) => a.hreflang !== 'x-default')
    .map((a) => new URL(a.href).pathname)
    .filter((pathname) => !facts.languageOptions.includes(pathname));
  return missing.length > 0 ? `el selector de idioma no lleva a ${missing.join(', ')}` : undefined;
});
```

Y añade las tres al final de `defaultRules`.

- [ ] **Paso 12: comprobar que pasa**

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: PASS.

- [ ] **Paso 13: el esquema, el índice con la colección, el middleware y el selector**

En `web/src/content.config.ts`, dentro de `extend: z.object({`, antes de `lesson`:

```ts
        // Une la página con su traducción cuando sus rutas difieren (/fase-0/que-es-dns ↔
        // /en/phase-0/what-is-dns). Es la misma en los dos idiomas. Ver src/lib/translations.ts.
        translationKey: z.string().optional(),
```

`web/src/lib/translations-astro.ts`:

```ts
import { getCollection } from 'astro:content';
import { buildTranslationIndex, type TranslationIndex } from './translations';

let index: Promise<TranslationIndex> | undefined;

/** El índice de traducciones de todo el contenido. Se calcula una vez por build. */
export function getTranslationIndex(): Promise<TranslationIndex> {
  index ??= getCollection('docs').then((docs) =>
    buildTranslationIndex(
      docs.map((doc) => ({ id: doc.id, translationKey: doc.data.translationKey })),
    ),
  );
  return index;
}
```

`web/src/routeData.ts`:

```ts
/**
 * Starlight deduce las traducciones cambiando el prefijo de idioma de la URL. Con rutas traducidas
 * (/fase-0/que-es-dns/ ↔ /en/phase-0/what-is-dns/) eso falla, y aquí se corrige con el índice de
 * traducciones: el sidebar, la paginación, los hreflang y las copias de respaldo.
 */
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { alternateLinks, paginationFrom, pruneSidebar } from './lib/route-fixes';
import { translationsOf, urlOfId } from './lib/translations';
import { getTranslationIndex } from './lib/translations-astro';

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  const index = await getTranslationIndex();
  const realUrls = new Set([...index.keyById.keys()].map(urlOfId));

  // En inglés, el sidebar incluye las copias de respaldo de las páginas en español: fuera.
  route.sidebar = pruneSidebar(route.sidebar, (href) => realUrls.has(href));
  // Starlight calculó la paginación con el sidebar sin limpiar.
  const pagination = paginationFrom(route.sidebar);
  if (pagination) route.pagination = pagination;

  route.head = route.head.filter(
    (entry) =>
      !(entry.tag === 'link' && entry.attrs?.rel === 'alternate' && entry.attrs.hreflang !== undefined),
  );
  if (route.isFallback) {
    // El build borra estas copias (src/integrations/drop-fallbacks.ts). Si alguna se escapa, que no se indexe.
    route.head.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex' } });
    return;
  }
  if (!context.site) return;
  route.head.push(...alternateLinks(translationsOf(index, route.entry.id), context.site.href));
});
```

`web/src/components/overrides/LanguageSelect.astro`:

```astro
---
/**
 * Selector de idioma. Sustituye al de Starlight, que lleva a la misma ruta con otro prefijo de
 * idioma: con rutas traducidas, esa página no existe. Este lleva a la traducción real o, si la
 * página no está traducida, a la portada de ese idioma.
 */
import Select from '@astrojs/starlight/components/Select.astro';
import { localeLabels, locales, toLocale } from '~/lib/locales';
import { languageTargets } from '~/lib/route-fixes';
import { translationsOf } from '~/lib/translations';
import { getTranslationIndex } from '~/lib/translations-astro';

const route = Astro.locals.starlightRoute;
const current = toLocale(route.locale);
const targets = languageTargets(translationsOf(await getTranslationIndex(), route.entry.id));
const options = locales.map((locale) => ({
  value: targets[locale],
  selected: locale === current,
  label: localeLabels[locale],
}));
---

<starlight-lang-select>
  <Select
    icon="translate"
    label={Astro.locals.t('languageSelect.accessibleLabel')}
    options={options}
    width="7em"
  />
</starlight-lang-select>

<script>
  // El mismo comportamiento que el selector de Starlight.
  class StarlightLanguageSelect extends HTMLElement {
    constructor() {
      super();
      const select = this.querySelector('select');
      if (!select) return;
      select.addEventListener('change', (e) => {
        if (e.currentTarget instanceof HTMLSelectElement) {
          window.location.pathname = e.currentTarget.value;
        }
      });
      // Si la página vuelve de la caché del navegador, el selector puede haberse quedado desfasado.
      window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        const markupSelectedIndex =
          select.querySelector<HTMLOptionElement>('option[selected]')?.index;
        if (markupSelectedIndex !== select.selectedIndex) {
          select.selectedIndex = markupSelectedIndex ?? 0;
        }
      });
    }
  }
  customElements.define('starlight-lang-select', StarlightLanguageSelect);
</script>
```

- [ ] **Paso 14: la integración que borra las copias de respaldo**

`web/src/integrations/drop-fallbacks.ts`:

```ts
/**
 * Borra del build las copias de respaldo que Starlight genera en /en/ para cada página en español
 * cuya ruta no existe en inglés (ver fallbackUrls). Va ANTES de Starlight en `integrations`: así
 * borra los ficheros antes de que Pagefind indexe el build.
 */
import type { AstroIntegration } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { idFromContentPath } from '../lib/translations';

/** Los ids de las entradas de una carpeta de contenido, como los genera Astro. */
export function listContentIds(docsDir: string): string[] {
  return fs
    .readdirSync(docsDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) => idFromContentPath(file.split(path.sep).join('/')));
}

export function dropFallbacks(urls: ReadonlySet<string>): AstroIntegration {
  return {
    name: 'drop-fallbacks',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        for (const url of urls) fs.rmSync(new URL(`.${url}`, dir), { recursive: true, force: true });
        logger.info(`${urls.size} copias de respaldo borradas`);
      },
    },
  };
}
```

En `web/astro.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { dropFallbacks, listContentIds } from './src/integrations/drop-fallbacks';
import { localeLabels } from './src/lib/locales';
import { fallbackUrls } from './src/lib/translations';

// Las copias de respaldo que generaría Starlight: se borran del build y no van al sitemap.
const fallbacks = new Set(
  fallbackUrls(listContentIds(fileURLToPath(new URL('./src/content/docs', import.meta.url)))),
);
```

- **`integrations`:** `dropFallbacks(fallbacks)` va la **primera**, antes de `mermaid(...)` y de `starlight(...)`.
- **`starlight({...})`:**
  - en `locales`, los `label` pasan a `localeLabels.es` y `localeLabels.en`;
  - en `components`, se añade `LanguageSelect: './src/components/overrides/LanguageSelect.astro',`;
  - después de `components`, se añade `routeMiddleware: './src/routeData.ts',`.
- **`sitemap()`** pasa a ser:

```ts
    sitemap({ filter: (page) => !fallbacks.has(new URL(page).pathname) }),
```

- [ ] **Paso 15: build**

Run: `pnpm build`
Expected:
- **log:** `[drop-fallbacks] 0 copias de respaldo borradas` (todavía todas las páginas tienen la misma ruta en los dos idiomas) y `[seo-audit] 24 páginas auditadas, sin problemas.`;
- **`hreflang`:** `grep -o 'hreflang="[^"]*"' web/dist/es/phase-0/dns/index.html` → `es`, `en` y `x-default`, una vez cada uno;
- **selector:** `grep -o '<option value="[^"]*"' web/dist/es/phase-0/dns/index.html | head -2` → `/es/phase-0/dns/` y `/en/phase-0/dns/`.

- [ ] **Paso 16: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 4: Español en la raíz y rutas traducidas

**Ficheros:**
- Modificar la lógica, con sus tests: `web/src/lib/{locales,links,lessons,explorer,sidebar}.ts` y `web/src/data/phases.ts`.
- Modificar los componentes: `web/src/components/overrides/{PageTitle,Footer,Sidebar,Pagination}.astro`, `web/src/components/{PhaseList,LessonIntro}.astro` y `web/src/content.config.ts`.
- Modificar la configuración y la auditoría: `web/astro.config.ts` y `web/src/lib/seo/audit.ts` (+ test).
- Mover el contenido: `web/src/content/docs/**` (con un script).
- Borrar: `web/public/_redirects`.

**Interfaces:**
- Consume: de la Tarea 3, `getTranslationIndex`, `urlOfId` y la `translationKey` del esquema.
- Cambia:
  - **`toLocale(undefined)`** devuelve `'es'`;
  - **`localizedHref('es', …)`** va sin prefijo;
  - **`countLessons(ids, locale, phaseNumber: number)`** recibe el número de fase en lugar del slug;
  - **`currentLesson(sidebar, phases, locale)`** recibe el idioma;
  - **`Phase`** pierde `slug`, y la carpeta de una fase es `phaseFolderName(locale, number)`;
  - **`buildPhaseSidebar`:** cada grupo autogenera desde las dos carpetas.
- Produce: la regla `noLegacySpanishPrefix`.

- [ ] **Paso 1: tests nuevos de la lógica**

`web/src/lib/locales.test.ts`: cambia el `describe('toLocale', …)` por:

```ts
describe('toLocale', () => {
  it('devuelve el idioma si es válido', () => {
    expect(toLocale('en')).toBe('en');
  });

  it('undefined es el español: el idioma raíz, que Starlight representa sin locale', () => {
    expect(toLocale(undefined)).toBe('es');
  });

  it('lanza un error si el idioma no existe, porque indica un error de configuración', () => {
    expect(() => toLocale('fr')).toThrow(/Idioma desconocido/);
  });
});
```

`web/src/lib/links.test.ts`, entero:

```ts
import { describe, expect, it } from 'vitest';
import { localizedHref } from './links';

describe('localizedHref', () => {
  it('el español va en la raíz, sin prefijo', () => {
    expect(localizedHref('es', 'fase-0/que-es-dns')).toBe('/fase-0/que-es-dns/');
    expect(localizedHref('es')).toBe('/');
  });

  it('el inglés lleva /en/', () => {
    expect(localizedHref('en', 'phase-0')).toBe('/en/phase-0/');
    expect(localizedHref('en')).toBe('/en/');
    expect(localizedHref('en', '')).toBe('/en/');
  });

  it('tolera barras sobrantes al principio o al final', () => {
    expect(localizedHref('es', '/roadmap/')).toBe('/roadmap/');
  });
});
```

`web/src/lib/lessons.test.ts`, entero:

```ts
import { describe, expect, it } from 'vitest';
import { countLessons, isLessonId } from './lessons';

describe('isLessonId', () => {
  it('reconoce una lección: una página dentro de la carpeta de una fase', () => {
    expect(isLessonId('fase-0/que-es-dns')).toBe(true);
    expect(isLessonId('en/phase-11/mcp')).toBe(true);
  });

  it('la introducción de una fase no es una lección', () => {
    expect(isLessonId('fase-0')).toBe(false);
    expect(isLessonId('en/phase-0')).toBe(false);
  });

  it('las páginas generales no son lecciones', () => {
    expect(isLessonId('roadmap')).toBe(false);
    expect(isLessonId('en/glossary')).toBe(false);
    expect(isLessonId('')).toBe(false);
    expect(isLessonId('en')).toBe(false);
  });

  it('cada idioma usa su palabra: en español no hay phase-N ni en inglés fase-N', () => {
    expect(isLessonId('phase-0/dns')).toBe(false);
    expect(isLessonId('en/fase-0/que-es-dns')).toBe(false);
  });
});

describe('countLessons', () => {
  const ids = [
    'fase-0',
    'fase-0/modelo-cliente-servidor',
    'fase-0/que-es-un-protocolo',
    'en/phase-0',
    'en/phase-0/client-server-model',
    'fase-10/x',
    'roadmap',
  ];

  it('cuenta las lecciones de una fase en un idioma, sin la introducción', () => {
    expect(countLessons(ids, 'es', 0)).toBe(2);
    expect(countLessons(ids, 'en', 0)).toBe(1);
  });

  it('no confunde la fase 1 con la 10', () => {
    expect(countLessons(ids, 'es', 1)).toBe(0);
  });
});
```

`web/src/lib/sidebar.test.ts`:
- en el helper `phase`, quita la línea `slug: \`phase-${number}\`,`;
- cambia el primer test por:

```ts
  it('solo incluye las fases disponibles, en orden, con la carpeta de cada idioma', () => {
    const groups = buildPhaseSidebar([
      phase(0, 'available'),
      phase(1, 'coming-soon'),
      phase(2, 'available'),
    ]);
    expect(groups.map((group) => group.items.map((item) => item.autogenerate.directory))).toEqual([
      ['fase-0', 'phase-0'],
      ['fase-2', 'phase-2'],
    ]);
  });
```

`web/src/lib/explorer.test.ts`:

1. Cambia el `sidebar` de los tests por:

```ts
const sidebar: ExplorerEntry[] = [
  link('Roadmap', '/roadmap/'),
  link('Glosario', '/glossary/'),
  {
    type: 'group',
    label: 'Fase 0 · Cómo funciona internet',
    entries: [
      link('Introducción', '/fase-0/'),
      link('Modelo cliente-servidor', '/fase-0/modelo-cliente-servidor/'),
      link('Qué es un protocolo', '/fase-0/que-es-un-protocolo/', true),
    ],
  },
  {
    type: 'group',
    label: 'Fase 10 · Calidad',
    entries: [link('Introducción', '/fase-10/')],
  },
];
```

2. En `findPhaseLinks`, `locateCurrent` y `fileNameFor / pageFileName`, cambia `'phase-0'` por `'fase-0'` y `'phase-10'` por `'fase-10'`. Cambia también los `href` por los nuevos (`'/fase-0/modelo-cliente-servidor/'` y `'/roadmap/'`). Y el test «no confunde phase-1 con phase-10» pasa a ser:

```ts
  it('no confunde fase-1 con fase-10', () => {
    expect(findPhaseLinks(sidebar, 'fase-1')).toEqual([]);
  });
```

3. Cambia el test «la portada es README.md» por:

```ts
  it('las portadas son README.md', () => {
    expect(pageFileName('', 'Backend desde cero')).toBe('README.md');
    expect(pageFileName('index', 'Backend desde cero')).toBe('README.md');
    expect(pageFileName('en', 'Backend from Scratch')).toBe('README.md');
  });

  it('las páginas raíz del español no son la portada, aunque su id no tenga barra', () => {
    expect(pageFileName('glossary', 'Glosario')).toBe('glosario.md');
    expect(pageFileName('roadmap', 'Roadmap')).toBe('roadmap.md');
    expect(pageFileName('en/glossary', 'Glossary')).toBe('glossary.md');
  });

  it('las lecciones llevan su posición', () => {
    const position = locateCurrent(sidebar, ['fase-0']);
    expect(pageFileName('fase-0/que-es-un-protocolo', 'Qué es un protocolo', position)).toBe(
      '02-que-es-un-protocolo.md',
    );
  });
```

4. En «fileNameFor con la etiqueta del sidebar», cambia `'/en/phase-0/client-server/'` por `'/en/phase-0/client-server-model/'` las tres veces. El slug `'phase-0'` se queda, porque es inglés.

5. Cambia el `describe('currentLesson / statusStep', …)` por:

```ts
describe('currentLesson / statusStep', () => {
  const phase0 = {
    number: 0,
    status: 'available',
    lessonCount: 8,
    title: { es: '', en: '' },
    summary: { es: '', en: '' },
  } as const;
  const phase10 = { ...phase0, number: 10, lessonCount: undefined };

  it('devuelve la fase y la posición de la página actual, en la carpeta de su idioma', () => {
    const current = currentLesson(sidebar, [phase0, phase10], 'es');
    expect(current?.phase.number).toBe(0);
    expect(current?.position.index).toBe(2);
  });

  it('en inglés busca la carpeta phase-N', () => {
    const english: ExplorerEntry[] = [
      {
        type: 'group',
        label: 'Phase 0',
        entries: [link('Introduction', '/en/phase-0/'), link('What is DNS?', '/en/phase-0/what-is-dns/', true)],
      },
    ];
    expect(currentLesson(english, [phase0], 'en')?.position.index).toBe(1);
    expect(currentLesson(english, [phase0], 'es')).toBeUndefined();
  });

  it('la introducción, una lección con total y una lección sin total', () => {
    const at = (index: number, phase: typeof phase0 | typeof phase10) => ({
      phase,
      position: { phaseSlug: phaseFolderName('es', phase.number), index, links: [] },
    });
    expect(statusStep(at(0, phase0))).toEqual({ key: 'status.intro' });
    expect(statusStep(at(2, phase0))).toEqual({ key: 'status.lesson', n: 2, total: 8 });
    expect(statusStep(at(3, phase10))).toEqual({ key: 'status.lessonNoTotal', n: 3 });
  });
});
```

- [ ] **Paso 2: comprobar que fallan**

Run: `pnpm --filter web exec vitest run src/lib/locales.test.ts src/lib/links.test.ts src/lib/lessons.test.ts src/lib/sidebar.test.ts src/lib/explorer.test.ts`
Expected: FAIL. Por ejemplo:
- `toLocale(undefined)` lanza;
- `localizedHref('es')` da `/es/`;
- `isLessonId('fase-0/que-es-dns')` da `false`;
- el sidebar da `['phase-0']`;
- `pageFileName('glossary', …)` da `README.md`.

- [ ] **Paso 3: implementar**

En `web/src/lib/locales.ts`, cambia `toLocale` por:

```ts
/**
 * Convierte el locale de Starlight en un Locale del curso. El español es el idioma raíz (sin prefijo
 * en la URL), y Starlight lo representa como `undefined`.
 */
export function toLocale(value: string | undefined): Locale {
  if (value === undefined) return defaultLocale;
  if (!isLocale(value)) {
    throw new Error(
      `[locales] Idioma desconocido: "${value}". Los idiomas válidos son: ${locales.join(', ')}`,
    );
  }
  return value;
}
```

`web/src/lib/links.ts`, entero:

```ts
import { defaultLocale, type Locale } from './locales';

/**
 * URL interna de un idioma. El español va en la raíz: localizedHref('es', 'roadmap') → '/roadmap/';
 * el inglés lleva prefijo: localizedHref('en', 'phase-0') → '/en/phase-0/'.
 */
export function localizedHref(locale: Locale, slug = ''): string {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  return cleanSlug ? `${prefix}/${cleanSlug}/` : `${prefix}/`;
}
```

`web/src/lib/lessons.ts`, entero:

```ts
import { phaseFolderName } from './explorer';
import { defaultLocale, type Locale } from './locales';

/**
 * Una lección es cualquier página dentro de la carpeta de una fase que no sea su introducción:
 * "fase-0/que-es-dns" y "en/phase-0/what-is-dns" sí; "fase-0", "roadmap" y "en/glossary" no.
 */
export function isLessonId(entryId: string): boolean {
  return /^(?:fase-\d+|en\/phase-\d+)\/[^/]+$/.test(entryId);
}

/** Lecciones publicadas de una fase en un idioma (sin contar la introducción). */
export function countLessons(
  entryIds: readonly string[],
  locale: Locale,
  phaseNumber: number,
): number {
  const prefix = locale === defaultLocale ? '' : `${locale}/`;
  const folder = `${prefix}${phaseFolderName(locale, phaseNumber)}/`;
  return entryIds.filter((id) => isLessonId(id) && id.startsWith(folder)).length;
}
```

En `web/src/lib/explorer.ts`:
- cambia el import de locales por `import { isLocale, type Locale } from './locales';`;
- cambia `currentLesson` y `pageFileName` por:

```ts
/** La fase y la posición de la página actual, si está dentro de una fase. */
export function currentLesson(
  sidebar: readonly ExplorerEntry[],
  phases: readonly Phase[],
  locale: Locale,
): CurrentLesson | undefined {
  const folderOf = (phase: Phase) => phaseFolderName(locale, phase.number);
  const position = locateCurrent(sidebar, phases.map(folderOf));
  const phase = position && phases.find((p) => folderOf(p) === position.phaseSlug);
  return phase && position ? { phase, position } : undefined;
}
```

```ts
/** Las portadas: '' o 'index' (español, en la raíz) y 'en'. */
const isHomeId = (routeId: string) => routeId === '' || routeId === 'index' || isLocale(routeId);

/** Nombre de fichero de la página actual: README.md para las portadas. */
export function pageFileName(routeId: string, title: string, position?: LessonPosition): string {
  if (position) return toFileName(position.links[position.index]!.label, position.index);
  return isHomeId(routeId) ? 'README.md' : toFileName(title);
}
```

`web/src/lib/sidebar.ts`, entero:

```ts
import type { Phase } from '../data/phases';
import { phaseFolderName } from './explorer';
import { locales } from './locales';

export interface PhaseSidebarGroup {
  label: string;
  translations: { en: string };
  items: { autogenerate: { directory: string } }[];
}

/**
 * Un grupo del menú lateral por cada fase publicada. Cada idioma tiene su carpeta (fase-0 y
 * phase-0), y Starlight usa la misma configuración para todos: el grupo autogenera desde las dos, y
 * el middleware (src/routeData.ts) quita lo que en cada idioma son copias de respaldo.
 */
export function buildPhaseSidebar(phases: readonly Phase[]): PhaseSidebarGroup[] {
  return phases
    .filter((phase) => phase.status === 'available')
    .map((phase) => ({
      label: `Fase ${phase.number} · ${phase.title.es}`,
      translations: { en: `Phase ${phase.number} · ${phase.title.en}` },
      items: locales.map((locale) => ({
        autogenerate: { directory: phaseFolderName(locale, phase.number) },
      })),
    }));
}
```

En `web/src/data/phases.ts`, quita el campo `slug`. Del `interface Phase` salen estas dos líneas:

```ts
  /** Carpeta dentro de src/content/docs/<idioma>/ y parte de la URL. */
  slug: string;
```

De las fases salen sus líneas `slug`:

Run: `sed -i '' "/^    slug: 'phase-[0-9]*',$/d" web/src/data/phases.ts && grep -c "slug" web/src/data/phases.ts`
Expected: `0`.

- [ ] **Paso 4: comprobar que pasan**

Run: `pnpm --filter web exec vitest run src/lib/locales.test.ts src/lib/links.test.ts src/lib/lessons.test.ts src/lib/sidebar.test.ts src/lib/explorer.test.ts`
Expected: PASS.

- [ ] **Paso 5: componentes**

- **`web/src/components/overrides/PageTitle.astro`:**
  - `currentLesson(route.sidebar, phases)` → `currentLesson(route.sidebar, phases, locale)`. `locale` ya se declara justo antes;
  - `<a href={localizedHref(locale, phase.slug)}>` → `<a href={localizedHref(locale, phaseFolderName(locale, phase.number))}>`.
- **`web/src/components/overrides/Footer.astro`:** `currentLesson(route.sidebar, phases)` → `currentLesson(route.sidebar, phases, locale)`.
- **`web/src/components/overrides/Sidebar.astro`:** `findPhaseLinks(route.sidebar, phase.slug)` → `findPhaseLinks(route.sidebar, phaseFolderName(locale, phase.number))`.
- **`web/src/components/overrides/Pagination.astro`:**
  - el import de explorer pasa a ser `import { fileNameFor, phaseFolderName } from '~/lib/explorer';`, y se añade `import { toLocale } from '~/lib/locales';`;
  - `const slugs = phases.map((p) => p.slug);` pasa a ser:

```ts
const locale = toLocale(Astro.locals.starlightRoute.locale);
const slugs = phases.map((p) => phaseFolderName(locale, p.number));
```

- **`web/src/components/PhaseList.astro`:**
  - `<a href={localizedHref(locale, phase.slug)}>` → `<a href={localizedHref(locale, name)}>`;
  - `countLessons(ids, defaultLocale, phase.slug)` → `countLessons(ids, defaultLocale, phase.number)`.
- **`web/src/components/LessonIntro.astro`:** el frontmatter, hasta el `---` de cierre, queda así:

```astro
---
import { contentT } from '~/lib/content-i18n';
import { getEntry, type CollectionEntry } from 'astro:content';
import { phases } from '~/data/phases';
import { fileNameFor, linkLabel, phaseFolderName } from '~/lib/explorer';
import { defaultLocale, toLocale } from '~/lib/locales';
import { urlOfId } from '~/lib/translations';
import { getTranslationIndex } from '~/lib/translations-astro';

interface Props {
  lesson: NonNullable<CollectionEntry<'docs'>['data']['lesson']>;
}

const { lesson } = Astro.props;
const t = contentT(Astro.locals);
const { sidebar } = Astro.locals.starlightRoute;
const urlLocale = toLocale(Astro.locals.starlightRoute.locale);
const phaseSlugs = phases.map((p) => phaseFolderName(urlLocale, p.number));
const index = await getTranslationIndex();

const prerequisites = await Promise.all(
  lesson.prerequisites.map(async (key) => {
    // Cada requisito es la translationKey de una lección. Se enlaza en el idioma de la URL y, si aún
    // no está traducida, en el idioma por defecto.
    const ids = index.byKey.get(key);
    const id = ids?.[urlLocale] ?? ids?.[defaultLocale];
    const entry = id === undefined ? undefined : await getEntry('docs', id);
    if (!entry) throw new Error(`[LessonIntro] El requisito previo "${key}" no existe`);
    const href = urlOfId(entry.id);
    const title = entry.data.title;
    // El nombre y el fichero, los mismos que da el sidebar de esta página (su idioma).
    const name = linkLabel(sidebar, href) ?? title;
    return { href, name, file: fileNameFor(sidebar, phaseSlugs, { href, label: title }) };
  }),
);
---
```

- **`web/src/content.config.ts`:** encima de `prerequisites: z.array(z.string()).default([]),` va el comentario `// Las translationKey de las lecciones que conviene leer antes (p. ej. [tcp-vs-udp]).`

- [ ] **Paso 6: la regla `noLegacySpanishPrefix` (en rojo)**

Añade `noLegacySpanishPrefix` a los imports de `audit.test.ts`, este bloque, y la regla al final de la expectativa de `defaultRules`:

```ts
describe('noLegacySpanishPrefix', () => {
  it('el español vive en la raíz: no hay páginas bajo /es/', () => {
    expect(noLegacySpanishPrefix(input([page('/fase-0/'), page('/')]))).toEqual([]);
    expect(noLegacySpanishPrefix(input([page('/es/phase-0/')]))[0]?.url).toBe('/es/phase-0/');
  });
});
```

En `audit.ts`, la regla, también al final de `defaultRules`:

```ts
export const noLegacySpanishPrefix = perPage('es-prefix', ({ url }) =>
  url.startsWith('/es/') ? 'el español vive en la raíz: no debería haber páginas bajo /es/' : undefined,
);
```

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts`
Expected: PASS.

- [ ] **Paso 7: configuración**

En `web/astro.config.ts`, dentro de `starlight({...})`, quita `defaultLocale: 'es',` y cambia `locales` por:

```ts
      // El español va en la raíz (sin /es/) y el inglés en /en/.
      locales: {
        root: { label: localeLabels.es, lang: 'es' },
        en: { label: localeLabels.en, lang: 'en' },
      },
```

Run: `rm web/public/_redirects`. La raíz ya no redirige a `/es/`: es la portada.

- [ ] **Paso 8: mover el contenido**

Desde `web/`, un script de una sola vez. No se guarda en el repo: si hace falta guardarlo, va al scratchpad.

```python
import re, shutil
from pathlib import Path

D = Path('src/content/docs')
# translationKey: (ruta en español, ruta en inglés), como en las Restricciones globales.
SLUGS = {
    'client-server': ('modelo-cliente-servidor', 'client-server-model'),
    'protocols': ('que-es-un-protocolo', 'what-is-a-protocol'),
    'tcp-ip-model': ('modelo-tcp-ip', 'tcp-ip-model'),
    'ip-ports-sockets': ('ip-puertos-y-sockets', 'ip-ports-sockets'),
    'tcp-vs-udp': ('tcp-vs-udp', 'tcp-vs-udp'),
    'dns': ('que-es-dns', 'what-is-dns'),
    'tls-https': ('tls-y-https', 'tls-and-https'),
    'from-url-to-page': ('que-pasa-cuando-escribes-una-url', 'what-happens-when-you-type-a-url'),
}

# 1. El español, a la raíz; la Fase 0, a fase-0/ con nombres en español; el inglés, renombrado.
(D / 'fase-0').mkdir()
for name in ['index.mdx', 'roadmap.mdx', 'glossary.mdx']:
    shutil.move(D / 'es' / name, D / name)
shutil.move(D / 'es' / 'phase-0' / 'index.mdx', D / 'fase-0' / 'index.mdx')
for key, (es, en) in SLUGS.items():
    shutil.move(D / 'es' / 'phase-0' / f'{key}.mdx', D / 'fase-0' / f'{es}.mdx')
    if en != key:
        shutil.move(D / 'en' / 'phase-0' / f'{key}.mdx', D / 'en' / 'phase-0' / f'{en}.mdx')
(D / 'es' / 'phase-0').rmdir()
(D / 'es').rmdir()

# 2. translationKey en las dos versiones; prerequisites, de rutas a claves.
def frontmatter(path, key):
    s = path.read_text()
    assert s.startswith('---\n'), path
    s = f'---\ntranslationKey: {key}\n' + s[4:]
    s = re.sub(r'prerequisites: \[phase-0/([a-z-]+)\]', r'prerequisites: [\1]', s)
    path.write_text(s)

frontmatter(D / 'fase-0' / 'index.mdx', 'phase-0')
frontmatter(D / 'en' / 'phase-0' / 'index.mdx', 'phase-0')
for key, (es, en) in SLUGS.items():
    frontmatter(D / 'fase-0' / f'{es}.mdx', key)
    frontmatter(D / 'en' / 'phase-0' / f'{en}.mdx', key)

# 3. Enlaces internos.
for f in [*D.glob('*.mdx'), *(D / 'fase-0').glob('*.mdx')]:
    s = f.read_text()
    for key, (es, _) in SLUGS.items():
        s = s.replace(f'/es/phase-0/{key}/', f'/fase-0/{es}/')
    s = s.replace('/es/phase-0/', '/fase-0/').replace('/es/roadmap/', '/roadmap/')
    s = s.replace('/es/glossary/', '/glossary/')
    f.write_text(s)
for f in [*(D / 'en').glob('*.mdx'), *(D / 'en' / 'phase-0').glob('*.mdx')]:
    s = f.read_text()
    for key, (_, en) in SLUGS.items():
        s = s.replace(f'/en/phase-0/{key}/', f'/en/phase-0/{en}/')
    f.write_text(s)
```

Run: `cd web && find src/content/docs -name '*.mdx' | sort && grep -rn '/es/' src/content/docs | grep -v developer.mozilla.org; cd ..`
Expected: estos 24 ficheros, y ninguna línea en el `grep`:

```
src/content/docs/en/glossary.mdx
src/content/docs/en/index.mdx
src/content/docs/en/phase-0/client-server-model.mdx
src/content/docs/en/phase-0/index.mdx
src/content/docs/en/phase-0/ip-ports-sockets.mdx
src/content/docs/en/phase-0/tcp-ip-model.mdx
src/content/docs/en/phase-0/tcp-vs-udp.mdx
src/content/docs/en/phase-0/tls-and-https.mdx
src/content/docs/en/phase-0/what-happens-when-you-type-a-url.mdx
src/content/docs/en/phase-0/what-is-a-protocol.mdx
src/content/docs/en/phase-0/what-is-dns.mdx
src/content/docs/en/roadmap.mdx
src/content/docs/fase-0/index.mdx
src/content/docs/fase-0/ip-puertos-y-sockets.mdx
src/content/docs/fase-0/modelo-cliente-servidor.mdx
src/content/docs/fase-0/modelo-tcp-ip.mdx
src/content/docs/fase-0/que-es-dns.mdx
src/content/docs/fase-0/que-es-un-protocolo.mdx
src/content/docs/fase-0/que-pasa-cuando-escribes-una-url.mdx
src/content/docs/fase-0/tcp-vs-udp.mdx
src/content/docs/fase-0/tls-y-https.mdx
src/content/docs/glossary.mdx
src/content/docs/index.mdx
src/content/docs/roadmap.mdx
```

Run: `grep -rn "phase\.slug\|p\.slug" web/src`
Expected: sin salida.

- [ ] **Paso 9: build**

Run: `pnpm build`
Expected:
- `[drop-fallbacks] 9 copias de respaldo borradas`;
- `All internal links are valid.`;
- `[seo-audit] 24 páginas auditadas, sin problemas.`. La auditoría ya comprueba aquí, en el build real, que los `hreflang` son recíprocos, que el selector coincide, que no queda ninguna copia de respaldo y que nada vive bajo `/es/`;
- `find web/dist -name index.html -not -path '*/pagefind/*' | sort` lista las 24 páginas con las rutas de la tabla y ninguna bajo `/es/` ni bajo `/en/fase-0/`.

- [ ] **Paso 10: comprobar en el navegador**

Run: `pnpm --filter web preview`, en segundo plano. Sirve en `http://localhost:4321`.

Con Playwright:
1. **Selector de idioma:** abre `/fase-0/que-es-dns/` y cambia el selector a English → la URL pasa a `/en/phase-0/what-is-dns/`. Desde ahí, Español → vuelve a `/fase-0/que-es-dns/`.
2. **Laboratorio DNS:** en la misma lección, consulta `example.com` → «Respuesta: … registros».
3. **Explorador, en `/en/phase-0/what-is-dns/`:**
   - lista `00-introduction.md` … `08-…` con las rutas `/en/phase-0/…`, sin enlaces `/en/fase-0/`;
   - la paginación lleva a `tcp-vs-udp` y a `tls-and-https`.
4. **Portada:** `/` es la portada en español, sin redirección, y su pestaña dice `README.md`. La pestaña de `/glossary/` dice `glosario.md`.

Para el servidor de `preview` y borra las capturas que deje Playwright en el proyecto, después de comprobar que son solo de esta tarea.

- [ ] **Paso 11: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 5: Diagramas en HTML, sin Mermaid

**Ficheros:**
- Crear:
  - `web/src/lib/diagrams/hast.ts`;
  - `web/src/lib/diagrams/sequence.ts` y `web/src/lib/diagrams/chain.ts`, con sus tests;
  - `web/src/lib/diagrams/remark-diagrams.ts`, con su test;
  - `web/src/styles/diagrams.css`.
- Modificar: `web/astro.config.ts`, `web/src/styles/theme.css`, `web/package.json` y `web/src/lib/seo/audit.ts` (+ test).
- Borrar: `web/src/scripts/mermaid-min-width.ts` y `web/src/components/overrides/MarkdownContent.astro`.

**Interfaces:**
- Produce:
  - **`hast.ts`:** `el`, `text`, `lines`, `classList`, `findByClass` y `textContent`, y los tipos `HastElement` y `HastNode`;
  - **`sequence.ts`:** `parseSequence(source): Sequence` y `renderSequence(seq): HastElement`;
  - **`chain.ts`:** `parseChain(source): Chain` y `renderChain(chain): HastElement`;
  - **`remark-diagrams.ts`:** `diagramFromMermaid(source)` y `remarkDiagrams()`;
  - **auditoría:** las reglas `noMermaid` y `jsBudget`, y `JS_BUDGET_BYTES`.

- [ ] **Paso 1: reglas de diagramas y de peso (en rojo en el build)**

Añade `JS_BUDGET_BYTES`, `jsBudget` y `noMermaid` a los imports de `audit.test.ts`, estos bloques, y las dos reglas al final de la expectativa de `defaultRules`:

```ts
describe('noMermaid', () => {
  it('ningún diagrama Mermaid sin convertir', () => {
    expect(noMermaid(input([page('/')]))).toEqual([]);
    expect(noMermaid(input([page('/a/', { mermaidBlocks: 2 })]))[0]?.message).toMatch(/2 diagramas/);
  });
});

describe('jsBudget', () => {
  it('ninguna página puede descargar más de 300 KB de JavaScript', () => {
    expect(JS_BUDGET_BYTES).toBe(300 * 1024);
    expect(jsBudget(input([page('/', {}, JS_BUDGET_BYTES)]))).toEqual([]);
    expect(jsBudget(input([page('/a/', {}, JS_BUDGET_BYTES + 1)]))[0]?.message).toMatch(
      /el límite es 300 KB/,
    );
  });
});
```

En `audit.ts`, las reglas, también al final de `defaultRules`:

```ts
/** JavaScript máximo por página, sin comprimir, contando todo lo que puede importar. */
export const JS_BUDGET_BYTES = 300 * 1024;

export const noMermaid = perPage('mermaid', ({ facts }) =>
  facts.mermaidBlocks > 0
    ? `tiene ${facts.mermaidBlocks} diagramas Mermaid sin convertir a HTML`
    : undefined,
);

export const jsBudget = perPage('js-budget', ({ jsBytes }) =>
  jsBytes > JS_BUDGET_BYTES
    ? `puede descargar ${Math.round(jsBytes / 1024)} KB de JavaScript; el límite es ${JS_BUDGET_BYTES / 1024} KB`
    : undefined,
);
```

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts && pnpm build`
Expected:
- **tests:** PASS;
- **build:** FAIL, con `[mermaid]` en las 14 lecciones con diagrama y `[js-budget]` en las 24 páginas (unos 3.400 KB o más).

- [ ] **Paso 2: tests de las secuencias**

`web/src/lib/diagrams/sequence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { classList, findByClass, textContent } from './hast';
import { parseSequence, renderSequence } from './sequence';

const CLIENT_SERVER = `sequenceDiagram
    participant C as Navegador (cliente)
    participant S as nc -l 8080 (servidor)
    Note over S: Ya estaba escuchando en el puerto 8080
    C->>S: Petición: GET / HTTP/1.1
    S-->>C: Respuesta: HTTP/1.1 200 OK<br/>«Hola desde mi servidor»`;

describe('parseSequence', () => {
  it('lee participantes, mensajes, respuestas y notas; el texto puede llevar «:»', () => {
    expect(parseSequence(CLIENT_SERVER)).toEqual({
      participants: [
        { id: 'C', label: 'Navegador (cliente)' },
        { id: 'S', label: 'nc -l 8080 (servidor)' },
      ],
      steps: [
        { kind: 'note', over: ['S'], text: ['Ya estaba escuchando en el puerto 8080'] },
        { kind: 'message', from: 'C', to: 'S', reply: false, text: ['Petición: GET / HTTP/1.1'] },
        {
          kind: 'message',
          from: 'S',
          to: 'C',
          reply: true,
          text: ['Respuesta: HTTP/1.1 200 OK', '«Hola desde mi servidor»'],
        },
      ],
    });
  });

  it('una nota puede ir sobre dos participantes', () => {
    const seq = parseSequence(
      'sequenceDiagram\nparticipant N as Navegador\nparticipant S as Servidor\nNote over N,S: Todo va cifrado.',
    );
    expect(seq.steps).toEqual([{ kind: 'note', over: ['N', 'S'], text: ['Todo va cifrado.'] }]);
  });

  it.each([
    [
      'sequenceDiagram\nparticipant A as A\nparticipant B as B\nloop Cada segundo\nA->>B: hola\nend',
      /Línea no admitida: «loop Cada segundo»/,
    ],
    ['sequenceDiagram\nparticipant A as A\nparticipant C as C\nA->>B: hola', /«B» no está declarado/],
    ['sequenceDiagram\nparticipant A as A\nparticipant B as B\nA->>A: hola', /a sí mismo/],
    ['sequenceDiagram\nparticipant A as A\nparticipant A as Otra', /«A» está repetido/],
    [
      `sequenceDiagram\n${'abcdefg'
        .split('')
        .map((id) => `participant ${id} as ${id}`)
        .join('\n')}\na->>b: hola`,
      /como mucho 6 participantes/,
    ],
    ['sequenceDiagram\nparticipant A as A\nNote over A: sola', /al menos 2 participantes/],
    ['sequenceDiagram\nparticipant A as A\nparticipant B as B', /no tiene ningún paso/],
  ])('falla con un mensaje claro ante lo que no admite (%#)', (source, error) => {
    expect(() => parseSequence(source)).toThrow(error);
  });
});

describe('renderSequence', () => {
  const figure = renderSequence(parseSequence(CLIENT_SERVER));

  it('es una figura sin estilos de prosa, con una columna por participante', () => {
    expect(figure.tagName).toBe('figure');
    expect(classList(figure)).toEqual(['seq', 'seq--n2', 'not-content']);
  });

  it('los participantes van en la cabecera, ocultos al lector de pantalla (cada paso dice quién habla)', () => {
    expect(findByClass(figure, 'seq__participants')[0]?.properties.ariaHidden).toBe('true');
    expect(findByClass(figure, 'seq__participant').map(textContent)).toEqual([
      'Navegador (cliente)',
      'nc -l 8080 (servidor)',
    ]);
  });

  it('cada paso ocupa las columnas entre sus participantes y dice quién habla a quién', () => {
    const steps = findByClass(figure, 'seq__step');
    expect(steps.map(classList)).toEqual([
      ['seq__step', 'seq__step--note', 'seq-c2', 'seq-s1'],
      ['seq__step', 'seq__step--message', 'seq__step--right', 'seq-c1', 'seq-s2'],
      ['seq__step', 'seq__step--reply', 'seq__step--left', 'seq-c1', 'seq-s2'],
    ]);
    expect(steps.map((step) => textContent(findByClass(step, 'seq__route')[0]!))).toEqual([
      'nc -l 8080 (servidor)',
      'Navegador (cliente) → nc -l 8080 (servidor)',
      'nc -l 8080 (servidor) → Navegador (cliente)',
    ]);
  });

  it('los saltos de línea del texto son <br>', () => {
    expect(textContent(findByClass(figure, 'seq__text')[2]!)).toBe(
      'Respuesta: HTTP/1.1 200 OK\n«Hola desde mi servidor»',
    );
  });
});
```

Run: `pnpm --filter web exec vitest run src/lib/diagrams/sequence.test.ts`
Expected: FAIL, porque no encuentra `./hast` ni `./sequence`.

- [ ] **Paso 3: implementar `hast.ts` y `sequence.ts`**

`web/src/lib/diagrams/hast.ts`:

```ts
/**
 * Lo mínimo de hast (el árbol HTML de unified) para construir los diagramas y recorrerlos en los
 * tests, sin depender de los tipos de unified.
 */
export interface HastText {
  type: 'text';
  value: string;
}
export interface HastElement {
  type: 'element';
  tagName: string;
  properties: Record<string, string | string[]>;
  children: HastNode[];
}
export type HastNode = HastElement | HastText;

export const text = (value: string): HastText => ({ type: 'text', value });

export function el(
  tagName: string,
  properties: HastElement['properties'],
  children: HastNode[] = [],
): HastElement {
  return { type: 'element', tagName, properties, children };
}

/** Varias líneas de texto separadas por <br>. */
export function lines(parts: readonly string[]): HastNode[] {
  return parts.flatMap((part, i) => (i === 0 ? [text(part)] : [el('br', {}), text(part)]));
}

export function classList(node: HastElement): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value : [];
}

/** Los elementos (el nodo incluido) que tienen exactamente esa clase, en orden de documento. */
export function findByClass(node: HastNode, className: string): HastElement[] {
  if (node.type === 'text') return [];
  const own = classList(node).includes(className) ? [node] : [];
  return [...own, ...node.children.flatMap((child) => findByClass(child, className))];
}

/** El texto de un nodo; cada <br> es un salto de línea. */
export function textContent(node: HastNode): string {
  if (node.type === 'text') return node.value;
  if (node.tagName === 'br') return '\n';
  return node.children.map(textContent).join('');
}
```

`web/src/lib/diagrams/sequence.ts`:

```ts
/**
 * Diagramas de secuencia escritos con la sintaxis de Mermaid, convertidos a HTML en el build. Solo
 * se admite lo que usa el curso: participantes con nombre, mensajes (->>), respuestas (-->>) y notas.
 * Lo demás falla con un mensaje claro: el build no publica un diagrama que no sabe dibujar.
 */
import { el, lines, text, type HastElement } from './hast';

export interface Participant {
  id: string;
  label: string;
}
export type SequenceStep =
  | { kind: 'message'; from: string; to: string; reply: boolean; text: string[] }
  | { kind: 'note'; over: string[]; text: string[] };
export interface Sequence {
  participants: Participant[];
  steps: SequenceStep[];
}

const MAX_PARTICIPANTS = 6;
const PARTICIPANT = /^participant\s+(\w+)\s+as\s+(.+)$/;
const MESSAGE = /^(\w+)\s*(-->>|->>)\s*(\w+)\s*:\s*(.+)$/;
const NOTE = /^Note\s+over\s+(\w+(?:\s*,\s*\w+)?)\s*:\s*(.+)$/;
const splitText = (value: string) => value.split(/<br\s*\/?>/i).map((part) => part.trim());

export function parseSequence(source: string): Sequence {
  const [first, ...rest] = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (first !== 'sequenceDiagram') {
    throw new Error(`Se esperaba «sequenceDiagram» y llega «${first}».`);
  }
  const participants: Participant[] = [];
  const steps: SequenceStep[] = [];
  const declared = (id: string) => {
    if (!participants.some((p) => p.id === id)) {
      throw new Error(`El participante «${id}» no está declarado: añade «participant ${id} as Nombre».`);
    }
    return id;
  };

  for (const line of rest) {
    const participant = PARTICIPANT.exec(line);
    const message = MESSAGE.exec(line);
    const note = NOTE.exec(line);
    if (participant) {
      const [, id, label] = participant;
      if (participants.some((p) => p.id === id)) {
        throw new Error(`El participante «${id}» está repetido.`);
      }
      participants.push({ id: id!, label: label!.trim() });
      if (participants.length > MAX_PARTICIPANTS) {
        throw new Error(
          `Caben como mucho ${MAX_PARTICIPANTS} participantes; este diagrama tiene ${participants.length}.`,
        );
      }
    } else if (message) {
      const [, from, arrow, to, body] = message;
      if (from === to) throw new Error(`No se admite un mensaje de un participante a sí mismo («${from}»).`);
      steps.push({
        kind: 'message',
        from: declared(from!),
        to: declared(to!),
        reply: arrow === '-->>',
        text: splitText(body!),
      });
    } else if (note) {
      const [, over, body] = note;
      steps.push({ kind: 'note', over: over!.split(',').map((id) => declared(id.trim())), text: splitText(body!) });
    } else {
      throw new Error(
        `Línea no admitida: «${line}». Admitido: participant X as Nombre, X->>Y: texto, X-->>Y: texto y Note over X[,Y]: texto.`,
      );
    }
  }

  if (participants.length < 2) throw new Error('Hacen falta al menos 2 participantes.');
  if (steps.length === 0) throw new Error('El diagrama no tiene ningún paso.');
  return { participants, steps };
}

/**
 * Una figura con una cuadrícula de una columna por participante (clases seq-c<columna> y
 * seq-s<anchura>, sin estilos en línea). Cada paso dice en texto quién habla a quién: lo oyen los
 * lectores de pantalla y, en pantallas estrechas, es lo que se ve (src/styles/diagrams.css).
 */
export function renderSequence(seq: Sequence): HastElement {
  const column = new Map(seq.participants.map((p, i) => [p.id, i + 1]));
  const label = new Map(seq.participants.map((p) => [p.id, p.label]));
  const span = (a: number, b: number) => [`seq-c${Math.min(a, b)}`, `seq-s${Math.abs(a - b) + 1}`];

  const steps = seq.steps.map((step) => {
    if (step.kind === 'note') {
      const columns = step.over.map((id) => column.get(id)!);
      return el(
        'li',
        { className: ['seq__step', 'seq__step--note', ...span(Math.min(...columns), Math.max(...columns))] },
        [
          el('span', { className: ['seq__route'] }, [text(step.over.map((id) => label.get(id)!).join(' · '))]),
          el('span', { className: ['seq__text'] }, lines(step.text)),
        ],
      );
    }
    const from = column.get(step.from)!;
    const to = column.get(step.to)!;
    return el(
      'li',
      {
        className: [
          'seq__step',
          step.reply ? 'seq__step--reply' : 'seq__step--message',
          to > from ? 'seq__step--right' : 'seq__step--left',
          ...span(from, to),
        ],
      },
      [
        el('span', { className: ['seq__route'] }, [text(`${label.get(step.from)} → ${label.get(step.to)}`)]),
        el('span', { className: ['seq__text'] }, lines(step.text)),
      ],
    );
  });

  return el('figure', { className: ['seq', `seq--n${seq.participants.length}`, 'not-content'] }, [
    el(
      'ol',
      { className: ['seq__participants'], ariaHidden: 'true' },
      seq.participants.map((p, i) =>
        el('li', { className: ['seq__participant', `seq-c${i + 1}`] }, [text(p.label)]),
      ),
    ),
    el('ol', { className: ['seq__steps'] }, steps),
  ]);
}
```

Run: `pnpm --filter web exec vitest run src/lib/diagrams/sequence.test.ts`
Expected: PASS.

- [ ] **Paso 4: tests y código de las cadenas**

`web/src/lib/diagrams/chain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseChain, renderChain } from './chain';
import { classList, findByClass, textContent } from './hast';

const TCP_IP = `flowchart TB
    A["Tu portátil<br/>aplicación · transporte · red · enlace"] -->|wifi| B["Router de casa<br/>red · enlace"]
    B -->|fibra| C["Routers de tu operador y de internet<br/>red · enlace"]
    C -->|cable| D["Servidor<br/>aplicación · transporte · red · enlace"]`;

describe('parseChain', () => {
  it('lee una cadena vertical de nodos con sus enlaces', () => {
    expect(parseChain(TCP_IP)).toEqual({
      nodes: [
        ['Tu portátil', 'aplicación · transporte · red · enlace'],
        ['Router de casa', 'red · enlace'],
        ['Routers de tu operador y de internet', 'red · enlace'],
        ['Servidor', 'aplicación · transporte · red · enlace'],
      ],
      edges: ['wifi', 'fibra', 'cable'],
    });
  });

  it.each([
    ['flowchart LR\nA["a"] -->|x| B["b"]', /Solo se admite «flowchart TB»/],
    ['flowchart TB\nA["a"] --> B["b"]', /Línea no admitida/],
    ['flowchart TB\nA["a"] -->|x| B["b"]\nA -->|y| C["c"]', /«A» tiene dos salidas/],
    ['flowchart TB\nA["a"] -->|x| B', /«B» no tiene texto/],
    ['flowchart TB\nA["a"] -->|x| B["b"]\nC["c"] -->|y| D["d"]', /una sola cadena/],
  ])('falla con un mensaje claro ante lo que no admite (%#)', (source, error) => {
    expect(() => parseChain(source)).toThrow(error);
  });
});

describe('renderChain', () => {
  const figure = renderChain(parseChain(TCP_IP));

  it('una lista ordenada: cada paso con su nodo y, menos el último, el enlace al siguiente', () => {
    expect(classList(figure)).toEqual(['chain', 'not-content']);
    expect(findByClass(figure, 'chain__name').map(textContent)).toEqual([
      'Tu portátil',
      'Router de casa',
      'Routers de tu operador y de internet',
      'Servidor',
    ]);
    expect(findByClass(figure, 'chain__edge').map(textContent)).toEqual(['wifi', 'fibra', 'cable']);
    expect(textContent(findByClass(figure, 'chain__detail')[0]!)).toBe(
      'aplicación · transporte · red · enlace',
    );
  });
});
```

`web/src/lib/diagrams/chain.ts`:

```ts
/**
 * Diagramas de flujo verticales con la sintaxis de Mermaid (flowchart TB), convertidos a HTML en el
 * build. Solo se admite una cadena: A["texto"] -->|enlace| B["texto"], sin ramas.
 */
import { el, text, type HastElement } from './hast';

export interface Chain {
  /** Las líneas de texto de cada nodo, en orden; la primera es su nombre. */
  nodes: string[][];
  /** El texto del enlace entre cada nodo y el siguiente. */
  edges: string[];
}

const EDGE = /^(\w+)(?:\["([^"]+)"\])?\s*-->\|([^|]+)\|\s*(\w+)(?:\["([^"]+)"\])?$/;
const splitText = (value: string) => value.split(/<br\s*\/?>/i).map((part) => part.trim());

export function parseChain(source: string): Chain {
  const [first, ...rest] = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (first !== 'flowchart TB') {
    throw new Error(`Solo se admite «flowchart TB» (de arriba abajo); este diagrama empieza por «${first}».`);
  }
  const labels = new Map<string, string>();
  const next = new Map<string, { to: string; edge: string }>();
  const incoming = new Set<string>();
  const nodes = new Set<string>();
  const define = (id: string, label: string | undefined) => {
    nodes.add(id);
    if (label === undefined) return;
    if (labels.has(id) && labels.get(id) !== label) throw new Error(`«${id}» tiene dos textos.`);
    labels.set(id, label);
  };

  for (const line of rest) {
    const match = EDGE.exec(line);
    if (!match) {
      throw new Error(`Línea no admitida: «${line}». Admitido: A["texto"] -->|enlace| B["texto"].`);
    }
    const [, from, fromLabel, edge, to, toLabel] = match;
    define(from!, fromLabel);
    define(to!, toLabel);
    if (next.has(from!)) throw new Error(`Solo se admite una cadena: «${from}» tiene dos salidas.`);
    if (incoming.has(to!)) throw new Error(`Solo se admite una cadena: «${to}» tiene dos entradas.`);
    next.set(from!, { to: to!, edge: edge!.trim() });
    incoming.add(to!);
  }

  if (next.size === 0) throw new Error('El diagrama no tiene ningún enlace.');
  for (const id of nodes) {
    if (!labels.has(id)) throw new Error(`«${id}» no tiene texto: escribe ${id}["…"] la primera vez que aparece.`);
  }
  const starts = [...nodes].filter((id) => !incoming.has(id));
  if (starts.length !== 1) throw new Error('El diagrama tiene que ser una sola cadena.');

  const chain: Chain = { nodes: [], edges: [] };
  let current: string | undefined = starts[0];
  while (current !== undefined) {
    chain.nodes.push(splitText(labels.get(current)!));
    const step = next.get(current);
    if (step) chain.edges.push(step.edge);
    current = step?.to;
  }
  if (chain.nodes.length !== nodes.size) throw new Error('El diagrama tiene que ser una sola cadena.');
  return chain;
}

export function renderChain(chain: Chain): HastElement {
  return el('figure', { className: ['chain', 'not-content'] }, [
    el(
      'ol',
      { className: ['chain__list'] },
      chain.nodes.map(([name, ...details], i) =>
        el('li', { className: ['chain__step'] }, [
          el('div', { className: ['chain__node'] }, [
            el('span', { className: ['chain__name'] }, [text(name!)]),
            ...details.map((detail) => el('span', { className: ['chain__detail'] }, [text(detail)])),
          ]),
          ...(i < chain.edges.length ? [el('p', { className: ['chain__edge'] }, [text(chain.edges[i]!)])] : []),
        ]),
      ),
    ),
  ]);
}
```

Run: `pnpm --filter web exec vitest run src/lib/diagrams/chain.test.ts`
Expected: PASS.

- [ ] **Paso 5: el plugin de remark**

`web/src/lib/diagrams/remark-diagrams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { remarkDiagrams } from './remark-diagrams';

interface Node {
  type: string;
  lang?: string;
  value?: string;
  children?: Node[];
  data?: { hName?: string; hProperties?: { className?: string[] } };
  position?: { start: { line: number } };
}

const rootWith = (code: Node): Node => ({
  type: 'root',
  children: [{ ...code, position: { start: { line: 12 } } }],
});

describe('remarkDiagrams', () => {
  it('cambia un bloque mermaid por la figura en HTML', () => {
    const root = rootWith({
      type: 'code',
      lang: 'mermaid',
      value: 'sequenceDiagram\nparticipant A as Uno\nparticipant B as Dos\nA->>B: hola',
    });
    remarkDiagrams()(root, { path: 'src/content/docs/fase-0/x.mdx' });
    const node = root.children![0]!;
    expect(node.type).toBe('paragraph');
    expect(node.data?.hName).toBe('figure');
    expect(node.data?.hProperties?.className).toEqual(['seq', 'seq--n2', 'not-content']);
  });

  it('no toca los demás bloques de código', () => {
    const root = rootWith({ type: 'code', lang: 'sh', value: 'curl example.com' });
    remarkDiagrams()(root, { path: 'x.mdx' });
    expect(root.children![0]).toMatchObject({ type: 'code', lang: 'sh' });
  });

  it('busca también dentro de otros nodos', () => {
    const root: Node = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [{ type: 'code', lang: 'mermaid', value: 'flowchart TB\nA["a"] -->|x| B["b"]' }],
        },
      ],
    };
    remarkDiagrams()(root, { path: 'x.mdx' });
    expect(root.children![0]!.children![0]!.data?.hName).toBe('figure');
  });

  it('un diagrama no admitido hace fallar el build, con el fichero y la línea', () => {
    const root = rootWith({ type: 'code', lang: 'mermaid', value: 'graph LR\nA --> B' });
    expect(() => remarkDiagrams()(root, { path: 'src/content/docs/fase-0/x.mdx' })).toThrow(
      /src\/content\/docs\/fase-0\/x\.mdx:12: Tipo de diagrama no admitido: «graph LR»/,
    );
  });
});
```

Run: `pnpm --filter web exec vitest run src/lib/diagrams/remark-diagrams.test.ts`
Expected: FAIL, porque no encuentra `./remark-diagrams`.

`web/src/lib/diagrams/remark-diagrams.ts`:

```ts
/**
 * Plugin de remark: cambia cada bloque ```mermaid por su diagrama en HTML (secuencias o cadenas).
 * Sin JavaScript en el navegador, con el texto en el HTML (lo leen los buscadores y los lectores de
 * pantalla) y con los colores del tema. Un diagrama que no se sabe dibujar hace fallar el build.
 */
import { renderChain, parseChain } from './chain';
import type { HastElement } from './hast';
import { parseSequence, renderSequence } from './sequence';

interface MdNode {
  type: string;
  lang?: string | null;
  value?: string;
  children?: MdNode[];
  data?: Record<string, unknown>;
  position?: { start: { line: number } };
}

export function diagramFromMermaid(source: string): HastElement {
  const kind = source.trim().split('\n')[0]?.trim();
  if (kind === 'sequenceDiagram') return renderSequence(parseSequence(source));
  if (kind === 'flowchart TB') return renderChain(parseChain(source));
  throw new Error(
    `Tipo de diagrama no admitido: «${kind}». Admitidos: sequenceDiagram y flowchart TB.`,
  );
}

export function remarkDiagrams() {
  return (tree: MdNode, file: { path?: string }) => {
    const visit = (node: MdNode) => {
      node.children?.forEach((child, i) => {
        if (child.type !== 'code' || child.lang !== 'mermaid') {
          visit(child);
          return;
        }
        let figure: HastElement;
        try {
          figure = diagramFromMermaid(child.value ?? '');
        } catch (error) {
          const where = `${file.path ?? '?'}:${child.position?.start.line ?? '?'}`;
          throw new Error(`[diagrams] ${where}: ${(error as Error).message}`);
        }
        // Un párrafo vacío que remark-rehype convierte en la figura (data.hName/hProperties/hChildren).
        node.children![i] = {
          type: 'paragraph',
          children: [],
          data: { hName: figure.tagName, hProperties: figure.properties, hChildren: figure.children },
        };
      });
    };
    visit(tree);
  };
}
```

Run: `pnpm --filter web exec vitest run src/lib/diagrams/remark-diagrams.test.ts`
Expected: PASS.

- [ ] **Paso 6: estilos**

`web/src/styles/diagrams.css`:

```css
/*
 * Diagramas generados desde bloques ```mermaid (src/lib/diagrams/). Son HTML: el texto conserva su
 * tamaño en móvil, sigue los colores del tema y lo leen los buscadores y los lectores de pantalla.
 */

/* --- Secuencias --- */
.seq {
  --seq-line: linear-gradient(var(--ide-border), var(--ide-border));
  container-type: inline-size;
  margin-block: 1.5rem;
  font-size: var(--sl-text-sm);
  line-height: 1.4;
}
.seq--n2 { --seq-columns: 2; }
.seq--n3 { --seq-columns: 3; }
.seq--n4 { --seq-columns: 4; }
.seq--n5 { --seq-columns: 5; }
.seq--n6 { --seq-columns: 6; }

.seq-c1 { grid-column-start: 1; }
.seq-c2 { grid-column-start: 2; }
.seq-c3 { grid-column-start: 3; }
.seq-c4 { grid-column-start: 4; }
.seq-c5 { grid-column-start: 5; }
.seq-c6 { grid-column-start: 6; }
.seq-s1 { grid-column-end: span 1; --seq-span: 1; }
.seq-s2 { grid-column-end: span 2; --seq-span: 2; }
.seq-s3 { grid-column-end: span 3; --seq-span: 3; }
.seq-s4 { grid-column-end: span 4; --seq-span: 4; }
.seq-s5 { grid-column-end: span 5; --seq-span: 5; }
.seq-s6 { grid-column-end: span 6; --seq-span: 6; }

.seq__participants,
.seq__steps {
  display: grid;
  grid-template-columns: repeat(var(--seq-columns), minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}
.seq__participant {
  margin-inline: 0.25rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.375rem;
  background: var(--ide-chrome);
  color: var(--ide-strong);
  font-family: var(--__sl-font-mono);
  font-size: var(--sl-text-xs);
  font-weight: 600;
  text-align: center;
  overflow-wrap: anywhere;
}

/* Las líneas de vida: una línea vertical en el centro de cada columna. */
.seq__steps {
  row-gap: 0.5rem;
  padding-block: 0.75rem;
  background-repeat: no-repeat;
  background-size: 1px 100%;
}
.seq--n2 .seq__steps {
  background-image: var(--seq-line), var(--seq-line);
  background-position: 25% 0, 75% 0;
}
.seq--n3 .seq__steps {
  background-image: var(--seq-line), var(--seq-line), var(--seq-line);
  background-position: 16.667% 0, 50% 0, 83.333% 0;
}
.seq--n4 .seq__steps {
  background-image: var(--seq-line), var(--seq-line), var(--seq-line), var(--seq-line);
  background-position: 12.5% 0, 37.5% 0, 62.5% 0, 87.5% 0;
}
.seq--n5 .seq__steps {
  background-image: var(--seq-line), var(--seq-line), var(--seq-line), var(--seq-line),
    var(--seq-line);
  background-position: 10% 0, 30% 0, 50% 0, 70% 0, 90% 0;
}
.seq--n6 .seq__steps {
  background-image: var(--seq-line), var(--seq-line), var(--seq-line), var(--seq-line),
    var(--seq-line), var(--seq-line);
  background-position: 8.333% 0, 25% 0, 41.667% 0, 58.333% 0, 75% 0, 91.667% 0;
}

.seq__step {
  position: relative;
  padding: 0.25rem 0.5rem 0.375rem;
  color: var(--ide-text);
  text-align: center;
}
/* Mensajes y respuestas: una flecha de centro a centro de las columnas de los dos participantes. */
.seq__step--message,
.seq__step--reply {
  margin-inline: calc(100% / var(--seq-span) / 2);
  border-bottom: 2px solid var(--ide-info);
}
.seq__step--reply {
  border-bottom-style: dashed;
  border-bottom-color: var(--ide-string);
}
.seq__step--message::after,
.seq__step--reply::after {
  content: '';
  position: absolute;
  bottom: -6px;
  border-block: 5px solid transparent;
}
.seq__step--right::after {
  right: -1px;
  border-left: 9px solid var(--ide-info);
}
.seq__step--left::after {
  left: -1px;
  border-right: 9px solid var(--ide-info);
}
.seq__step--reply.seq__step--right::after {
  border-left-color: var(--ide-string);
}
.seq__step--reply.seq__step--left::after {
  border-right-color: var(--ide-string);
}
.seq__step--note {
  margin-inline: 0.25rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.25rem;
  background: var(--ide-accent-low);
}
/* El texto tapa las líneas de vida que pasan por detrás. */
.seq__text {
  display: inline-block;
  padding-inline: 0.25rem;
  background: var(--sl-color-bg);
}
.seq__step--note .seq__text {
  background: none;
}
/* Quién habla a quién: lo oyen los lectores de pantalla; a la vista, lo dicen las flechas. */
.seq__route {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* Estrecho: una lista de pasos, cada uno con su «A → B» a la vista y sin flechas. */
@container (max-width: 40rem) {
  .seq__participants {
    display: none;
  }
  .seq__steps {
    display: flex;
    flex-direction: column;
    background: none;
  }
  .seq__step {
    text-align: start;
  }
  .seq__step--message,
  .seq__step--reply {
    margin-inline: 0;
    padding-inline-start: 0.75rem;
    border-bottom: 0;
    border-inline-start: 3px solid var(--ide-info);
  }
  .seq__step--reply {
    border-inline-start-style: dashed;
    border-inline-start-color: var(--ide-string);
  }
  .seq__step::after {
    display: none;
  }
  .seq__route {
    position: static;
    display: block;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip-path: none;
    white-space: normal;
    color: var(--ide-muted);
    font-family: var(--__sl-font-mono);
    font-size: var(--sl-text-xs);
  }
  .seq__text {
    padding-inline: 0;
    background: none;
  }
}

/* --- Cadenas (flowchart TB) --- */
.chain {
  margin-block: 1.5rem;
}
.chain__list {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chain__step {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 28rem);
}
.chain__node {
  width: 100%;
  padding: 0.625rem 1rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.375rem;
  background: var(--ide-chrome);
  text-align: center;
}
.chain__name {
  display: block;
  color: var(--ide-strong);
  font-weight: 700;
}
.chain__detail {
  display: block;
  color: var(--ide-muted);
  font-family: var(--__sl-font-mono);
  font-size: var(--sl-text-xs);
}
.chain__edge {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding-block: 0.25rem;
  color: var(--ide-info);
  font-family: var(--__sl-font-mono);
  font-size: var(--sl-text-xs);
}
.chain__edge::before {
  content: '';
  width: 2px;
  height: 0.75rem;
  background: currentColor;
}
.chain__edge::after {
  content: '';
  border-inline: 6px solid transparent;
  border-top: 8px solid currentColor;
}
```

En `web/src/styles/theme.css`:
- **borra** el bloque que empieza por el comentario `/* Diagramas Mermaid: si no caben…` y termina con `pre.mermaid { overflow-x: auto; }`;
- **cambia** las dos apariciones de `:is(table, pre.mermaid, astro-island)` por `:is(table, figure.seq, figure.chain, astro-island)`.

- [ ] **Paso 7: configuración y limpieza**

Run: `pnpm --filter web remove astro-mermaid mermaid && rm web/src/scripts/mermaid-min-width.ts web/src/components/overrides/MarkdownContent.astro && rmdir web/src/scripts`

En `web/astro.config.ts`:
- **quita** `import mermaid from 'astro-mermaid';` y la integración `mermaid({...})` con su comentario;
- **quita** `MarkdownContent: './src/components/overrides/MarkdownContent.astro',` de `components`;
- **añade** el plugin y la hoja de estilos:

```ts
import { remarkDiagrams } from './src/lib/diagrams/remark-diagrams';
```

```ts
export default defineConfig({
  site: siteUrl,
  // Los bloques ```mermaid se convierten en HTML al hacer el build (src/lib/diagrams/).
  markdown: { remarkPlugins: [remarkDiagrams] },
```

En `customCss`, después de `'./src/styles/theme.css',`: `'./src/styles/diagrams.css',`.

- [ ] **Paso 8: build**

Run: `pnpm build`
Expected:
- **log:** `[seo-audit] JavaScript más pesado: …`, con unos 250 KB como mucho en una lección con laboratorio, por debajo de 300; y `[seo-audit] 24 páginas auditadas, sin problemas.`;
- **diagramas:** `grep -rl 'class="seq' web/dist --include=index.html | wc -l` → `12`, y `grep -rl 'class="chain' web/dist --include=index.html | wc -l` → `2`.

- [ ] **Paso 9: comprobar en el navegador**

Run: `pnpm --filter web preview`, en segundo plano.

Con Playwright, en `/fase-0/que-es-dns/` (5 participantes) y `/fase-0/modelo-cliente-servidor/` (2):

- **A 1280 px, oscuro y claro:**
  - cabecera con los participantes;
  - flechas de centro a centro: azul y continua para los mensajes, verde y discontinua para las respuestas, con la punta hacia el destino;
  - notas con fondo de acento;
  - el texto legible sobre las líneas de vida.
- **A 375 px:** lista de pasos, cada uno con «Tu ordenador → Resolver» encima de su texto, sin flechas ni cabecera.
- **En `/fase-0/modelo-tcp-ip/`:** cuatro cajas en vertical, con «wifi», «fibra» y «cable» entre ellas.

Si algo se ve mal, corrige el CSS y repite el paso. Para el servidor y borra las capturas que deje Playwright en el proyecto, después de comprobar que son solo de esta tarea.

- [ ] **Paso 10: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 6: Título de la portada y migas en JSON-LD

**Ficheros:**
- Crear: `web/src/lib/structured-data.ts` (+ `.test.ts`)
- Modificar: `web/src/lib/sidebar.ts` (+ test), `web/src/routeData.ts`, `web/src/content/docs/index.mdx`, `web/src/content/docs/en/index.mdx` y `web/src/lib/seo/audit.ts` (+ test)

**Interfaces:**
- Consume: `currentLesson(sidebar, phases, locale)` (Tarea 4) y `localizedHref`.
- Produce: `phaseLabel(phase, locale)`, `breadcrumbJsonLd(crumbs, site)`, y las reglas `titleNotDuplicated` y `breadcrumbsOnPhasePages`.

- [ ] **Paso 1: reglas (en rojo en el build)**

Añade `breadcrumbsOnPhasePages` y `titleNotDuplicated` a los imports de `audit.test.ts`, estos bloques, y las dos reglas al final de la expectativa de `defaultRules`:

```ts
describe('titleNotDuplicated', () => {
  it('avisa si el título es «X | X»', () => {
    expect(titleNotDuplicated(input([page('/', { title: 'Backend desde cero: curso gratis para aprender backend' })]))).toEqual([]);
    expect(
      titleNotDuplicated(input([page('/', { title: 'Backend desde cero | Backend desde cero' })]))[0]?.rule,
    ).toBe('title');
  });
});

describe('breadcrumbsOnPhasePages', () => {
  const crumbs = (last: string) => ({
    '@type': 'BreadcrumbList',
    itemListElement: [{ item: `${SITE}/` }, { item: last }],
  });

  it('las páginas de una fase llevan migas que terminan en ellas mismas', () => {
    const pages = [
      page('/fase-0/que-es-dns/', { jsonLd: [crumbs(`${SITE}/fase-0/que-es-dns/`)] }),
      page('/en/phase-0/', { lang: 'en', jsonLd: [crumbs(`${SITE}/en/phase-0/`)] }),
    ];
    expect(breadcrumbsOnPhasePages(input(pages))).toEqual([]);
  });

  it('las páginas fuera de las fases no las necesitan', () => {
    expect(breadcrumbsOnPhasePages(input([page('/roadmap/')]))).toEqual([]);
  });

  it('avisa si faltan o si no terminan en la propia página', () => {
    const pages = [
      page('/fase-0/que-es-dns/'),
      page('/fase-0/tls-y-https/', { jsonLd: [crumbs(`${SITE}/fase-0/`)] }),
    ];
    expect(breadcrumbsOnPhasePages(input(pages)).map((i) => i.url)).toEqual([
      '/fase-0/que-es-dns/',
      '/fase-0/tls-y-https/',
    ]);
  });
});
```

En `audit.ts`, las reglas, también al final de `defaultRules`:

```ts
export const titleNotDuplicated = perPage('title', ({ facts }) => {
  const [name, site] = (facts.title ?? '').split(' | ');
  return name && name === site ? `el título repite el nombre de la web: «${facts.title}»` : undefined;
});

const PHASE_PAGE = /^(?:\/en)?\/(?:fase|phase)-\d+\//;

export const breadcrumbsOnPhasePages = perPage('breadcrumbs', ({ url, facts }, { site }) => {
  if (!PHASE_PAGE.test(url)) return undefined;
  const list = facts.jsonLd.find(
    (data) => (data as { '@type'?: unknown })['@type'] === 'BreadcrumbList',
  ) as { itemListElement?: { item?: string }[] } | undefined;
  const last = list?.itemListElement?.at(-1)?.item;
  return last === new URL(url, site).href
    ? undefined
    : 'le falta el BreadcrumbList (JSON-LD) que termina en la propia página';
});
```

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts && pnpm build`
Expected:
- **tests:** PASS;
- **build:** FAIL, con `[title]` en `/` y `/en/` y `[breadcrumbs]` en las 18 páginas de la Fase 0.

- [ ] **Paso 2: tests de `phaseLabel` y de las migas**

En `web/src/lib/sidebar.test.ts`, añade `phaseLabel` al import y este bloque:

```ts
describe('phaseLabel', () => {
  it('«Fase N · título» en cada idioma', () => {
    expect(phaseLabel(phase(0, 'available'), 'es')).toBe('Fase 0 · Título 0');
    expect(phaseLabel(phase(0, 'available'), 'en')).toBe('Phase 0 · Title 0');
  });
});
```

`web/src/lib/structured-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd } from './structured-data';

const SITE = 'https://backenddesdecero.com/';

describe('breadcrumbJsonLd', () => {
  it('es un BreadcrumbList de schema.org con posiciones desde 1 y URLs absolutas', () => {
    const json = breadcrumbJsonLd(
      [
        { name: 'Backend desde cero', url: '/' },
        { name: 'Fase 0 · Cómo funciona internet', url: '/fase-0/' },
        { name: 'DNS', url: '/fase-0/que-es-dns/' },
      ],
      SITE,
    );
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Backend desde cero', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Fase 0 · Cómo funciona internet', item: `${SITE}fase-0/` },
        { '@type': 'ListItem', position: 3, name: 'DNS', item: `${SITE}fase-0/que-es-dns/` },
      ],
    });
  });

  it('escapa «<» para que ningún texto pueda cerrar el <script>', () => {
    const json = breadcrumbJsonLd([{ name: '</script><b>', url: '/' }], SITE);
    expect(json).not.toContain('<');
    expect(JSON.parse(json).itemListElement[0].name).toBe('</script><b>');
  });
});
```

Run: `pnpm --filter web exec vitest run src/lib/sidebar.test.ts src/lib/structured-data.test.ts`
Expected: FAIL, porque no existen `phaseLabel` ni `./structured-data`.

- [ ] **Paso 3: implementar**

En `web/src/lib/sidebar.ts`:
- el import de locales pasa a ser `import { locales, type Locale } from './locales';`;
- se añade antes de `buildPhaseSidebar`:

```ts
const PHASE_WORD: Record<Locale, string> = { es: 'Fase', en: 'Phase' };

/** «Fase 0 · Cómo funciona internet»: el nombre de una fase en el menú y en las migas. */
export function phaseLabel(phase: Pick<Phase, 'number' | 'title'>, locale: Locale): string {
  return `${PHASE_WORD[locale]} ${phase.number} · ${phase.title[locale]}`;
}
```

- dentro de `buildPhaseSidebar`, `label` y `translations` pasan a ser `label: phaseLabel(phase, 'es'),` y `translations: { en: phaseLabel(phase, 'en') },`.

`web/src/lib/structured-data.ts`:

```ts
export interface Crumb {
  name: string;
  /** Ruta de la página: '/', '/fase-0/'… */
  url: string;
}

/** JSON-LD de las migas (schema.org BreadcrumbList), listo para un <script type="application/ld+json">. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[], site: string): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: new URL(crumb.url, site).href,
    })),
  };
  // Un «</script>» dentro del JSON cerraría la etiqueta antes de tiempo.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
```

En `web/src/routeData.ts`, añade estos imports:

```ts
import { phases } from './data/phases';
import { currentLesson } from './lib/explorer';
import { localizedHref } from './lib/links';
import { toLocale } from './lib/locales';
import { phaseLabel } from './lib/sidebar';
import { breadcrumbJsonLd } from './lib/structured-data';
```

Al final de la función, después de la línea de `alternateLinks`:

```ts
  // Migas para Google: portada › fase › lección.
  const locale = toLocale(route.locale);
  const current = currentLesson(route.sidebar, phases, locale);
  if (current) {
    const { phase, position } = current;
    const crumbs = [
      { name: route.siteTitle, url: localizedHref(locale) },
      { name: phaseLabel(phase, locale), url: position.links[0]!.href },
      ...(position.index > 0
        ? [{ name: route.entry.data.title, url: position.links[position.index]!.href }]
        : []),
    ];
    route.head.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      content: breadcrumbJsonLd(crumbs, context.site.href),
    });
  }
```

En el frontmatter de `web/src/content/docs/index.mdx`, después de `description`:

```yaml
head:
  - tag: title
    content: 'Backend desde cero: curso gratis para aprender backend'
```

Y en `web/src/content/docs/en/index.mdx`:

```yaml
head:
  - tag: title
    content: 'Backend from Scratch: a free course to learn backend'
```

- [ ] **Paso 4: tests y build**

Run: `pnpm --filter web exec vitest run src/lib/sidebar.test.ts src/lib/structured-data.test.ts && pnpm build`
Expected:
- **tests:** PASS;
- **build:** `[seo-audit] 24 páginas auditadas, sin problemas.`;
- **migas:** `grep -o '<script type="application/ld+json">[^<]*' web/dist/fase-0/que-es-dns/index.html` muestra un BreadcrumbList con «Backend desde cero», «Fase 0 · Cómo funciona internet» y el título de la lección;
- **portada:** `grep -o '<title>[^<]*' web/dist/index.html` → `<title>Backend desde cero: curso gratis para aprender backend`.

- [ ] **Paso 5: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 7: Imagen para redes de cada página

**Ficheros:**
- Crear: `web/src/lib/og/card.ts` (+ `.test.ts`) y `web/src/pages/og/[...route].png.ts`
- Modificar: `web/package.json`, `web/src/routeData.ts`, `web/astro.config.ts` y `web/src/lib/seo/audit.ts` (+ test)

**Interfaces:**
- Consume: `normalizeId` y `localeOfId` (Tarea 3), y `siteTitle` y `siteUrl` (Tarea 2).
- Produce:
  - `OG_SIZE`, `ogImagePath(id)`, `ogRouteParam(id)`, `ogFileLabel(id)` y `ogCard(input): SatoriNode`;
  - la regla `ogImageExists`;
  - las imágenes en `/og/<ruta>.png`.

- [ ] **Paso 1: regla (en rojo en el build)**

Añade `ogImageExists` a los imports de `audit.test.ts`, este bloque, y la regla al final de la expectativa de `defaultRules`:

```ts
describe('ogImageExists', () => {
  const files = new Set(['/og/fase-0/que-es-dns.png']);

  it('cada página tiene una imagen para redes que existe en el build', () => {
    const ok = page('/fase-0/que-es-dns/', { ogImage: `${SITE}/og/fase-0/que-es-dns.png` });
    expect(ogImageExists(input([ok], { files }))).toEqual([]);
  });

  it('avisa si falta, si apunta fuera de la web o si el fichero no existe', () => {
    const pages = [
      page('/a/'),
      page('/b/', { ogImage: 'https://otra.com/x.png' }),
      page('/c/', { ogImage: `${SITE}/og/c.png` }),
    ];
    expect(ogImageExists(input(pages, { files })).map((i) => i.message)).toEqual([
      'no tiene og:image',
      'og:image apunta fuera de la web: https://otra.com/x.png',
      'og:image apunta a /og/c.png, que no existe en el build',
    ]);
  });
});
```

En `audit.ts`, la regla, también al final de `defaultRules`:

```ts
export const ogImageExists = perPage('og-image', ({ facts }, { site, files }) => {
  if (!facts.ogImage) return 'no tiene og:image';
  const image = new URL(facts.ogImage);
  if (image.origin !== new URL(site).origin) return `og:image apunta fuera de la web: ${facts.ogImage}`;
  return files.has(image.pathname)
    ? undefined
    : `og:image apunta a ${image.pathname}, que no existe en el build`;
});
```

Run: `pnpm --filter web exec vitest run src/lib/seo/audit.test.ts && pnpm build`
Expected: tests PASS; el build FALLA con `[og-image] no tiene og:image` en las 24 páginas.

- [ ] **Paso 2: tests de la tarjeta**

`web/src/lib/og/card.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ogCard, ogFileLabel, ogImagePath, ogRouteParam } from './card';

describe('ogImagePath y ogRouteParam', () => {
  it('una imagen por página, con la ruta de la página', () => {
    expect(ogImagePath('fase-0/que-es-dns')).toBe('/og/fase-0/que-es-dns.png');
    expect(ogImagePath('en/phase-0/what-is-dns')).toBe('/og/en/phase-0/what-is-dns.png');
    expect(ogRouteParam('fase-0/que-es-dns')).toBe('fase-0/que-es-dns');
  });

  it('la portada en español es /og/index.png, venga como "index" o como ""', () => {
    expect(ogImagePath('')).toBe('/og/index.png');
    expect(ogImagePath('index')).toBe('/og/index.png');
    expect(ogImagePath('en')).toBe('/og/en.png');
  });
});

describe('ogFileLabel', () => {
  it('la ruta sin el idioma, como un fichero; las portadas, README.md', () => {
    expect(ogFileLabel('fase-0/que-es-dns')).toBe('fase-0/que-es-dns.md');
    expect(ogFileLabel('en/phase-0/what-is-dns')).toBe('phase-0/what-is-dns.md');
    expect(ogFileLabel('')).toBe('README.md');
    expect(ogFileLabel('en')).toBe('README.md');
  });
});

describe('ogCard', () => {
  const card = ogCard({
    title: 'Qué es el DNS',
    fileLabel: 'fase-0/que-es-dns.md',
    siteTitle: 'Backend desde cero',
    domain: 'backenddesdecero.com',
  });

  it('mide 1200 × 630, el tamaño que piden las redes', () => {
    expect(card.props.style).toMatchObject({ width: 1200, height: 630 });
  });

  it('lleva el fichero, el título, el nombre de la web y el dominio', () => {
    const json = JSON.stringify(card);
    for (const text of ['Qué es el DNS', 'fase-0/que-es-dns.md', 'Backend desde cero', 'backenddesdecero.com']) {
      expect(json).toContain(text);
    }
  });

  it('un título largo usa una letra más pequeña para caber', () => {
    const long = ogCard({
      title: 'Qué pasa cuando escribes una URL en el navegador',
      fileLabel: 'x.md',
      siteTitle: 's',
      domain: 'd',
    });
    expect(JSON.stringify(long)).toContain('"fontSize":60');
    expect(JSON.stringify(card)).toContain('"fontSize":76');
  });
});
```

Run: `pnpm --filter web exec vitest run src/lib/og/card.test.ts`
Expected: FAIL, porque no encuentra `./card`.

- [ ] **Paso 3: implementar la tarjeta**

`web/src/lib/og/card.ts`:

```ts
/**
 * La imagen que se ve al compartir una página en redes: una pestaña de editor con el fichero, el
 * título de la página y el nombre de la web. Es el árbol que dibuja satori
 * (src/pages/og/[...route].png.ts).
 */
import { normalizeId } from '../translations';

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Colores del tema oscuro (src/styles/theme.css). Si cambian allí, cámbialos aquí. */
const COLORS = {
  bg: '#1b1a23',
  chrome: '#15141c',
  border: '#2b2935',
  strong: '#ffffff',
  muted: '#9a93ae',
  keyword: '#c4a1ff',
  accent: '#ff9e64',
};

export interface SatoriNode {
  type: 'div';
  props: { style: Record<string, string | number>; children?: string | SatoriNode[] };
}

const div = (style: SatoriNode['props']['style'], children?: string | SatoriNode[]): SatoriNode => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

/** Lo que va entre /og/ y .png: la ruta de la página; las portadas, "index" y "en". */
export function ogRouteParam(id: string): string {
  return normalizeId(id) || 'index';
}

export function ogImagePath(id: string): string {
  return `/og/${ogRouteParam(id)}.png`;
}

/** El «fichero» de la pestaña: la ruta sin el idioma; las portadas, README.md. */
export function ogFileLabel(id: string): string {
  const path = normalizeId(id).replace(/^en(?:\/|$)/, '');
  return path ? `${path}.md` : 'README.md';
}

export interface OgCardInput {
  title: string;
  fileLabel: string;
  siteTitle: string;
  domain: string;
}

export function ogCard({ title, fileLabel, siteTitle, domain }: OgCardInput): SatoriNode {
  return div(
    {
      width: OG_SIZE.width,
      height: OG_SIZE.height,
      flexDirection: 'column',
      background: COLORS.bg,
      fontFamily: 'Atkinson',
    },
    [
      div({ height: 72, alignItems: 'flex-end', paddingLeft: 48, background: COLORS.chrome, borderBottom: `2px solid ${COLORS.border}` }, [
        div(
          {
            padding: '14px 28px',
            background: COLORS.bg,
            borderTop: `3px solid ${COLORS.accent}`,
            color: COLORS.strong,
            fontFamily: 'JetBrains Mono',
            fontSize: 26,
          },
          fileLabel,
        ),
      ]),
      div({ flex: 1, alignItems: 'center', padding: '48px 72px' }, [
        div(
          { color: COLORS.strong, fontSize: title.length > 32 ? 60 : 76, fontWeight: 700, lineHeight: 1.15 },
          title,
        ),
      ]),
      div(
        { justifyContent: 'space-between', padding: '0 72px 48px', fontFamily: 'JetBrains Mono', fontSize: 28 },
        [div({ color: COLORS.keyword }, siteTitle), div({ color: COLORS.muted }, domain)],
      ),
    ],
  );
}
```

Run: `pnpm --filter web exec vitest run src/lib/og/card.test.ts`
Expected: PASS.

- [ ] **Paso 4: dependencias y la ruta que genera los PNG**

Run: `pnpm --filter web add satori @resvg/resvg-js @fontsource/atkinson-hyperlegible-next @fontsource/jetbrains-mono`

`web/src/pages/og/[...route].png.ts`:

```ts
/**
 * Un PNG de 1200 × 630 por página, para cuando se comparte en redes (og:image). Se genera en el
 * build con satori (árbol → SVG) y resvg (SVG → PNG). Satori no lee woff2, así que se usan los
 * woff de las fuentes estáticas.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import fs from 'node:fs';
import path from 'node:path';
import { siteTitle, siteUrl } from '~/data/site';
import { OG_SIZE, ogCard, ogFileLabel, ogRouteParam } from '~/lib/og/card';
import { localeOfId, normalizeId } from '~/lib/translations';

// El build se ejecuta en web/ (pnpm --filter web build), donde pnpm enlaza las dependencias.
const font = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), 'node_modules', '@fontsource', file));
const fonts = [
  {
    name: 'Atkinson',
    data: font('atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff'),
    weight: 700 as const,
    style: 'normal' as const,
  },
  {
    name: 'JetBrains Mono',
    data: font('jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'),
    weight: 400 as const,
    style: 'normal' as const,
  },
];

export const getStaticPaths = (async () => {
  const docs = await getCollection('docs');
  return docs.map((doc) => ({
    params: { route: ogRouteParam(doc.id) },
    props: { id: normalizeId(doc.id), title: doc.data.title },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { id, title } = props as { id: string; title: string };
  const card = ogCard({
    title,
    fileLabel: ogFileLabel(id),
    siteTitle: siteTitle[localeOfId(id)],
    domain: new URL(siteUrl).host,
  });
  const svg = await satori(card as unknown as Parameters<typeof satori>[0], { ...OG_SIZE, fonts });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
```

En `web/src/routeData.ts`, importa `import { OG_SIZE, ogImagePath } from './lib/og/card';` y añade justo después de `if (!context.site) return;`:

```ts
  // La imagen que se ve al compartir la página (src/pages/og/[...route].png.ts). La 404 no tiene.
  const is404 = route.entry.id === '404' || route.entry.id.endsWith('/404');
  if (!is404) {
    route.head.push(
      { tag: 'meta', attrs: { property: 'og:image', content: new URL(ogImagePath(route.entry.id), context.site).href } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: String(OG_SIZE.width) } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: String(OG_SIZE.height) } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: route.entry.data.title } },
    );
  }
```

En `web/astro.config.ts`, el sitemap deja fuera también las imágenes:

```ts
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        return !fallbacks.has(pathname) && !pathname.startsWith('/og/');
      },
    }),
```

- [ ] **Paso 5: build y comprobación visual**

Run: `pnpm build`
Expected: `[seo-audit] 24 páginas auditadas, sin problemas.`. `ls web/dist/og/fase-0/` lista 8 PNG, uno por lección; el de la introducción está en `web/dist/og/fase-0.png`.

Abre con la herramienta de lectura de imágenes `web/dist/og/fase-0/que-es-dns.png` y `web/dist/og/index.png`. Esperado:
- fondo oscuro;
- una pestaña con `fase-0/que-es-dns.md` (o `README.md` en la portada), con borde naranja arriba;
- el título grande en blanco, con las tildes bien;
- abajo, «Backend desde cero» en morado y `backenddesdecero.com` en gris.

Si algo no cabe o no se lee, ajusta los tamaños en `card.ts`, actualiza el test de `fontSize` y repite.

- [ ] **Paso 6: suite, tipos y formato**

Run: `pnpm test && pnpm check && pnpm format:check`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 8: Documentación

**Ficheros:**
- Modificar: `docs/style-guide.md`, `docs/pendientes.md`, `docs/specs/2026-10-03-seo-design.md` y `CLAUDE.md`

- [ ] **Paso 1: guía de estilo**

En `docs/style-guide.md`, cambia la sección «Diagramas», en su viñeta de Mermaid y sus dos subviñetas, por:

```markdown
- **Secuencias y cadenas:** un bloque ```` ```mermaid ````. Al hacer el build se convierte en HTML (`web/src/lib/diagrams/`): sin JavaScript, con los colores del tema, y con el texto en la página para los buscadores y los lectores de pantalla. Los textos van en el idioma de la lección. Solo se admite:
  - `sequenceDiagram` con entre 2 y 6 participantes: `participant X as Nombre`, `X->>Y: texto` (mensaje), `X-->>Y: texto` (respuesta) y `Note over X: texto` o `Note over X,Y: texto`. `<br/>` parte una línea;
  - `flowchart TB` en cadena, sin ramas: `A["Nombre<br/>detalle"] -->|enlace| B["…"]`.

  Cualquier otra cosa hace fallar el build con el fichero y la línea. Para otros diagramas, un componente propio (siguiente punto).
```

Y añade una sección nueva al final, antes de la última si es de referencias:

```markdown
## Rutas, traducciones y SEO

- **Rutas:** el español va en la raíz y el inglés en `/en/`. Cada fase tiene su carpeta en cada idioma (`fase-N` y `phase-N`), y cada lección su nombre de fichero en su idioma, que es su URL (`fase-0/que-es-dns.mdx`, `en/phase-0/what-is-dns.mdx`). Las rutas no se cambian una vez publicadas.
- **`translationKey`:** las dos versiones de una lección llevan la misma en el frontmatter (el nombre en inglés corto: `dns`). Es lo que las une para el selector de idioma, los `hreflang` y Google. `prerequisites` usa estas claves: `[tcp-vs-udp]`.
- **Enlaces internos:** con la ruta del idioma de la página (`/fase-0/que-es-dns/` o `/en/phase-0/what-is-dns/`).
- **Auditoría SEO:** el build falla si una página rompe alguna regla de `web/src/lib/seo/audit.ts`. Por ejemplo:
  - un `<h1>`, título y descripción;
  - canónica, sitemap y `hreflang` recíprocos;
  - nada de copias de respaldo;
  - migas e imagen para redes;
  - como mucho 300 KB de JavaScript por página.

  Si falla, el log dice la página y la regla.
```

- [ ] **Paso 2: pendientes, spec y CLAUDE.md**

**`docs/pendientes.md`:**
- en «SEO: estructura de las URLs», marca la casilla `[x]` y añade «Implementado (plan `docs/plans/2026-10-03-seo-tecnico.md`)»;
- en los menores técnicos aplazados, tacha «Los diagramas Mermaid no llevan `accTitle`/`accDescr`» con `~~…~~` y añade «Resuelto: los diagramas son HTML»;
- añade a «Revisión de contenido»:
  - `[ ]` Revisar el diseño de la imagen para redes (`web/dist/og/…`, generada por `web/src/lib/og/card.ts`);
  - `[ ]` Títulos y descripciones de las lecciones según lo que busca la gente (`docs/specs/2026-10-03-seo-design.md`, §4) y revisión «para todos los públicos»: un plan de contenido aparte. La portada aún dice «Para quien ya programa… No explicamos qué es una variable», y choca con la decisión de público;
- añade a «Decisiones»:
  - `[ ]` **Antes de publicar:** pasar Lighthouse con un móvil simulado, dar de alta Google Search Console y Bing Webmaster Tools, y comprobar las migas con la prueba de resultados enriquecidos de Google;
  - `[ ]` **En Cloudflare,** el build tiene que ejecutarse en `web/` (con `pnpm --filter web build` desde la raíz vale): las imágenes para redes leen las fuentes de `web/node_modules`.

**`docs/specs/2026-10-03-seo-design.md`:**
- en la cabecera, `Estado` pasa a ser «§2.1, §2.2 y §2.3 decididas; §2.2 y §3 implementadas el 2026-10-03 (`docs/plans/2026-10-03-seo-tecnico.md`), salvo Lighthouse».

**`CLAUDE.md`:**
- en «Decisiones ya tomadas», después de la línea del público:

```markdown
- Rutas y SEO técnico: español en la raíz, rutas traducidas unidas por `translationKey`, y una auditoría SEO que hace fallar el build (`docs/plans/2026-10-03-seo-tecnico.md`; reglas en `docs/style-guide.md`, «Rutas, traducciones y SEO»).
```

- [ ] **Paso 3: verificación final**

Run: `pnpm format:check && pnpm check && pnpm test && pnpm build`
Expected:
- **formato:** sin cambios pendientes;
- **tipos:** 0 errores;
- **tests:** todos en verde;
- **build:** `[drop-fallbacks] 9 copias de respaldo borradas`, `All internal links are valid.` y `[seo-audit] 24 páginas auditadas, sin problemas.`

Sin commit.

---

## Fuera de este plan

- Títulos y descripciones nuevos (§4 del spec) y la revisión «para todos los públicos»: un plan de contenido, que revisa el autor.
- Lighthouse, Search Console, la prueba de resultados enriquecidos y el despliegue: cuando el autor lo pida, ya con el dominio comprado.
- Datos estructurados `Course`: Google exige datos de oferta y de convocatoria que un curso gratuito y abierto no tiene. Solo `BreadcrumbList`.
