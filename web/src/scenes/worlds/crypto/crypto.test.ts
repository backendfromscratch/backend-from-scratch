import { describe, expect, it } from 'vitest';
import { SITES } from './crypto';
import { strings } from './strings';

describe('the crypto world', () => {
  it('marks each badssl.com site with the one check the lesson says it fails', () => {
    const [, expired, wrongHost, selfSigned] = SITES;
    const checks = strings.en.checks;
    const failed = (marks: readonly string[]) => checks[marks.indexOf('ko')];
    expect(SITES[0]).toEqual(['ok', 'ok', 'ok']);
    expect(failed(expired!)).toBe('dates');
    expect(failed(wrongHost!)).toBe('name');
    expect(failed(selfSigned!)).toBe('chain');
    for (const marks of SITES.slice(1)) expect(marks.filter((mark) => mark !== '')).toEqual(['ko']);
  });

  it('keeps each language’s own examples', () => {
    expect(strings.es.idText).toContain('tubanco.com');
    expect(strings.en.idText).toContain('yourbank.com');
    expect(strings.es.sights.clear).toBe('GET /cuenta/movimientos');
    expect(strings.en.sights.clear).toBe('GET /account/transactions');
  });
});
