import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANSWERS, BUDGET_SCALE, budgetFill, heights, HISTOGRAM } from './ops';
import { strings } from './strings';

const langs = ['es', 'en'] as const;
/** A count of tokens, in either language's figures (2.000, 2,000). */
const count = (text: string) => Number(text.replace(/\D/g, ''));

describe.each(langs)('the ops world, in %s', (lang) => {
  const t = strings[lang];

  it('adds up the text’s example: 2.000 in and 150 out make 0,000275 $', () => {
    const [input, , , output] = t.price.rows;
    const amount = (row: readonly [string, string, string]) =>
      (count(row[2]) * Number(row[1].replace(',', '.'))) / 1_000_000;
    const total = Number(t.price.total[1].replace(/[^\d,.]/g, '').replace(',', '.'));
    expect(t.price.rows).toHaveLength(4);
    expect(amount(input!) + amount(output!)).toBeCloseTo(total, 9);
    expect(total).toBe(0.000275);
  });

  it('has the twelve evals, each once', () => {
    expect(t.evals.cases).toHaveLength(12);
    expect(new Set(t.evals.cases).size).toBe(12);
  });
});

describe('the budget’s bar', () => {
  it('is a little longer than the budget, so a question past it shows, and stops there', () => {
    expect(budgetFill(0)).toBe(0);
    expect(budgetFill(1)).toBeCloseTo(1 / BUDGET_SCALE);
    expect(budgetFill(1.05)).toBeGreaterThan(budgetFill(1));
    expect(budgetFill(9)).toBe(1);
  });

  it('marks the limit where ops.css draws it', () => {
    const css = readFileSync(new URL('./ops.css', import.meta.url), 'utf8');
    expect(css).toContain(`left: calc(100% / ${BUDGET_SCALE});`);
  });
});

describe('the histogram', () => {
  it('starts as it was, and each answer of the scene adds to a bucket further right', () => {
    expect(heights(0)).toEqual([...HISTOGRAM]);
    expect([...ANSWERS]).toEqual([...ANSWERS].sort((a, b) => a - b));
    for (let n = 1; n <= ANSWERS.length; n++) {
      const grown = heights(n).findIndex((h, i) => h > heights(n - 1)[i]!);
      expect(grown).toBe(ANSWERS[n - 1]);
    }
    for (const h of heights(ANSWERS.length)) expect(h).toBeLessThanOrEqual(1);
  });
});
