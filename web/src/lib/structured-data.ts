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
