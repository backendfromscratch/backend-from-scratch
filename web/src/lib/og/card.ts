/**
 * La imagen que se ve al compartir una página en redes: una pestaña de editor con el fichero, el
 * título de la página y el nombre de la web. Es el árbol que dibuja satori
 * (src/pages/og/[...route].png.ts).
 */
import { homeFileName, toFileName } from '../explorer';
import { localeOfId, normalizeId } from '../translations';

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Colores del tema oscuro (src/styles/theme.css). Si cambian allí, cámbialos aquí. */
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

/** Lo que va entre /og/ y .png: la ruta de la página; las portadas, "index" y "en". */
export function ogRouteParam(id: string): string {
  return normalizeId(id) || 'index';
}

export function ogImagePath(id: string): string {
  return `/og/${ogRouteParam(id)}.png`;
}

/**
 * El «fichero» de la pestaña. En una fase, la ruta sin el idioma (fase-0/que-es-dns.md); las
 * portadas y las páginas raíz, con el nombre del explorador (inicio.md, temario.md), que sale del
 * título y no de la ruta.
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
