import { describe, expect, it } from 'vitest';
import { curve, elbow, facing, length, place, pointAt, sidePoint, zigzag } from './geometry';

describe('length and pointAt', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  it('measures a polyline', () => {
    expect(length(path)).toBe(20);
  });

  it('finds the point at a share of the length', () => {
    expect(pointAt(path, 0.75)).toEqual({ x: 10, y: 5 });
    expect(pointAt(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(path, 1)).toEqual({ x: 10, y: 10 });
  });

  it('survives a path of one point', () => {
    expect(pointAt([{ x: 3, y: 4 }], 0.5)).toEqual({ x: 3, y: 4 });
  });
});

describe('curve', () => {
  it('starts and ends at the given points', () => {
    const c = curve({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(c[0]).toEqual({ x: 0, y: 0 });
    expect(c.at(-1)).toEqual({ x: 100, y: 0 });
    expect(c).toHaveLength(21);
  });

  it('bulges to the right of the direction of travel with a positive bend', () => {
    // Travelling right on screen (y grows downwards), the right-hand side is down.
    expect(curve({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)[10]!.y).toBeGreaterThan(0);
    expect(curve({ x: 0, y: 0 }, { x: 100, y: 0 }, -10)[10]!.y).toBeLessThan(0);
  });

  it('goes back on the other side when travelled the other way', () => {
    const there = curve({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)[10]!;
    const back = curve({ x: 100, y: 0 }, { x: 0, y: 0 }, 10)[10]!;
    expect(Math.sign(there.y)).toBe(-Math.sign(back.y));
  });
});

describe('elbow', () => {
  it('goes vertical, horizontal and vertical again', () => {
    expect(elbow({ x: 0, y: 100 }, { x: 50, y: 0 })).toEqual([
      { x: 0, y: 100 },
      { x: 0, y: 50 },
      { x: 50, y: 50 },
      { x: 50, y: 0 },
    ]);
  });
});

describe('sidePoint and facing', () => {
  const box = { x: 10, y: 20, w: 100, h: 50 };

  it('returns the middle of each side', () => {
    expect(sidePoint(box, 'c')).toEqual({ x: 60, y: 45 });
    expect(sidePoint(box, 'r')).toEqual({ x: 110, y: 45 });
    expect(sidePoint(box, 't', 0, -2)).toEqual({ x: 60, y: 18 });
  });

  it('joins boxes side by side through their facing sides', () => {
    const right = { x: 300, y: 20, w: 100, h: 50 };
    expect(facing(box, right)).toEqual([
      { x: 110, y: 45 },
      { x: 300, y: 45 },
    ]);
  });

  it('joins stacked boxes through their bottom and top', () => {
    const below = { x: 10, y: 300, w: 100, h: 50 };
    expect(facing(box, below)).toEqual([
      { x: 60, y: 70 },
      { x: 60, y: 300 },
    ]);
  });
});

describe('zigzag', () => {
  it('puts n points between the ends, alternating sides', () => {
    const z = zigzag({ x: 0, y: 0 }, { x: 400, y: 0 }, 3);
    expect(z).toHaveLength(3);
    expect(z.map((p) => p.x)).toEqual([100, 200, 300]);
    expect(Math.sign(z[0]!.y)).toBe(-Math.sign(z[1]!.y));
    expect(Math.abs(z[0]!.y)).toBe(16);
  });
});

describe('place', () => {
  const bounds = { w: 600, h: 400 };

  it('puts a label above a point', () => {
    expect(place({ w: 100, h: 20 }, { x: 300, y: 200 }, 'above', 8, bounds)).toEqual({
      x: 250,
      y: 172,
    });
  });

  it('keeps a label inside the stage', () => {
    expect(place({ w: 100, h: 20 }, { x: -50, y: 200 }, 'center', 0, bounds)).toEqual({
      x: 6,
      y: 190,
    });
    expect(place({ w: 100, h: 20 }, { x: 590, y: 395 }, 'below', 8, bounds)).toEqual({
      x: 494,
      y: 374,
    });
  });
});
