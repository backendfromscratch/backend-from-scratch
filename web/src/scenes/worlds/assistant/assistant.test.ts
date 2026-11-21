import { describe, expect, it } from 'vitest';
import { INITIAL, LIMIT, SEGMENTS } from './assistant';
import { strings } from './strings';

/** A price or a cost as the meter writes it, in either language: «0,10 $» or “$0.10”. */
const dollars = (text: string) => Number(text.replace(/[$\s]/g, '').replace(',', '.'));

describe('the cost meter', () => {
  it.each(['es', 'en'] as const)(
    'in %s, each cost is its tokens times the price per million, as the text’s table',
    (lang) => {
      const [input, output, total] = strings[lang].meter.values;
      const cost = ([tokens, price]: readonly [string, string, string]) =>
        (Number(tokens) * dollars(price)) / 1_000_000;
      expect(cost(input)).toBeCloseTo(dollars(input[2]), 12);
      expect(cost(output)).toBeCloseTo(dollars(output[2]), 12);
      expect(cost(input) + cost(output)).toBeCloseTo(dollars(total), 12);
      // The text's figures: 500 in and 150 out, 0,000125 $ in all.
      expect(dollars(total)).toBe(0.000125);
    },
  );

  it('says output costs five times more than input', () => {
    const [input, output] = strings.en.meter.values;
    expect(dollars(output[1]) / dollars(input[1])).toBe(5);
  });
});

describe('the assistant’s starting state', () => {
  it('has the shop’s key, an empty chat and Redis answering', () => {
    expect(INITIAL).toMatchObject({ aiKey: true, aiAsk: '', aiAnswer: 0, aiRedisDown: false });
  });

  it('counts against the text’s limit of 20 questions, with three placeholder lines of four', () => {
    expect(LIMIT).toBe(20);
    expect(SEGMENTS).toBe(12);
  });
});
