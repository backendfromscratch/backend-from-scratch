import { describe, expect, it } from 'vitest';
import { rebuild } from './cache';
import { humanBytes, totals } from './measure';
import { base, scenarios } from './scenarios';

const sumOf = (values: (number | null)[]) => values.reduce<number>((a, b) => a + (b ?? 0), 0);

describe('totals', () => {
  it('one stage: the image is the base plus every layer, and the first build runs every step', () => {
    const { instructions, steps } = scenarios.good;
    const result = totals(instructions, steps, base.bytes, rebuild(instructions, []));
    expect(result.ownBytes).toBe(sumOf(steps.map((s) => s.bytes)));
    expect(result.imageBytes).toBe(base.bytes + result.ownBytes);
    expect(result.leftOutBytes).toBe(0);
    expect(result.seconds).toBeCloseTo(sumOf(steps.map((s) => s.seconds)), 5);
    expect(result).toMatchObject({ rebuilt: 4, cached: 0 });
  });

  it('without a build: sizes, no seconds', () => {
    const { instructions, steps } = scenarios.good;
    expect(totals(instructions, steps, base.bytes, null)).toMatchObject({
      seconds: 0,
      rebuilt: 0,
      cached: 0,
    });
  });

  it('a change in src/ with the right order costs only the COPY . . seconds', () => {
    const { instructions, steps } = scenarios.good;
    const build = rebuild(instructions, ['src'], rebuild(instructions, []));
    const copy = instructions.find((i) => i.text === 'COPY . .')!;
    expect(totals(instructions, steps, base.bytes, build).seconds).toBe(steps[copy.index]!.seconds);
  });

  it('multi-stage: the build stages stay out of the image, which is smaller', () => {
    const { instructions, steps } = scenarios.multi;
    const result = totals(instructions, steps, base.bytes, null);
    const npmCi = instructions.find((i) => i.text === 'RUN npm ci')!;
    expect(result.leftOutBytes).toBeGreaterThanOrEqual(steps[npmCi.index]!.bytes!);
    const single = totals(scenarios.good.instructions, scenarios.good.steps, base.bytes, null);
    expect(result.imageBytes).toBeLessThan(single.imageBytes);
  });

  it('multi-stage: a step shared by two stages counts once, in seconds and in what stays out', () => {
    const { instructions, steps } = scenarios.multi;
    const result = totals(instructions, steps, base.bytes, rebuild(instructions, []));
    const own = instructions.filter((i) => i.sameAs === undefined);
    expect(result.seconds).toBeCloseTo(sumOf(own.map((i) => steps[i.index]!.seconds)), 5);
    const stays = instructions.filter(
      (i) => i.layer && i.stage !== 'final' && !instructions.some((j) => j.sameAs === i.index),
    );
    expect(result.leftOutBytes).toBe(sumOf(stays.map((i) => steps[i.index]!.bytes)));
  });
});

describe('humanBytes', () => {
  it('uses decimal units, like Docker', () => {
    expect(humanBytes(512)).toEqual({ amount: 512, unit: 'B' });
    expect(humanBytes(8192)).toEqual({ amount: 8.2, unit: 'kB' });
    expect(humanBytes(157_212_672)).toEqual({ amount: 157.2, unit: 'MB' });
    expect(humanBytes(1_800_000_000)).toEqual({ amount: 1.8, unit: 'GB' });
  });
});
