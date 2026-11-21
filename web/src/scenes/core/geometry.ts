/**
 * Points and paths on the stage, in pixels. Pure: the stage measures the boxes (stage.ts) and
 * these functions decide where things go and which way they travel.
 */
import type { Box, Place, Point, Side, Size } from './types';

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The length of a polyline. */
export function length(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  return total;
}

/** The point at a share `t` (0 to 1) of a polyline's length. */
export function pointAt(points: readonly Point[], t: number): Point {
  const target = length(points) * t;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = distance(a, b);
    if (walked + segment >= target) return lerp(a, b, segment ? (target - walked) / segment : 0);
    walked += segment;
  }
  return points[points.length - 1]!;
}

/**
 * A quadratic curve from `a` to `b`, as points. A positive `bend` bulges to the right of the
 * direction of travel (on screen, where y grows downwards), so a message and its answer between the
 * same two boxes, with the same bend, go on opposite sides.
 */
export function curve(a: Point, b: Point, bend: number, steps = 20): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 - (dy / L) * bend, y: (a.y + b.y) / 2 + (dx / L) * bend };
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return out;
}

/** Vertical, horizontal and vertical again, like a network diagram's line. */
export function elbow(a: Point, b: Point): Point[] {
  const middle = (a.y + b.y) / 2;
  return [a, { x: a.x, y: middle }, { x: b.x, y: middle }, b];
}

const SIDES: Record<Side, readonly [number, number]> = {
  c: [0.5, 0.5],
  t: [0.5, 0],
  b: [0.5, 1],
  l: [0, 0.5],
  r: [1, 0.5],
  tl: [0, 0],
  tr: [1, 0],
  bl: [0, 1],
  br: [1, 1],
};

/** A point on a box's side, moved by (dx, dy). */
export function sidePoint(box: Box, side: Side = 'c', dx = 0, dy = 0): Point {
  const [fx, fy] = SIDES[side];
  return { x: box.x + box.w * fx + dx, y: box.y + box.h * fy + dy };
}

/** The sides of two boxes that face each other: left and right if they are side by side, else bottom and top. */
export function facing(a: Box, b: Box): [Point, Point] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) * 0.8 >= Math.abs(dy)) {
    return dx > 0 ? [sidePoint(a, 'r'), sidePoint(b, 'l')] : [sidePoint(a, 'l'), sidePoint(b, 'r')];
  }
  return dy > 0 ? [sidePoint(a, 'b'), sidePoint(b, 't')] : [sidePoint(a, 't'), sidePoint(b, 'b')];
}

/** `n` points between `a` and `b`, alternating to each side: the routers of the internet. */
export function zigzag(a: Point, b: Point, n: number, amplitude?: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const amp = amplitude ?? Math.min(16, L * 0.08);
  const out: Point[] = [];
  for (let i = 1; i <= n; i++) {
    const p = lerp(a, b, i / (n + 1));
    const side = i % 2 ? 1 : -1;
    out.push({ x: p.x + (-dy / L) * amp * side, y: p.y + (dx / L) * amp * side });
  }
  return out;
}

/**
 * The top-left corner of a label of `size` placed `where` with respect to `at`, `gap` pixels away,
 * kept `margin` pixels inside the stage.
 */
export function place(
  size: Size,
  at: Point,
  where: Place,
  gap: number,
  bounds: Size,
  margin = 6,
): Point {
  let x = at.x - size.w / 2;
  let y = at.y - size.h / 2;
  if (where === 'above') y = at.y - size.h - gap;
  else if (where === 'below') y = at.y + gap;
  else if (where === 'left') x = at.x - size.w - gap;
  else if (where === 'right') x = at.x + gap;
  return {
    x: Math.max(margin, Math.min(bounds.w - size.w - margin, x)),
    y: Math.max(margin, Math.min(bounds.h - size.h - margin, y)),
  };
}
