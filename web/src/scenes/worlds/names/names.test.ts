import { describe, expect, it } from 'vitest';
import { ADDRESS, RUNS } from './names';
import { strings } from './strings';

describe('the names world', () => {
  it('changes a documentation domain between documentation addresses (RFC 5737)', () => {
    expect(ADDRESS.old).toMatch(/^192\.0\.2\.\d+$/);
    expect(ADDRESS.new).toMatch(/^198\.51\.100\.\d+$/);
    expect(strings.es.domain).toMatch(/\.example$/);
    expect(strings.en.domain).toMatch(/\.example$/);
  });

  it('counts the TTL down as the lesson’s two dig runs do: six seconds apart', () => {
    const ttl = (run: string) => Number(run.split(/\s+/)[1]);
    expect(RUNS.map(ttl)).toEqual([294, 288]);
  });

  it('shows the same records in both languages: they are the lesson’s real ones', () => {
    expect(strings.en.records).toEqual(strings.es.records);
    expect(strings.es.records.map(([type]) => type)).toEqual([
      'A',
      'AAAA',
      'CNAME',
      'MX',
      'TXT',
      'NS',
    ]);
  });
});
