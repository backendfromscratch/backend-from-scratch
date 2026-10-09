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
  /** Los href de los enlaces (<a>) de la página. */
  links: string[];
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
  // Lo mismo, pero conservando los href, para leer los enlaces.
  const anchors = html.replace(/(\s(?!href=)[a-zA-Z_:][-a-zA-Z0-9_:.]*)="[^"]*"/g, '$1=""');
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
    links: tags(anchors, 'a')
      .map((a) => a.href)
      .filter((href): href is string => href !== undefined),
  };
}
