/**
 * Un PNG de 1200 × 630 por página, para cuando se comparte en redes (og:image). Se genera en el
 * build con satori (árbol → SVG) y resvg (SVG → PNG), con las fuentes de src/lib/og/fonts.ts.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import fs from 'node:fs';
import { siteTitle, siteUrl } from '~/data/site';
import { OG_SIZE, ogCard, ogFileLabel, ogRouteParam } from '~/lib/og/card';
import { OG_FONTS, fontFile } from '~/lib/og/fonts';
import { localeOfId, normalizeId } from '~/lib/translations';

const fonts = OG_FONTS.map((font) => ({
  name: font.name,
  data: fs.readFileSync(fontFile(font.file)),
  weight: font.weight,
  style: 'normal' as const,
}));

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
    fileLabel: ogFileLabel(id, title),
    siteTitle: siteTitle[localeOfId(id)],
    domain: new URL(siteUrl).host,
  });
  const svg = await satori(card as unknown as Parameters<typeof satori>[0], { ...OG_SIZE, fonts });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
