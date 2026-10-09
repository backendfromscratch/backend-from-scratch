/**
 * What the SEO audit needs to know about a generated page. It is read with regular expressions:
 * Astro generates the HTML, always with attributes in double quotes.
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
  /** The JSON-LD blocks in the head; one that is not valid JSON comes as { invalidJson }. */
  jsonLd: unknown[];
  /** The URLs the language selector leads to. */
  languageOptions: string[];
  h1Count: number;
  mermaidBlocks: number;
  /** The hrefs of the page's links (<a>). */
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
  // Without the attribute contents: the copy button stores the code in data-code, and an
  // «<h1>» inside it is not a tag.
  const markup = html.replace(/="[^"]*"/g, '=""');
  // Same, but keeping the hrefs, to read the links.
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
