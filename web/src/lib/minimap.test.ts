import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  dragScroll,
  layoutStrokes,
  mapOffset,
  proportionalScale,
  scrollTargetFor,
  viewportRect,
  wordKind,
} from './minimap';

describe('proportionalScale', () => {
  it('el contenido cabe a lo ancho del minimapa, y esa escala vale también a lo alto', () => {
    expect(proportionalScale(900, 72)).toBeCloseTo(0.08);
  });

  it('un contenido estrecho no se agranda: como mucho, MAX_SCALE', () => {
    expect(proportionalScale(200, 72)).toBe(MAX_SCALE);
  });

  it('sin ancho (minimapa oculto o sin contenido), la escala es 0', () => {
    expect(proportionalScale(0, 72)).toBe(0);
    expect(proportionalScale(900, 0)).toBe(0);
  });
});

describe('mapOffset', () => {
  // Página de 10.000 px a escala 0,1: el dibujo mide 1.000 px y el minimapa, 600.
  const page = { viewHeight: 900, docHeight: 10_000, scale: 0.1, mapHeight: 600 };
  const offset = (scrollY: number, p = page) =>
    mapOffset(scrollY, p.viewHeight, p.docHeight, p.scale, p.mapHeight);

  it('si el dibujo cabe en el minimapa, no se desliza', () => {
    expect(offset(3000, { ...page, mapHeight: 1200 })).toBe(0);
  });

  it('arriba del todo, el minimapa enseña su principio', () => {
    expect(offset(0)).toBe(0);
  });

  it('abajo del todo, enseña su final', () => {
    expect(offset(10_000 - 900)).toBeCloseTo(1000 - 600);
  });

  it('entre medias, se desliza en proporción a la página', () => {
    expect(offset((10_000 - 900) / 2)).toBeCloseTo((1000 - 600) / 2);
  });

  it('una página más corta que la ventana no se desliza', () => {
    expect(offset(0, { ...page, docHeight: 800 })).toBe(0);
  });
});

describe('viewportRect', () => {
  it('el rectángulo es la ventana a escala, menos lo que se ha deslizado el minimapa', () => {
    const rect = viewportRect(2000, 900, 0.1, 150);
    expect(rect.top).toBeCloseTo(200 - 150);
    expect(rect.height).toBeCloseTo(90);
  });

  it('sin desplazamiento, como antes', () => {
    expect(viewportRect(2000, 900, 0.1).top).toBeCloseTo(200);
  });
});

describe('scrollTargetFor', () => {
  it('centra la ventana en el punto pulsado', () => {
    expect(scrollTargetFor(300, 0.1, 900, 10_000)).toBeCloseTo(3000 - 450);
  });

  it('cuenta lo que se ha deslizado el minimapa', () => {
    expect(scrollTargetFor(300, 0.1, 900, 10_000, 200)).toBeCloseTo(5000 - 450);
  });

  it('no sube de 0 ni baja del final', () => {
    expect(scrollTargetFor(10, 0.1, 900, 10_000)).toBe(0);
    expect(scrollTargetFor(990, 0.1, 900, 10_000)).toBe(10_000 - 900);
  });

  it('una página más corta que la ventana no se desplaza', () => {
    expect(scrollTargetFor(50, MAX_SCALE, 900, 600)).toBe(0);
  });

  it('sin escala, no se mueve', () => {
    expect(scrollTargetFor(100, 0, 900, 10_000)).toBe(0);
  });
});

describe('dragScroll', () => {
  it('si el dibujo cabe, el rectángulo sigue al puntero a escala', () => {
    // 20 px del minimapa son 200 px de página a escala 0,1.
    expect(dragScroll(1000, 20, 0.1, 900, 10_000, 1200)).toBeCloseTo(1200);
  });

  it('si el minimapa se desliza, el rectángulo recorre el minimapa mientras la página va de arriba abajo', () => {
    // El rectángulo mide 90 px y tiene 600 − 90 = 510 px de recorrido para 9.100 px de página.
    const end = dragScroll(0, 600 - 90, 0.1, 900, 10_000, 600);
    expect(end).toBeCloseTo(10_000 - 900);
  });

  it('no sube de 0 ni baja del final', () => {
    expect(dragScroll(100, -500, 0.1, 900, 10_000, 600)).toBe(0);
    expect(dragScroll(9000, 500, 0.1, 900, 10_000, 600)).toBe(10_000 - 900);
  });

  it('sin escala o sin página que desplazar, no se mueve', () => {
    expect(dragScroll(300, 50, 0, 900, 10_000, 600)).toBe(300);
    expect(dragScroll(0, 50, 0.1, 900, 800, 600)).toBe(0);
  });
});

describe('layoutStrokes', () => {
  it('cada palabra es un trazo a escala: posición, ancho y alto', () => {
    const [stroke] = layoutStrokes([{ x: 100, y: 2000, width: 60, height: 20, kind: 'text' }], 0.1);
    expect(stroke).toMatchObject({ kind: 'text' });
    expect(stroke?.x).toBeCloseTo(10);
    expect(stroke?.y).toBeCloseTo(200);
    expect(stroke?.width).toBeCloseTo(6);
    expect(stroke?.height).toBeCloseTo(2);
  });

  it('una palabra muy corta se sigue viendo: 1 px como mínimo', () => {
    const [stroke] = layoutStrokes([{ x: 0, y: 0, width: 5, height: 5, kind: 'code' }], 0.1);
    expect(stroke?.width).toBe(1);
    expect(stroke?.height).toBe(1);
  });

  it('lo que no se ve (sin ancho o sin alto) no se dibuja', () => {
    expect(layoutStrokes([{ x: 0, y: 0, width: 0, height: 20, kind: 'text' }], 0.1)).toEqual([]);
    expect(layoutStrokes([{ x: 0, y: 0, width: 40, height: 0, kind: 'text' }], 0.1)).toEqual([]);
  });
});

describe('wordKind', () => {
  const el = (tagName: string, ...classList: string[]) => ({ tagName, classList });

  it('una palabra dentro de un título es de título', () => {
    expect(wordKind([el('SPAN'), el('H2')])).toBe('heading');
    expect(wordKind([el('A'), el('DIV', 'sl-heading-wrapper', 'level-h2')])).toBe('heading');
  });

  it('los términos de una lista de definiciones, como títulos (el glosario)', () => {
    expect(wordKind([el('DT')])).toBe('heading');
    expect(wordKind([el('P'), el('DD')])).toBe('text');
  });

  it('el código, en bloque o dentro de una frase, es código', () => {
    expect(wordKind([el('SPAN'), el('DIV', 'ec-line'), el('PRE')])).toBe('code');
    expect(wordKind([el('CODE'), el('P')])).toBe('code');
  });

  it('manda el más cercano: código dentro de un título es código', () => {
    expect(wordKind([el('CODE'), el('H2')])).toBe('code');
  });

  it('la explicación de un «Pruébalo» es texto; solo su terminal es código', () => {
    expect(wordKind([el('P'), el('SECTION', 'try-it')])).toBe('text');
  });

  it('lo demás es texto', () => {
    expect(wordKind([el('P')])).toBe('text');
    expect(wordKind([])).toBe('text');
  });
});
