/**
 * SEO audit rules. Each rule receives the whole build and returns its problems; the build fails if
 * there are any (src/integrations/seo-audit.ts). They are pure functions, with tests.
 */
import type { PageFacts } from './page';

export interface AuditPage {
  /** Public path of the page: '/', '/fase-0/que-es-dns/'… */
  url: string;
  facts: PageFacts;
  /** JavaScript the page can download, in bytes. */
  jsBytes: number;
}

export interface AuditInput {
  /** The site's domain (Astro's `site`). */
  site: string;
  pages: AuditPage[];
  /** Sitemap URLs, or undefined if there is no sitemap. */
  sitemap: string[] | undefined;
  robotsTxt: string | undefined;
  /** All the files of the build, as public paths ('/og/index.png'). */
  files: Set<string>;
}

export interface Issue {
  url: string;
  rule: string;
  message: string;
}

export type Rule = (input: AuditInput) => Issue[];

/** A rule that looks at each page separately: `check` returns the problem or undefined. */
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
  facts.h1Count === 1 ? undefined : `has ${facts.h1Count} <h1>; it must have exactly one`,
);

export const titleAndDescription = perPage('title-description', ({ facts }) => {
  if (!facts.title) return 'has no <title>';
  if (!facts.description) return 'has no meta description';
  return undefined;
});

export const langMatchesUrl = perPage('lang', ({ url, facts }) => {
  const expected = url === '/en/' || url.startsWith('/en/') ? 'en' : 'es';
  return facts.lang === expected
    ? undefined
    : `lang="${facts.lang}", but by its URL it should be "${expected}"`;
});

export const canonicalIsSelf = perPage('canonical', ({ url, facts }, { site }) => {
  const expected = new URL(url, site).href;
  return facts.canonical === expected
    ? undefined
    : `canonical="${facts.canonical}", but it should be ${expected}`;
});

export const sitemapMatchesPages: Rule = ({ site, pages, sitemap }) => {
  if (sitemap === undefined)
    return [{ url: '/sitemap-0.xml', rule: 'sitemap', message: 'there is no sitemap' }];
  const pageUrls = new Set(pages.map((p) => new URL(p.url, site).href));
  const listed = new Set(sitemap);
  return [
    ...[...pageUrls]
      .filter((u) => !listed.has(u))
      .map((u) => ({
        url: new URL(u).pathname,
        rule: 'sitemap',
        message: 'missing from the sitemap',
      })),
    ...sitemap
      .filter((u) => !pageUrls.has(u))
      .map((u) => ({
        url: new URL(u).pathname,
        rule: 'sitemap',
        message: 'is in the sitemap, but is not a page of the build',
      })),
  ];
};

export const robotsTxtPointsToSitemap: Rule = ({ site, robotsTxt }) => {
  const issue = (message: string) => [{ url: '/robots.txt', rule: 'robots', message }];
  if (robotsTxt === undefined) return issue('does not exist');
  const line = `Sitemap: ${new URL('/sitemap-index.xml', site).href}`;
  if (!robotsTxt.split('\n').some((l) => l.trim() === line))
    return issue(`is missing the line «${line}»`);
  if (/^Disallow:\s*\/\s*$/m.test(robotsTxt)) return issue('blocks the whole site (Disallow: /)');
  return [];
};
/** If a page declares hreflang: it includes itself, has x-default, and each alternate exists and declares it back. */
export const hreflangReciprocal: Rule = ({ site, pages }) => {
  const byHref = new Map(pages.map((p) => [new URL(p.url, site).href, p]));
  return pages.flatMap((page) => {
    const alternates = page.facts.alternates;
    if (alternates.length === 0) return [];
    const self = new URL(page.url, site).href;
    const problems: string[] = [];
    if (!alternates.some((a) => a.href === self && a.hreflang === page.facts.lang)) {
      problems.push('does not include itself');
    }
    if (!alternates.some((a) => a.hreflang === 'x-default')) problems.push('has no x-default');
    for (const alternate of alternates) {
      const target = byHref.get(alternate.href);
      if (target === undefined) {
        problems.push(
          `${alternate.hreflang} points to ${alternate.href}, which is not a page of the build`,
        );
      } else if (!target.facts.alternates.some((a) => a.href === self)) {
        problems.push(`${alternate.href} does not declare it back`);
      }
    }
    return problems.map((message) => ({ url: page.url, rule: 'hreflang', message }));
  });
};

export const noFallbackCopies = perPage('fallback', ({ facts }) =>
  facts.robots?.includes('noindex')
    ? 'has noindex. If it is a Starlight fallback copy, the build should have deleted it (src/integrations/drop-fallbacks.ts); if you marked it on purpose, take it out of the build or change this rule'
    : undefined,
);

export const languageSelectorMatchesHreflang = perPage('language-select', ({ facts }) => {
  const missing = facts.alternates
    .filter((a) => a.hreflang !== 'x-default')
    .map((a) => new URL(a.href).pathname)
    .filter((pathname) => !facts.languageOptions.includes(pathname));
  return missing.length > 0
    ? `the language selector does not lead to ${missing.join(', ')}`
    : undefined;
});

export const noLegacySpanishPrefix = perPage('es-prefix', ({ url }) =>
  url.startsWith('/es/')
    ? 'Spanish lives at the root: there should be no pages under /es/'
    : undefined,
);

/**
 * Maximum JavaScript per page, uncompressed, counting everything it can import. A lesson with a
 * lab is around 340 KB (React 208 KB, Starlight's search 92 KB and the lab); Mermaid reached
 * 3,400 KB.
 */
export const JS_BUDGET_BYTES = 400 * 1024;

export const noMermaid = perPage('mermaid', ({ facts }) =>
  facts.mermaidBlocks > 0
    ? `has ${facts.mermaidBlocks} Mermaid diagrams not converted to HTML`
    : undefined,
);

export const jsBudget = perPage('js-budget', ({ jsBytes }) =>
  jsBytes > JS_BUDGET_BYTES
    ? `can download ${Math.round(jsBytes / 1024)} KB of JavaScript; the limit is ${JS_BUDGET_BYTES / 1024} KB`
    : undefined,
);

export const titleNotDuplicated = perPage('title', ({ facts }) => {
  const [name, site] = (facts.title ?? '').split(' | ');
  return name && name === site ? `the title repeats the site name: «${facts.title}»` : undefined;
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
    : 'is missing the BreadcrumbList (JSON-LD) that ends at the page itself';
});

export const ogImageExists = perPage('og-image', ({ facts }, { site, files }) => {
  if (!facts.ogImage) return 'has no og:image';
  const image = new URL(facts.ogImage);
  if (image.origin !== new URL(site).origin)
    return `og:image points outside the site: ${facts.ogImage}`;
  // The build's files are not encoded («introducción.png»); the URL is.
  const pathname = decodeURI(image.pathname);
  return files.has(pathname)
    ? undefined
    : `og:image points to ${pathname}, which does not exist in the build`;
});

/**
 * Each internal link leads to a file of the build. Starlight's validator only looks at the content;
 * this also covers the links generated by components (PhaseList, LessonIntro, CodeLens…).
 */
export const internalLinksResolve = perPage('links', ({ url, facts }, { site, files }) => {
  const base = new URL(url, site);
  const broken = new Set<string>();
  for (const href of facts.links) {
    if (/^(?:#|mailto:|tel:|javascript:)/.test(href)) continue;
    const target = new URL(href, base);
    if (target.origin !== base.origin) continue;
    const path = decodeURI(target.pathname);
    const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}/index.html`];
    if (!candidates.some((candidate) => files.has(candidate))) broken.add(path);
  }
  return broken.size > 0
    ? `links to pages that do not exist in the build: ${[...broken].join(', ')}`
    : undefined;
});

/** Google cuts the title at around 60-70 characters and the description at around 155. */
export const TITLE_MAX = 70;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 155;

/** Characters, not UTF-16 units: an accented letter counts as one. */
const length = (text: string) => [...text].length;

export const titleLength = perPage('title-length', ({ facts }) => {
  const n = length(facts.title ?? '');
  return n > TITLE_MAX
    ? `the <title> has ${n} characters; Google cuts it at around ${TITLE_MAX}`
    : undefined;
});

export const descriptionLength = perPage('description-length', ({ facts }) => {
  if (!facts.description) return undefined;
  const n = length(facts.description);
  if (n > DESCRIPTION_MAX) {
    return `the description has ${n} characters; Google cuts it at around ${DESCRIPTION_MAX}`;
  }
  if (n < DESCRIPTION_MIN) {
    return `the description has ${n} characters; use up to ${DESCRIPTION_MAX} to say what the page is about`;
  }
  return undefined;
});

export const defaultRules: Rule[] = [
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
];

export function auditSite(input: AuditInput, rules: readonly Rule[] = defaultRules): Issue[] {
  return rules.flatMap((rule) => rule(input));
}
