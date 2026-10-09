/**
 * The fonts for the social images. Satori cannot read woff2, so the woff files of the static fonts
 * are used. They are located through the module system, not the working directory: the build works
 * wherever it is launched from.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const OG_FONTS = [
  {
    name: 'Atkinson',
    file: '@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff',
    weight: 700,
  },
  {
    name: 'JetBrains Mono',
    file: '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff',
    weight: 400,
  },
] as const;

/** The on-disk path of a font file, from its package specifier. */
export function fontFile(specifier: string): string {
  return require.resolve(specifier);
}
