/**
 * The image shown when a page is shared on social media: an editor tab with the file, the page
 * title and the site name. It is the tree that satori draws (src/pages/og/[...route].png.ts).
 */
import { homeFileName, toFileName } from '../explorer';
import { localeOfId, normalizeId } from '../translations';

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Dark theme colors (src/styles/theme.css). If they change there, change them here. */
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

const div = (
  style: SatoriNode['props']['style'],
  children?: string | SatoriNode[],
): SatoriNode => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});

/** What goes between /og/ and .png: the page path; for the home pages, "index" and "en". */
export function ogRouteParam(id: string): string {
  return normalizeId(id) || 'index';
}

export function ogImagePath(id: string): string {
  return `/og/${ogRouteParam(id)}.png`;
}

/**
 * The tab's «file». In a phase, the path without the language (fase-0/que-es-dns.md); the home
 * pages and root pages, with the explorer's name (inicio.md, temario.md), which comes from the
 * title and not from the path.
 */
export function ogFileLabel(id: string, title: string): string {
  const path = normalizeId(id).replace(/^en(?:\/|$)/, '');
  if (!path) return homeFileName(localeOfId(id));
  return path.includes('/') ? `${path}.md` : toFileName(title);
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
      div(
        {
          height: 72,
          alignItems: 'flex-end',
          paddingLeft: 48,
          background: COLORS.chrome,
          borderBottom: `2px solid ${COLORS.border}`,
        },
        [
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
        ],
      ),
      div({ flex: 1, alignItems: 'center', padding: '48px 72px' }, [
        div(
          {
            color: COLORS.strong,
            fontSize: title.length > 32 ? 60 : 76,
            fontWeight: 700,
            lineHeight: 1.15,
          },
          title,
        ),
      ]),
      div(
        {
          justifyContent: 'space-between',
          padding: '0 72px 48px',
          fontFamily: 'JetBrains Mono',
          fontSize: 28,
        },
        [div({ color: COLORS.keyword }, siteTitle), div({ color: COLORS.muted }, domain)],
      ),
    ],
  );
}
