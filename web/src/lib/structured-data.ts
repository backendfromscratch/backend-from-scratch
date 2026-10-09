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
  // A «</script>» inside the JSON would close the tag too early.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
