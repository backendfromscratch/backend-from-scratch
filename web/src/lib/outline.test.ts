import { describe, expect, it } from 'vitest';
import { currentSection, flattenOutline } from './outline';

describe('flattenOutline', () => {
  it('el índice de Starlight, en una lista plana con la marca de cada nivel', () => {
    const toc = [
      { depth: 2, slug: '_top', text: 'Sinopsis', children: [] },
      {
        depth: 2,
        slug: 'el-problema',
        text: 'El problema',
        children: [{ depth: 3, slug: 'lo-que-decide', text: 'Lo que decide', children: [] }],
      },
    ];
    expect(flattenOutline(toc)).toEqual([
      { slug: '_top', text: 'Sinopsis', mark: '#' },
      { slug: 'el-problema', text: 'El problema', mark: '##' },
      { slug: 'lo-que-decide', text: 'Lo que decide', mark: '###' },
    ]);
  });
});

describe('currentSection', () => {
  it('antes de que ningún título llegue a la línea de lectura, la primera entrada', () => {
    expect(currentSection([170, 900, 2000], 166, false)).toBe(0);
  });

  it('la última sección cuyo título ya ha llegado a la línea', () => {
    expect(currentSection([-500, 150, 800], 166, false)).toBe(1);
  });

  it('un salto a un ancla deja el título justo en la línea: esa es la actual', () => {
    expect(currentSection([-900, -400, 166, 700], 166, false)).toBe(2);
  });

  it('con todos los títulos ya arriba, la última', () => {
    expect(currentSection([-900, -500, -100], 166, false)).toBe(2);
  });

  it('al final de la página, la última, aunque su título no llegue a la línea', () => {
    expect(currentSection([-900, 300, 700], 166, true)).toBe(2);
  });

  it('al final de la página, tras saltar a una sección que no llega a subir, esa sección', () => {
    // Clic en «¿Lo has entendido?» (índice 1): la página baja hasta el final, pero el título se
    // queda a media ventana y el de «Para profundizar» (índice 2) también se ve.
    expect(currentSection([-900, 300, 700], 166, true, { target: 1, viewHeight: 900 })).toBe(1);
  });

  it('el destino de un salto solo cuenta al final de la página', () => {
    expect(currentSection([-500, 150, 800], 166, false, { target: 2, viewHeight: 900 })).toBe(1);
  });

  it('un destino que no existe se ignora', () => {
    expect(currentSection([-900, 300, 700], 166, true, { target: 7, viewHeight: 900 })).toBe(2);
  });

  it('un destino que ya no se ve (el lector siguió bajando hasta el final), se ignora', () => {
    expect(currentSection([-900, -400, 700], 166, true, { target: 0, viewHeight: 900 })).toBe(2);
  });

  it('sin títulos, ninguna', () => {
    expect(currentSection([], 166, false)).toBe(-1);
  });
});
