import { describe, expect, it } from 'vitest';
import { strings, type Strings } from './strings';

/** Every key of an object, nested ones as `a.b`. */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value)
    .flatMap(([key, inner]) => keys(inner, prefix ? `${prefix}.${key}` : key))
    .sort();
}

/** The {placeholders} of each text. */
function holes(t: Strings): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string')
      result[path] = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    else if (typeof value === 'object' && value !== null)
      for (const [key, inner] of Object.entries(value)) walk(inner, path ? `${path}.${key}` : key);
  };
  walk(t, '');
  return result;
}

describe('strings', () => {
  it('both languages have the same keys, nested ones included', () => {
    expect(keys(strings.en)).toEqual(keys(strings.es));
  });

  it('both languages have the same {placeholders} in each text', () => {
    expect(holes(strings.en)).toEqual(holes(strings.es));
  });
});
