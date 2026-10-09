export interface Crumb {
  name: string;
  /** Page path: '/', '/fase-0/'… */
  url: string;
}

/** Breadcrumb JSON-LD (schema.org BreadcrumbList), ready for a <script type="application/ld+json">. */
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
  return toScriptJson(data);
}

/**
 * Site name JSON-LD (schema.org WebSite), for the home page at the root of the domain: Google takes
 * the name it shows above each result from there, and reads it only on that page, not per folder.
 * `alternateName` is the fallback Google may use if it does not take `name`.
 */
export function websiteJsonLd(
  names: { name: string; alternateName: readonly string[] },
  site: string,
): string {
  return toScriptJson({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: names.name,
    alternateName: names.alternateName,
    url: new URL('/', site).href,
  });
}

/** JSON for a <script type="application/ld+json">: a «</script>» inside it would close the tag too early. */
function toScriptJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
