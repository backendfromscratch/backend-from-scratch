/**
 * Las fuentes de las imágenes para redes. Satori no lee woff2, así que se usan los woff de las fuentes
 * estáticas. Se localizan por el sistema de módulos, no por el directorio de trabajo: el build
 * funciona se lance desde donde se lance.
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

/** La ruta en disco de un fichero de fuente, a partir de su nombre de paquete. */
export function fontFile(specifier: string): string {
  return require.resolve(specifier);
}
