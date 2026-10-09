import { describe, expect, it } from 'vitest';
import {
  buildPath,
  explain,
  interpret,
  normalizeName,
  parseDohJson,
  parseDomain,
  suffixes,
  type DnsResponse,
} from './dns';
import { recorded } from './fixtures';

const parsed = (key: string) => parseDohJson(recorded[key]);
const nsFor = (name: string) => suffixes(name).map((suffix) => parsed(`${suffix} NS`));

describe('parseDomain', () => {
  it('accepts a name and lowercases it', () => {
    expect(parseDomain('  Example.COM ')).toEqual({ ok: true, name: 'example.com' });
  });

  it('keeps the name of a whole URL', () => {
    expect(parseDomain('https://www.example.com/ruta?x=1')).toEqual({
      ok: true,
      name: 'www.example.com',
    });
  });

  it('removes the trailing dot', () => {
    expect(parseDomain('example.com.')).toEqual({ ok: true, name: 'example.com' });
  });

  it('converts names with accents or ñ to ASCII (punycode)', () => {
    expect(parseDomain('ñandú.com')).toEqual({ ok: true, name: 'xn--and-6ma2c.com' });
  });

  it('accepts underscores, as in _dmarc.gmail.com', () => {
    expect(parseDomain('_dmarc.gmail.com')).toEqual({ ok: true, name: '_dmarc.gmail.com' });
  });

  it('an IP is not a name: it says so, instead of giving NXDOMAIN', () => {
    expect(parseDomain('192.168.1.1')).toEqual({ ok: false, reason: 'ip' });
    expect(parseDomain('http://10.0.0.1/admin')).toEqual({ ok: false, reason: 'ip' });
    expect(parseDomain('[2606:4700::1111]')).toEqual({ ok: false, reason: 'ip' });
  });

  it('an IPv6 without brackets, as it is usually copied, is also an IP', () => {
    expect(parseDomain('2606:4700::1111')).toEqual({ ok: false, reason: 'ip' });
    expect(parseDomain('::1')).toEqual({ ok: false, reason: 'ip' });
    // A name with a port that only has letters a to f is not mistaken for an IPv6.
    expect(parseDomain('cafe.de:8080')).toEqual({ ok: true, name: 'cafe.de' });
  });

  it('rejects an empty field', () => {
    expect(parseDomain('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects what is not a domain name', () => {
    for (const bad of ['ex ample.com', '-example.com', `${'a'.repeat(64)}.com`, 'http://']) {
      expect(parseDomain(bad), bad).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('normalizeName and suffixes', () => {
  it('normalizes the root, uppercase and the trailing dot', () => {
    expect(normalizeName('')).toBe('.');
    expect(normalizeName('.')).toBe('.');
    expect(normalizeName('Example.COM.')).toBe('example.com');
  });

  it('gives each suffix of the name, from the root down', () => {
    expect(suffixes('www.example.com')).toEqual(['.', 'com', 'example.com', 'www.example.com']);
    expect(suffixes('com')).toEqual(['.', 'com']);
  });
});

describe('parseDohJson', () => {
  it('a TXT looks the same from Cloudflare or Google: joined and quoted, as in dig', () => {
    const txt = (data: string) =>
      parseDohJson({
        Status: 0,
        Answer: [{ name: 'example.com.', type: 16, TTL: 300, data }],
      }).answers[0]!.data;
    // Cloudflare quotes each chunk; Google joins them and adds no quotes.
    expect(txt('"v=spf1 -all"')).toBe('"v=spf1 -all"');
    expect(txt('v=spf1 -all')).toBe('"v=spf1 -all"');
    expect(txt('"v=DKIM1; p=MIIB" "IjAN"')).toBe('"v=DKIM1; p=MIIBIjAN"');
    expect(txt('v=DKIM1; p=MIIBIjAN')).toBe('"v=DKIM1; p=MIIBIjAN"');
  });

  it('reads a real Cloudflare response (the root arrives with an empty name)', () => {
    const root = parsed('. NS');
    expect(root.status).toBe('NOERROR');
    expect(root.answers).toHaveLength(13);
    expect(root.answers[0]).toMatchObject({ name: '.', type: 'NS' });
  });

  it('translates status and type codes', () => {
    expect(parsed('no-existe-backend-desde-cero.com A').status).toBe('NXDOMAIN');
    expect(parseDohJson({ Status: 2 }).status).toBe('SERVFAIL');
    expect(parseDohJson({ Status: 5 }).status).toBe('REFUSED');
    expect(parseDohJson({ Status: 1 }).status).toBe('FORMERR');
    expect(parseDohJson({ Status: 4 }).status).toBe('NOTIMP');
    expect(parseDohJson({ Status: 9 }).status).toBe('RCODE9');
    expect(
      parseDohJson({ Status: 0, Answer: [{ name: 'x.com', type: 65, TTL: 5, data: 'y' }] })
        .answers[0]?.type,
    ).toBe('TYPE65');
  });

  it('fails with something that is not a DNS response', () => {
    expect(() => parseDohJson({ error: 'no' })).toThrow();
    expect(() => parseDohJson(null)).toThrow();
  });
});

describe('buildPath', () => {
  it('finds the zones of example.com with their real servers', () => {
    const path = buildPath('example.com', nsFor('example.com'));
    expect(path.map((zone) => zone.name)).toEqual(['.', 'com', 'example.com']);
    expect(path[0]?.servers).toHaveLength(13);
    expect(path[2]?.servers).toEqual(['elliott.ns.cloudflare.com', 'hera.ns.cloudflare.com']);
  });

  it('does not mistake a CNAME for a zone: www.github.com lives in the github.com zone', () => {
    const path = buildPath('www.github.com', nsFor('www.github.com'));
    expect(path.map((zone) => zone.name)).toEqual(['.', 'com', 'github.com']);
  });

  it('with a domain that does not exist, the path stops at .com', () => {
    const path = buildPath(
      'no-existe-backend-desde-cero.com',
      nsFor('no-existe-backend-desde-cero.com'),
    );
    expect(path.map((zone) => zone.name)).toEqual(['.', 'com']);
  });
});

describe('interpret', () => {
  const path = buildPath('example.com', nsFor('example.com'));

  it('tells answer, NXDOMAIN, NODATA and error apart', () => {
    expect(interpret('example.com', 'A', parsed('example.com A'), path).outcome).toBe('answer');
    expect(
      interpret(
        'no-existe-backend-desde-cero.com',
        'A',
        parsed('no-existe-backend-desde-cero.com A'),
        path,
      ).outcome,
    ).toBe('nxdomain');
    expect(interpret('github.com', 'AAAA', parsed('github.com AAAA'), path).outcome).toBe('nodata');
    const servfail: DnsResponse = { status: 'SERVFAIL', answers: [] };
    expect(interpret('example.com', 'A', servfail, path).outcome).toBe('error');
  });

  it('an error keeps its code: REFUSED is not counted as SERVFAIL', () => {
    const refused: DnsResponse = { status: 'REFUSED', answers: [] };
    const result = interpret('example.com', 'A', refused, path);
    expect(result).toMatchObject({ outcome: 'error', status: 'REFUSED' });
    const steps = explain(result);
    expect(steps.find((step) => step.kind === 'final')).toMatchObject({ status: 'REFUSED' });
    expect(steps.at(-1)).toMatchObject({ kind: 'reply', status: 'REFUSED' });
  });
});

describe('interpret with aliases', () => {
  it('a CNAME with no records of the requested type behind it is NODATA, not an answer', () => {
    const path = buildPath('www.github.com', nsFor('www.github.com'));
    const result = interpret('www.github.com', 'AAAA', parsed('www.github.com AAAA'), path);
    expect(result.outcome).toBe('nodata');
    expect(result.records).toEqual([
      { name: 'www.github.com', type: 'CNAME', ttl: 2802, data: 'github.com.' },
    ]);
  });

  it('if what is requested is the CNAME itself, it is an answer', () => {
    const final = parseDohJson({
      Status: 0,
      Answer: [{ name: 'www.github.com', type: 5, TTL: 60, data: 'github.com.' }],
    });
    expect(interpret('www.github.com', 'CNAME', final, []).outcome).toBe('answer');
  });
});

describe('explain', () => {
  it('tells the path: question, one referral per zone, the final answer and the resolver answer', () => {
    const result = interpret(
      'example.com',
      'A',
      parsed('example.com A'),
      buildPath('example.com', nsFor('example.com')),
    );
    const steps = explain(result);
    expect(steps.map((step) => step.kind)).toEqual([
      'ask',
      'referral',
      'referral',
      'final',
      'reply',
    ]);
    expect(steps[1]).toMatchObject({ zone: { name: '.' }, next: { name: 'com' } });
    expect(steps[3]).toMatchObject({ zone: { name: 'example.com' }, outcome: 'answer' });
    expect(steps[4]).toMatchObject({ outcome: 'answer' });
  });
});

describe('explain with an alias chain', () => {
  const zones = [
    { name: '.', servers: ['a.root-servers.net'] },
    { name: 'com', servers: ['a.gtld-servers.net'] },
    { name: 'a.com', servers: ['ns1.a.com'] },
  ];

  it('within the zone, the server gives the whole chain: the first, the last and those in between', () => {
    const final = parseDohJson({
      Status: 0,
      Answer: [
        { name: 'www.a.com', type: 5, TTL: 60, data: 'cdn.a.com.' },
        { name: 'cdn.a.com', type: 5, TTL: 60, data: 'edge.a.com.' },
        { name: 'edge.a.com', type: 1, TTL: 60, data: '192.0.2.1' },
      ],
    });
    const steps = explain(interpret('www.a.com', 'A', final, zones));
    expect(steps.find((step) => step.kind === 'final')).toMatchObject({
      alias: { name: 'www.a.com', target: 'edge.a.com', via: ['cdn.a.com'] },
      leavesZone: false,
    });
    expect(steps.some((step) => step.kind === 'alias')).toBe(false);
  });

  it('the server of the zone only knows the aliases of its zone; the rest is found by the resolver separately', () => {
    const final = parseDohJson({
      Status: 0,
      Answer: [
        { name: 'www.a.com', type: 5, TTL: 60, data: 'b.cdn.net.' },
        { name: 'b.cdn.net', type: 5, TTL: 60, data: 'c.edge.net.' },
        { name: 'c.edge.net', type: 1, TTL: 60, data: '192.0.2.1' },
      ],
    });
    const steps = explain(interpret('www.a.com', 'A', final, zones));
    expect(steps.find((step) => step.kind === 'final')).toMatchObject({
      alias: { name: 'www.a.com', target: 'b.cdn.net', via: [] },
      leavesZone: true,
    });
    expect(steps.find((step) => step.kind === 'alias')).toMatchObject({
      target: 'b.cdn.net',
      chain: { target: 'c.edge.net', via: [] },
    });
  });

  it('a single CNAME passes through none', () => {
    const final = parseDohJson({
      Status: 0,
      Answer: [{ name: 'www.github.com', type: 5, TTL: 60, data: 'github.com.' }],
    });
    const steps = explain(
      interpret('www.github.com', 'A', final, [{ name: 'github.com', servers: ['ns'] }]),
    );
    expect(steps.find((step) => step.kind === 'final')).toMatchObject({
      alias: { name: 'www.github.com', target: 'github.com', via: [] },
    });
  });
});
