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
  it('a page with one <h1> passes; with zero or two, it does not', () => {
    expect(oneH1(input([page('/')]))).toEqual([]);
    const issues = oneH1(input([page('/a/', { h1Count: 0 }), page('/b/', { h1Count: 2 })]));
    expect(issues.map((i) => i.url)).toEqual(['/a/', '/b/']);
  });
});

describe('titleAndDescription', () => {
  it('requires a non-empty title and description', () => {
    expect(titleAndDescription(input([page('/')]))).toEqual([]);
    const issues = titleAndDescription(
      input([page('/a/', { title: '' }), page('/b/', { description: undefined })]),
    );
    expect(issues.map((i) => i.url)).toEqual(['/a/', '/b/']);
  });
});

describe('langMatchesUrl', () => {
  it('lang="en" under /en/ and lang="es" elsewhere', () => {
    const pages = [
      page('/'),
      page('/fase-0/que-es-dns/'),
      page('/en/', { lang: 'en' }),
      page('/en/phase-0/', { lang: 'en' }),
    ];
    expect(langMatchesUrl(input(pages))).toEqual([]);
    expect(langMatchesUrl(input([page('/en/roadmap/', { lang: 'es' })]))[0]?.message).toMatch(
      /should be "en"/,
    );
  });
});

describe('auditSite', () => {
  it('collects the problems of the rules passed to it', () => {
    const issues = auditSite(input([page('/', { h1Count: 2, description: undefined })]), [
      oneH1,
      titleAndDescription,
    ]);
    expect(issues.map((i) => i.rule).sort()).toEqual(['one-h1', 'title-description']);
  });

  it("defaultRules are the site's rules", () => {
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
  it('the canonical is the absolute URL of the page itself', () => {
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

  it('the sitemap lists exactly the pages of the build', () => {
    expect(sitemapMatchesPages(input(pages, { sitemap: [`${SITE}/`, `${SITE}/en/`] }))).toEqual([]);
  });

  it('reports missing pages and extra URLs', () => {
    const issues = sitemapMatchesPages(
      input(pages, { sitemap: [`${SITE}/`, `${SITE}/en/fase-0/`] }),
    );
    expect(issues.map((i) => [i.url, i.message])).toEqual([
      ['/en/', 'missing from the sitemap'],
      ['/en/fase-0/', 'is in the sitemap, but is not a page of the build'],
    ]);
  });

  it('no sitemap is a problem', () => {
    expect(sitemapMatchesPages(input(pages))[0]?.message).toBe('there is no sitemap');
  });
});

describe('robotsTxtPointsToSitemap', () => {
  const ok = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap-index.xml\n`;

  it('robots.txt exists, points to the sitemap and does not block the site', () => {
    expect(robotsTxtPointsToSitemap(input([], { robotsTxt: ok }))).toEqual([]);
    expect(robotsTxtPointsToSitemap(input([]))[0]?.message).toBe('does not exist');
    expect(
      robotsTxtPointsToSitemap(input([], { robotsTxt: 'User-agent: *\nAllow: /\n' }))[0]?.message,
    ).toMatch(/is missing the line/);
    expect(
      robotsTxtPointsToSitemap(input([], { robotsTxt: `${ok}Disallow: /\n` }))[0]?.message,
    ).toMatch(/blocks the whole site/);
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

  it('passes if both pages declare each other, with x-default', () => {
    const pages = [
      page('/fase-0/que-es-dns/', { alternates: pair }),
      page('/en/phase-0/what-is-dns/', { lang: 'en', alternates: pair }),
    ];
    expect(hreflangReciprocal(input(pages))).toEqual([]);
  });

  it('a page without hreflang is not checked', () => {
    expect(hreflangReciprocal(input([page('/fase-1/x/')]))).toEqual([]);
  });

  it('reports a link to a page that does not exist (the same path with another prefix)', () => {
    const wrong = [
      { hreflang: 'es', href: es },
      { hreflang: 'en', href: `${SITE}/en/fase-0/que-es-dns/` },
      { hreflang: 'x-default', href: es },
    ];
    const issues = hreflangReciprocal(input([page('/fase-0/que-es-dns/', { alternates: wrong })]));
    expect(issues.map((i) => i.message)).toEqual([
      `en points to ${SITE}/en/fase-0/que-es-dns/, which is not a page of the build`,
    ]);
  });

  it('reports if it does not include itself, if x-default is missing or if the other page does not declare it back', () => {
    const pages = [
      page('/fase-0/que-es-dns/', { alternates: [{ hreflang: 'en', href: en }] }),
      page('/en/phase-0/what-is-dns/', { lang: 'en' }),
    ];
    expect(hreflangReciprocal(input(pages)).map((i) => i.message)).toEqual([
      'does not include itself',
      'has no x-default',
      `${en} does not declare it back`,
    ]);
  });
});

describe('noFallbackCopies', () => {
  it('no page of the build has noindex: fallback copies are deleted', () => {
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

  it('the selector leads to the same pages as the hreflang', () => {
    const ok = page('/fase-0/que-es-dns/', {
      alternates,
      languageOptions: ['/fase-0/que-es-dns/', '/en/phase-0/what-is-dns/'],
    });
    expect(languageSelectorMatchesHreflang(input([ok]))).toEqual([]);
  });

  it('reports if the selector leads to the same path with another prefix', () => {
    const wrong = page('/fase-0/que-es-dns/', {
      alternates,
      languageOptions: ['/fase-0/que-es-dns/', '/en/fase-0/que-es-dns/'],
    });
    expect(languageSelectorMatchesHreflang(input([wrong]))[0]?.message).toBe(
      'the language selector does not lead to /en/phase-0/what-is-dns/',
    );
  });
});

describe('noLegacySpanishPrefix', () => {
  it('Spanish lives at the root: there are no pages under /es/', () => {
    expect(noLegacySpanishPrefix(input([page('/fase-0/'), page('/')]))).toEqual([]);
    expect(noLegacySpanishPrefix(input([page('/es/phase-0/')]))[0]?.url).toBe('/es/phase-0/');
  });
});

describe('noMermaid', () => {
  it('no unconverted Mermaid diagram', () => {
    expect(noMermaid(input([page('/')]))).toEqual([]);
    expect(noMermaid(input([page('/a/', { mermaidBlocks: 2 })]))[0]?.message).toMatch(
      /2 Mermaid diagrams/,
    );
  });
});

describe('jsBudget', () => {
  it('no page can download more than 400 KB of JavaScript', () => {
    expect(JS_BUDGET_BYTES).toBe(400 * 1024);
    expect(jsBudget(input([page('/', {}, JS_BUDGET_BYTES)]))).toEqual([]);
    expect(jsBudget(input([page('/a/', {}, JS_BUDGET_BYTES + 1)]))[0]?.message).toMatch(
      /the limit is 400 KB/,
    );
  });
});

describe('titleNotDuplicated', () => {
  it('reports if the title is «X | X»', () => {
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

  it('phase pages have breadcrumbs that end at themselves', () => {
    const pages = [
      page('/fase-0/que-es-dns/', { jsonLd: [crumbs(`${SITE}/fase-0/que-es-dns/`)] }),
      page('/en/phase-0/', { lang: 'en', jsonLd: [crumbs(`${SITE}/en/phase-0/`)] }),
    ];
    expect(breadcrumbsOnPhasePages(input(pages))).toEqual([]);
  });

  it('pages outside the phases do not need them', () => {
    expect(breadcrumbsOnPhasePages(input([page('/roadmap/')]))).toEqual([]);
  });

  it('reports if they are missing or do not end at the page itself', () => {
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

  it('each page has a social image that exists in the build', () => {
    const ok = page('/fase-0/que-es-dns/', { ogImage: `${SITE}/og/fase-0/que-es-dns.png` });
    expect(ogImageExists(input([ok], { files }))).toEqual([]);
  });

  it('reports if it is missing, points outside the site or the file does not exist', () => {
    const pages = [
      page('/a/'),
      page('/b/', { ogImage: 'https://otra.com/x.png' }),
      page('/c/', { ogImage: `${SITE}/og/c.png` }),
    ];
    expect(ogImageExists(input(pages, { files })).map((i) => i.message)).toEqual([
      'has no og:image',
      'og:image points outside the site: https://otra.com/x.png',
      'og:image points to /og/c.png, which does not exist in the build',
    ]);
  });
});

describe('internalLinksResolve', () => {
  const files = new Set(['/index.html', '/fase-0/index.html', '/favicon.svg', '/og/index.png']);

  it('internal links lead to files of the build; external links and anchors are not checked', () => {
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

  it('reports links to pages that do not exist, like a phase that only exists in Spanish', () => {
    const issues = internalLinksResolve(
      input([page('/en/', { lang: 'en', links: ['/en/phase-1/', '/en/phase-1/'] })], { files }),
    );
    expect(issues.map((i) => i.message)).toEqual([
      'links to pages that do not exist in the build: /en/phase-1/',
    ]);
  });
});

describe('titleLength', () => {
  it('the <title> is at most 70 characters; an accented letter counts as one', () => {
    expect(TITLE_MAX).toBe(70);
    expect(titleLength(input([page('/', { title: 'á'.repeat(70) })]))).toEqual([]);
    expect(titleLength(input([page('/a/', { title: 'x'.repeat(71) })]))[0]?.message).toMatch(
      /71 characters/,
    );
  });
});

describe('descriptionLength', () => {
  it('the description is between 70 and 155 characters', () => {
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

  it('no description is not reported here: titleAndDescription already does', () => {
    expect(descriptionLength(input([page('/', { description: undefined })]))).toEqual([]);
  });
});

describe('ogImageExists with encoded paths', () => {
  it('compares the decoded path: an image with an accent exists', () => {
    const files = new Set(['/og/fase-1/introducción.png']);
    const withAccent = page('/a/', { ogImage: `${SITE}/og/fase-1/introducci%C3%B3n.png` });
    expect(ogImageExists(input([withAccent], { files }))).toEqual([]);
  });
});

describe('noFallbackCopies: the message', () => {
  it('explains the two possible causes of a noindex', () => {
    const [issue] = noFallbackCopies(input([page('/x/', { robots: 'noindex' })]));
    expect(issue?.message).toMatch(/fallback copy/);
    expect(issue?.message).toMatch(/on purpose/);
  });
});
