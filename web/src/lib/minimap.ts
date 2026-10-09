/**
 * El minimapa (src/components/Minimap.astro), sin DOM. Como el de VS Code en su modo por defecto
 * («proportional»): cada palabra de la página es un trazo, a una escala fija que hace caber el
 * contenido a lo ancho. Si el dibujo es más alto que el minimapa, el minimapa se desliza a la vez
 * que la página. Un rectángulo marca lo que se ve; al pulsar, la página salta ahí, y al arrastrar,
 * el rectángulo sigue al puntero.
 */
export type WordKind = 'heading' | 'code' | 'text';

/** Una palabra medida en la página: posición en px del documento (x desde el borde del contenido). */
export interface Word {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: WordKind;
}

/** Un trazo del minimapa, en px del minimapa. */
export type Stroke = Word;

/** Con un contenido estrecho, el minimapa no dibuja palabras gigantes. */
export const MAX_SCALE = 0.2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** La escala del dibujo: el contenido cabe a lo ancho del minimapa, y a lo alto se usa la misma. */
export function proportionalScale(contentWidth: number, mapWidth: number): number {
  if (contentWidth <= 0 || mapWidth <= 0) return 0;
  return Math.min(MAX_SCALE, mapWidth / contentWidth);
}

/**
 * Cuánto se ha deslizado el minimapa (px del minimapa): nada si el dibujo cabe; si no, en proporción
 * a lo que se ha desplazado la página, de modo que arriba enseña el principio y abajo el final.
 */
export function mapOffset(
  scrollY: number,
  viewHeight: number,
  docHeight: number,
  scale: number,
  mapHeight: number,
): number {
  const overflow = docHeight * scale - mapHeight;
  const scrollable = docHeight - viewHeight;
  if (overflow <= 0 || scrollable <= 0) return 0;
  return clamp(scrollY / scrollable, 0, 1) * overflow;
}

export function viewportRect(
  scrollY: number,
  viewHeight: number,
  scale: number,
  offset = 0,
): { top: number; height: number } {
  return { top: scrollY * scale - offset, height: viewHeight * scale };
}

/**
 * Adónde desplazar la página al pulsar en `mapY` (px desde arriba del minimapa, que se ha deslizado
 * `offset`): ese punto, centrado.
 */
export function scrollTargetFor(
  mapY: number,
  scale: number,
  viewHeight: number,
  docHeight: number,
  offset = 0,
): number {
  if (scale <= 0) return 0;
  return clamp((mapY + offset) / scale - viewHeight / 2, 0, Math.max(0, docHeight - viewHeight));
}

/**
 * Adónde desplazar la página al arrastrar el rectángulo `deltaY` px desde que se pulsó con la página
 * en `startScroll`. Como en una barra de scroll: el rectángulo sigue al puntero. Si el minimapa se
 * desliza, el rectángulo recorre su alto (menos el suyo) mientras la página va de arriba abajo.
 */
export function dragScroll(
  startScroll: number,
  deltaY: number,
  scale: number,
  viewHeight: number,
  docHeight: number,
  mapHeight: number,
): number {
  const scrollable = docHeight - viewHeight;
  if (scale <= 0 || scrollable <= 0) return clamp(startScroll, 0, Math.max(0, scrollable));
  const overflows = docHeight * scale > mapHeight;
  const track = overflows ? mapHeight - viewHeight * scale : scrollable * scale;
  if (track <= 0) return clamp(startScroll, 0, scrollable);
  return clamp(startScroll + (deltaY * scrollable) / track, 0, scrollable);
}

/** Las palabras, a escala. Lo que no se ve no se dibuja; lo que se ve mide 1 px como mínimo. */
export function layoutStrokes(words: readonly Word[], scale: number): Stroke[] {
  return words
    .filter((word) => word.width > 0 && word.height > 0)
    .map((word) => ({
      x: word.x * scale,
      y: word.y * scale,
      width: Math.max(1, word.width * scale),
      height: Math.max(1, word.height * scale),
      kind: word.kind,
    }));
}

const HEADING = /^(h[1-6]|dt)$/;

/**
 * El color de una palabra, según dónde está: `ancestors` va del elemento que la contiene hacia fuera,
 * y manda el más cercano que sea código o título. Código es lo que va en `pre`, en `code` o en un
 * bloque de Expressive Code; la explicación de un «Pruébalo» es texto.
 */
export function wordKind(
  ancestors: readonly { tagName: string; classList: Iterable<string> }[],
): WordKind {
  for (const { tagName, classList } of ancestors) {
    const tag = tagName.toLowerCase();
    const classes = [...classList];
    if (tag === 'pre' || tag === 'code' || classes.includes('expressive-code')) return 'code';
    if (HEADING.test(tag) || classes.includes('sl-heading-wrapper')) return 'heading';
  }
  return 'text';
}
