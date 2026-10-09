import { describe, expect, it } from 'vitest';
import {
  auditSite,
  breadcrumbsOnPhasePages,
  canonicalIsSelf,
  defaultRules,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  descriptionLength,
  hreflangReciprocal,
  internalLinksResolve,
  JS_BUDGET_BYTES,
  jsBudget,
  langMatchesUrl,
  languageSelectorMatchesHreflang,
  noFallbackCopies,
  noLegacySpanishPrefix,
  noMermaid,
  ogImageExists,
  oneH1,
  robotsTxtPointsToSitemap,
  sitemapMatchesPages,
  TITLE_MAX,
  titleAndDescription,
  titleLength,
  titleNotDuplicated,
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
  links: [],
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
    expect(defaultRules).toEqual([
      oneH1,
      titleAndDescription,
      langMatchesUrl,
      canonicalIsSelf,
      sitemapMatchesPages,
      robotsTxtPointsToSitemap,
      hreflangReciprocal,
      noFallbackCopies,
      languageSelectorMatchesHreflang,
      noLegacySpanishPrefix,
      noMermaid,
      jsBudget,
      titleNotDuplicated,
      breadcrumbsOnPhasePages,
      ogImageExists,
      internalLinksResolve,
      titleLength,
      descriptionLength,
    ]);
  });
});

describe('canonicalIsSelf', () => {
  it('la canónica es la URL absoluta de la propia página', () => {
    expect(canonicalIsSelf(input([page('/fase-0/', { canonical: `${SITE}/fase-0/` })]))).toEqual(
      [],
    );
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

describe('noLegacySpanishPrefix', () => {
  it('el español vive en la raíz: no hay páginas bajo /es/', () => {
    expect(noLegacySpanishPrefix(input([page('/fase-0/'), page('/')]))).toEqual([]);
    expect(noLegacySpanishPrefix(input([page('/es/phase-0/')]))[0]?.url).toBe('/es/phase-0/');
  });
});

describe('noMermaid', () => {
  it('ningún diagrama Mermaid sin convertir', () => {
    expect(noMermaid(input([page('/')]))).toEqual([]);
    expect(noMermaid(input([page('/a/', { mermaidBlocks: 2 })]))[0]?.message).toMatch(
      /2 diagramas/,
    );
  });
});

describe('jsBudget', () => {
  it('ninguna página puede descargar más de 400 KB de JavaScript', () => {
    expect(JS_BUDGET_BYTES).toBe(400 * 1024);
    expect(jsBudget(input([page('/', {}, JS_BUDGET_BYTES)]))).toEqual([]);
    expect(jsBudget(input([page('/a/', {}, JS_BUDGET_BYTES + 1)]))[0]?.message).toMatch(
      /el límite es 400 KB/,
    );
  });
});

describe('titleNotDuplicated', () => {
  it('avisa si el título es «X | X»', () => {
    expect(
      titleNotDuplicated(
        input([page('/', { title: 'Backend desde cero: curso gratis para aprender backend' })]),
      ),
    ).toEqual([]);
    expect(
      titleNotDuplicated(
        input([page('/', { title: 'Backend desde cero | Backend desde cero' })]),
      )[0]?.rule,
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

describe('internalLinksResolve', () => {
  const files = new Set(['/index.html', '/fase-0/index.html', '/favicon.svg', '/og/index.png']);

  it('los enlaces internos llevan a ficheros del build; los externos y las anclas no se comprueban', () => {
    const ok = page('/fase-0/', {
      links: [
        '/',
        '/fase-0/',
        '#_top',
        '/favicon.svg',
        'https://otra.com/x/',
        'mailto:a@b.c',
        '../',
      ],
    });
    expect(internalLinksResolve(input([ok], { files }))).toEqual([]);
  });

  it('avisa de los enlaces a páginas que no existen, como una fase que solo está en español', () => {
    const issues = internalLinksResolve(
      input([page('/en/', { lang: 'en', links: ['/en/phase-1/', '/en/phase-1/'] })], { files }),
    );
    expect(issues.map((i) => i.message)).toEqual([
      'enlaza a páginas que no existen en el build: /en/phase-1/',
    ]);
  });
});

describe('titleLength', () => {
  it('el <title> no pasa de 70 caracteres; una tilde cuenta como uno', () => {
    expect(TITLE_MAX).toBe(70);
    expect(titleLength(input([page('/', { title: 'á'.repeat(70) })]))).toEqual([]);
    expect(titleLength(input([page('/a/', { title: 'x'.repeat(71) })]))[0]?.message).toMatch(
      /71 caracteres/,
    );
  });
});

describe('descriptionLength', () => {
  it('la descripción tiene entre 70 y 155 caracteres', () => {
    expect([DESCRIPTION_MIN, DESCRIPTION_MAX]).toEqual([70, 155]);
    const ok = [
      page('/', { description: 'é'.repeat(155) }),
      page('/b/', { description: 'x'.repeat(70) }),
    ];
    expect(descriptionLength(input(ok))).toEqual([]);
    const wrong = [
      page('/a/', { description: 'x'.repeat(156) }),
      page('/c/', { description: 'x'.repeat(69) }),
    ];
    expect(descriptionLength(input(wrong)).map((i) => i.url)).toEqual(['/a/', '/c/']);
  });

  it('sin descripción no avisa: eso ya lo dice titleAndDescription', () => {
    expect(descriptionLength(input([page('/', { description: undefined })]))).toEqual([]);
  });
});

describe('ogImageExists con rutas codificadas', () => {
  it('compara la ruta sin codificar: una imagen con tilde existe', () => {
    const files = new Set(['/og/fase-1/introducción.png']);
    const withAccent = page('/a/', { ogImage: `${SITE}/og/fase-1/introducci%C3%B3n.png` });
    expect(ogImageExists(input([withAccent], { files }))).toEqual([]);
  });
});

describe('noFallbackCopies: el mensaje', () => {
  it('explica las dos causas posibles de un noindex', () => {
    const [issue] = noFallbackCopies(input([page('/x/', { robots: 'noindex' })]));
    expect(issue?.message).toMatch(/copia de respaldo/);
    expect(issue?.message).toMatch(/a propósito/);
  });
});
