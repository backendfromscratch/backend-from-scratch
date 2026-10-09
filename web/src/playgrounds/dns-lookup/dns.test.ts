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
  it('acepta un nombre y lo pasa a minúsculas', () => {
    expect(parseDomain('  Example.COM ')).toEqual({ ok: true, name: 'example.com' });
  });

  it('se queda con el nombre de una URL entera', () => {
    expect(parseDomain('https://www.example.com/ruta?x=1')).toEqual({
      ok: true,
      name: 'www.example.com',
    });
  });

  it('quita el punto final', () => {
    expect(parseDomain('example.com.')).toEqual({ ok: true, name: 'example.com' });
  });

  it('pasa los nombres con tildes o eñes a ASCII (punycode)', () => {
    expect(parseDomain('ñandú.com')).toEqual({ ok: true, name: 'xn--and-6ma2c.com' });
  });

  it('acepta guiones bajos, como en _dmarc.gmail.com', () => {
    expect(parseDomain('_dmarc.gmail.com')).toEqual({ ok: true, name: '_dmarc.gmail.com' });
  });

  it('una IP no es un nombre: lo dice, en vez de dar NXDOMAIN', () => {
    expect(parseDomain('192.168.1.1')).toEqual({ ok: false, reason: 'ip' });
    expect(parseDomain('http://10.0.0.1/admin')).toEqual({ ok: false, reason: 'ip' });
    expect(parseDomain('[2606:4700::1111]')).toEqual({ ok: false, reason: 'ip' });
  });

  it('una IPv6 sin corchetes, como se suele copiar, también es una IP', () => {
    expect(parseDomain('2606:4700::1111')).toEqual({ ok: false, reason: 'ip' });
    expect(parseDomain('::1')).toEqual({ ok: false, reason: 'ip' });
    // Un nombre con puerto que solo tiene letras de la a a la f no se confunde con una IPv6.
    expect(parseDomain('cafe.de:8080')).toEqual({ ok: true, name: 'cafe.de' });
  });

  it('rechaza un campo vacío', () => {
    expect(parseDomain('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rechaza lo que no es un nombre de dominio', () => {
    for (const bad of ['ex ample.com', '-example.com', `${'a'.repeat(64)}.com`, 'http://']) {
      expect(parseDomain(bad), bad).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('normalizeName y suffixes', () => {
  it('normaliza la raíz, las mayúsculas y el punto final', () => {
    expect(normalizeName('')).toBe('.');
    expect(normalizeName('.')).toBe('.');
    expect(normalizeName('Example.COM.')).toBe('example.com');
  });

  it('da cada sufijo del nombre, de la raíz hacia abajo', () => {
    expect(suffixes('www.example.com')).toEqual(['.', 'com', 'example.com', 'www.example.com']);
    expect(suffixes('com')).toEqual(['.', 'com']);
  });
});

describe('parseDohJson', () => {
  it('un TXT se ve igual venga de Cloudflare o de Google: unido y entre comillas, como en dig', () => {
    const txt = (data: string) =>
      parseDohJson({
        Status: 0,
        Answer: [{ name: 'example.com.', type: 16, TTL: 300, data }],
      }).answers[0]!.data;
    // Cloudflare entrecomilla cada trozo; Google los une y no pone comillas.
    expect(txt('"v=spf1 -all"')).toBe('"v=spf1 -all"');
    expect(txt('v=spf1 -all')).toBe('"v=spf1 -all"');
    expect(txt('"v=DKIM1; p=MIIB" "IjAN"')).toBe('"v=DKIM1; p=MIIBIjAN"');
    expect(txt('v=DKIM1; p=MIIBIjAN')).toBe('"v=DKIM1; p=MIIBIjAN"');
  });

  it('lee una respuesta real de Cloudflare (la raíz llega con nombre vacío)', () => {
    const root = parsed('. NS');
    expect(root.status).toBe('NOERROR');
    expect(root.answers).toHaveLength(13);
    expect(root.answers[0]).toMatchObject({ name: '.', type: 'NS' });
  });

  it('traduce los códigos de estado y de tipo', () => {
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

  it('falla con algo que no es una respuesta DNS', () => {
    expect(() => parseDohJson({ error: 'no' })).toThrow();
    expect(() => parseDohJson(null)).toThrow();
  });
});

describe('buildPath', () => {
  it('encuentra las zonas de example.com con sus servidores reales', () => {
    const path = buildPath('example.com', nsFor('example.com'));
    expect(path.map((zone) => zone.name)).toEqual(['.', 'com', 'example.com']);
    expect(path[0]?.servers).toHaveLength(13);
    expect(path[2]?.servers).toEqual(['elliott.ns.cloudflare.com', 'hera.ns.cloudflare.com']);
  });

  it('no confunde un CNAME con una zona: www.github.com vive en la zona github.com', () => {
    const path = buildPath('www.github.com', nsFor('www.github.com'));
    expect(path.map((zone) => zone.name)).toEqual(['.', 'com', 'github.com']);
  });

  it('con un dominio que no existe, el recorrido se queda en .com', () => {
    const path = buildPath(
      'no-existe-backend-desde-cero.com',
      nsFor('no-existe-backend-desde-cero.com'),
    );
    expect(path.map((zone) => zone.name)).toEqual(['.', 'com']);
  });
});

describe('interpret', () => {
  const path = buildPath('example.com', nsFor('example.com'));

  it('distingue respuesta, NXDOMAIN, NODATA y error', () => {
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

  it('un error guarda su código: REFUSED no se cuenta como SERVFAIL', () => {
    const refused: DnsResponse = { status: 'REFUSED', answers: [] };
    const result = interpret('example.com', 'A', refused, path);
    expect(result).toMatchObject({ outcome: 'error', status: 'REFUSED' });
    const steps = explain(result);
    expect(steps.find((step) => step.kind === 'final')).toMatchObject({ status: 'REFUSED' });
    expect(steps.at(-1)).toMatchObject({ kind: 'reply', status: 'REFUSED' });
  });
});

describe('interpret con alias', () => {
  it('un CNAME sin registros del tipo pedido detrás es NODATA, no una respuesta', () => {
    const path = buildPath('www.github.com', nsFor('www.github.com'));
    const result = interpret('www.github.com', 'AAAA', parsed('www.github.com AAAA'), path);
    expect(result.outcome).toBe('nodata');
    expect(result.records).toEqual([
      { name: 'www.github.com', type: 'CNAME', ttl: 2802, data: 'github.com.' },
    ]);
  });

  it('si lo que se pide es el propio CNAME, sí es una respuesta', () => {
    const final = parseDohJson({
      Status: 0,
      Answer: [{ name: 'www.github.com', type: 5, TTL: 60, data: 'github.com.' }],
    });
    expect(interpret('www.github.com', 'CNAME', final, []).outcome).toBe('answer');
  });
});

describe('explain', () => {
  it('cuenta el recorrido: pregunta, una derivación por zona, la respuesta final y la del resolver', () => {
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

describe('explain con una cadena de alias', () => {
  const zones = [
    { name: '.', servers: ['a.root-servers.net'] },
    { name: 'com', servers: ['a.gtld-servers.net'] },
    { name: 'a.com', servers: ['ns1.a.com'] },
  ];

  it('dentro de la zona, el servidor da toda la cadena: el primero, el último y los de en medio', () => {
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

  it('el servidor de la zona solo conoce los alias de su zona; el resto lo encuentra el resolver aparte', () => {
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

  it('un solo CNAME no pasa por ninguno', () => {
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
