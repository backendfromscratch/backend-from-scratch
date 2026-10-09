import { describe, expect, it } from 'vitest';
import { buildPath, explain, interpret, parseDohJson, suffixes, type RecordType } from './dns';
import { minTtl, serversLabel, stepText, summary, zoneLabel } from './describe';
import { recorded } from './fixtures';
import { strings } from './strings';

const { es, en } = strings;

/** El resultado que daría lookup() con las respuestas grabadas. */
function result(name: string, type: RecordType) {
  const ns = suffixes(name).map((suffix) => parseDohJson(recorded[`${suffix} NS`]));
  return interpret(name, type, parseDohJson(recorded[`${name} ${type}`]), buildPath(name, ns));
}

describe('zoneLabel y serversLabel', () => {
  it('nombra la raíz, los TLD con su punto y el resto tal cual', () => {
    expect(zoneLabel('.', es)).toBe('la raíz');
    expect(zoneLabel('com', es)).toBe('.com');
    expect(zoneLabel('example.com', es)).toBe('example.com');
  });

  it('enseña el primer servidor y cuántos más hay', () => {
    expect(serversLabel(['a.root-servers.net'], es)).toBe('a.root-servers.net');
    expect(
      serversLabel(['a.root-servers.net', 'b.root-servers.net', 'c.root-servers.net'], es),
    ).toBe('a.root-servers.net y 2 más');
  });
});

describe('stepText', () => {
  it('cuenta el recorrido de example.com A con los servidores reales', () => {
    const texts = explain(result('example.com', 'A')).map((step) => stepText(step, es));
    expect(texts[0]).toEqual({
      from: 'Tu navegador',
      to: 'Resolver 1.1.1.1',
      says: '¿Qué registros A tiene example.com?',
    });
    expect(texts[1]).toEqual({
      from: 'Resolver 1.1.1.1',
      to: 'la raíz (a.root-servers.net y 12 más)',
      says: 'No lo sé, pero .com lo llevan a.gtld-servers.net y 12 más. Pregúntales a ellos.',
    });
    expect(texts[3]?.to).toBe('example.com (elliott.ns.cloudflare.com y 1 más)');
    expect(texts[3]?.says).toMatch(/^Respuesta: (104\.20\.23\.154|172\.66\.147\.243), /);
    expect(texts[4]?.from).toBe('Resolver 1.1.1.1');
    expect(texts[4]?.to).toBe('Tu navegador');
    expect(texts[4]?.says).toMatch(
      /^Aquí tienes la respuesta\. Le quedan \d+ segundos en mi caché/,
    );
  });

  it('con un CNAME a la misma zona, el autoritativo da el alias y la dirección en la misma respuesta', () => {
    const steps = explain(result('www.github.com', 'A'));
    expect(steps.map((step) => step.kind)).toEqual([
      'ask',
      'referral',
      'referral',
      'final',
      'reply',
    ]);
    expect(stepText(steps[3]!, es).says).toMatch(
      /^www\.github\.com es un alias \(CNAME\) de github\.com\. Respuesta: 140\.82\.121\.\d+\.$/,
    );
  });

  it('con un CNAME a otra zona, el autoritativo solo da el alias y el resolver busca el destino aparte', () => {
    const steps = explain({
      name: 'www.microsoft.com',
      type: 'A',
      outcome: 'answer',
      status: 'NOERROR',
      path: [
        { name: '.', servers: ['a.root-servers.net'] },
        { name: 'com', servers: ['a.gtld-servers.net'] },
        { name: 'microsoft.com', servers: ['ns1-39.azure-dns.com'] },
      ],
      records: [
        {
          name: 'www.microsoft.com',
          type: 'CNAME',
          ttl: 3600,
          data: 'www.microsoft.com-c-3.edgekey.net.',
        },
        {
          name: 'www.microsoft.com-c-3.edgekey.net',
          type: 'CNAME',
          ttl: 900,
          data: 'e13678.dscb.akamaiedge.net.',
        },
        { name: 'e13678.dscb.akamaiedge.net', type: 'A', ttl: 20, data: '23.53.36.42' },
      ],
    });
    expect(steps.map((step) => step.kind)).toEqual([
      'ask',
      'referral',
      'referral',
      'final',
      'alias',
      'reply',
    ]);
    // El servidor de microsoft.com solo conoce su alias; el resto de la cadena lo encuentra el resolver.
    expect(stepText(steps[3]!, es).says).toBe(
      'www.microsoft.com es un alias (CNAME) de www.microsoft.com-c-3.edgekey.net. Busca ese nombre.',
    );
    expect(stepText(steps[4]!, es)).toEqual({
      from: 'Resolver 1.1.1.1',
      to: 'www.microsoft.com-c-3.edgekey.net',
      says: 'Busco ese nombre aparte: es a su vez un alias (CNAME) de e13678.dscb.akamaiedge.net. Respuesta: 23.53.36.42.',
    });
  });

  it('con un alias a la misma zona sin registros del tipo pedido, lo dice el autoritativo', () => {
    const steps = explain(result('www.github.com', 'AAAA'));
    expect(steps.map((step) => step.kind)).toEqual([
      'ask',
      'referral',
      'referral',
      'final',
      'reply',
    ]);
    expect(stepText(steps[3]!, es).says).toBe(
      'www.github.com es un alias (CNAME) de github.com. github.com no tiene registros AAAA.',
    );
    expect(stepText(steps[4]!, es).says).toBe(
      'El nombre existe, pero no tiene registros AAAA. También lo apunto en mi caché.',
    );
  });

  it('con un alias a otra zona que no existe, el resolver lo averigua aparte', () => {
    const steps = explain({
      name: 'www.ejemplo.com',
      type: 'A',
      outcome: 'nxdomain',
      status: 'NXDOMAIN',
      path: [
        { name: '.', servers: ['a.root-servers.net'] },
        { name: 'com', servers: ['a.gtld-servers.net'] },
        { name: 'ejemplo.com', servers: ['ns1.ejemplo.com'] },
      ],
      records: [{ name: 'www.ejemplo.com', type: 'CNAME', ttl: 60, data: 'roto.otra-cdn.net.' }],
    });
    expect(steps.map((step) => step.kind)).toEqual([
      'ask',
      'referral',
      'referral',
      'final',
      'alias',
      'reply',
    ]);
    expect(stepText(steps[3]!, es).says).toBe(
      'www.ejemplo.com es un alias (CNAME) de roto.otra-cdn.net. Busca ese nombre.',
    );
    expect(stepText(steps[4]!, es).says).toBe('Busco ese nombre aparte: no existe (NXDOMAIN).');
  });

  it('ordena los MX por prioridad y quita el punto final de los nombres', () => {
    const steps = explain(result('gmail.com', 'MX'));
    expect(stepText(steps[3]!, es).says).toBe(
      'Respuesta: 5 gmail-smtp-in.l.google.com, 10 alt1.gmail-smtp-in.l.google.com, 20 alt2.gmail-smtp-in.l.google.com y 2 más.',
    );
  });

  it('dice quién responde que un dominio no existe', () => {
    const steps = explain(result('no-existe-backend-desde-cero.com', 'A'));
    const final = stepText(steps[steps.length - 2]!, es);
    expect(final.to).toBe('.com (a.gtld-servers.net y 12 más)');
    expect(final.says).toBe('Ese nombre no existe (NXDOMAIN).');
  });

  it('explica el NODATA con el tipo pedido, en los dos idiomas', () => {
    const steps = explain(result('github.com', 'AAAA'));
    expect(stepText(steps[steps.length - 2]!, es).says).toBe(
      'El nombre existe, pero no tiene registros AAAA.',
    );
    expect(stepText(steps[steps.length - 2]!, en).says).toBe(
      'The name exists, but it has no AAAA records.',
    );
  });

  it('un SERVFAIL no se lo atribuye a la última zona que sí respondió', () => {
    const steps = explain({
      name: 'example.com',
      type: 'A',
      outcome: 'error',
      status: 'SERVFAIL',
      path: [{ name: '.', servers: ['a.root-servers.net'] }],
      records: [],
    });
    expect(stepText(steps[1]!, es).says).toBe(
      'Te derivo más abajo, pero desde ahí el resolver no ha conseguido una respuesta válida (SERVFAIL).',
    );
  });
});

describe('stepText: el resolver, los códigos de error y las cadenas de alias', () => {
  it('nombra el resolver que ha respondido: 8.8.8.8 si Cloudflare no respondió', () => {
    const [ask] = explain(result('example.com', 'A'));
    expect(stepText(ask!, es).to).toBe('Resolver 1.1.1.1');
    expect(stepText(ask!, es, '8.8.8.8').to).toBe('Resolver 8.8.8.8');
  });

  it('un REFUSED se llama REFUSED, no SERVFAIL', () => {
    const refused = {
      name: 'example.com',
      type: 'A' as const,
      outcome: 'error' as const,
      status: 'REFUSED',
      path: [{ name: '.', servers: ['a.root-servers.net'] }],
      records: [],
    };
    const texts = explain(refused).map((step) => stepText(step, es).says);
    expect(texts.join(' ')).toContain('(REFUSED)');
    expect(texts.join(' ')).not.toContain('SERVFAIL');
    expect(summary(refused, es)).toContain('(REFUSED)');
    expect(summary(refused, en)).toContain('(REFUSED)');
  });

  it('una cadena de alias dentro de la zona dice por dónde pasa', () => {
    const final = parseDohJson({
      Status: 0,
      Answer: [
        { name: 'www.a.com', type: 5, TTL: 60, data: 'cdn.a.com.' },
        { name: 'cdn.a.com', type: 5, TTL: 60, data: 'edge.a.com.' },
        { name: 'edge.a.com', type: 1, TTL: 60, data: '192.0.2.1' },
      ],
    });
    const steps = explain(interpret('www.a.com', 'A', final, [{ name: 'a.com', servers: ['ns'] }]));
    const says = stepText(
      steps.find((step) => step.kind === 'final')!,
      es,
    ).says;
    expect(says).toBe(
      'www.a.com es un alias (CNAME) de edge.a.com, pasando por cdn.a.com. Respuesta: 192.0.2.1.',
    );
  });
});

describe('minTtl y summary', () => {
  it('usa el TTL más bajo: es lo que dura la respuesta completa en la caché', () => {
    expect(
      minTtl([
        { name: 'a', type: 'A', ttl: 300, data: '' },
        { name: 'a', type: 'A', ttl: 42, data: '' },
      ]),
    ).toBe(42);
  });

  it('resume el resultado para anunciarlo, con singular y plural', () => {
    expect(summary(result('gmail.com', 'MX'), es)).toBe(
      'Respuesta: 5 registros. Recorre los pasos para ver cómo se ha encontrado.',
    );
    const one = {
      name: 'x.com',
      type: 'A' as const,
      outcome: 'answer' as const,
      status: 'NOERROR',
      path: [],
      records: [{ name: 'x.com', type: 'A', ttl: 1, data: '192.0.2.1' }],
    };
    expect(summary(one, es)).toBe(
      'Respuesta: 1 registro. Recorre los pasos para ver cómo se ha encontrado.',
    );
    expect(summary(one, en)).toBe(
      'Answer: 1 record. Step through the trip to see how it was found.',
    );
    expect(summary(result('github.com', 'AAAA'), es)).toBe(
      'El dominio existe, pero no tiene registros AAAA (NODATA).',
    );
  });
});

describe('strings', () => {
  it('los dos idiomas tienen las mismas claves', () => {
    const keys = (value: object): string[] =>
      Object.entries(value).flatMap(([key, child]) =>
        typeof child === 'object' && child !== null ? keys(child).map((k) => `${key}.${k}`) : [key],
      );
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });
});
