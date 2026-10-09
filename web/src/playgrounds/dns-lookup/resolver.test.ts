import { describe, expect, it } from 'vitest';
import { recorded } from './fixtures';
import { LookupError, lookup, RESOLVER, RESOLVERS } from './resolver';

/** Un fetch que contesta con las respuestas grabadas y apunta las URL que le piden. */
function recordedFetch(asked: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    asked.push(
      `${url.origin}${url.pathname}?${url.search.slice(1)} ${JSON.stringify(init?.headers)}`,
    );
    const key = `${url.searchParams.get('name')} ${url.searchParams.get('type')}`;
    if (!(key in recorded)) throw new Error(`Sin respuesta grabada para «${key}»`);
    return new Response(JSON.stringify(recorded[key]), { status: 200 });
  }) as typeof fetch;
}

const online = () => true;

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LookupError) return error.reason;
    throw error;
  }
  throw new Error('La consulta no ha fallado');
}

describe('lookup con respuestas reales grabadas', () => {
  it('example.com A: dos direcciones y el recorrido raíz → com → example.com', async () => {
    const result = await lookup('example.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.outcome).toBe('answer');
    expect(result.records.map((record) => record.data).sort()).toEqual([
      '104.20.23.154',
      '172.66.147.243',
    ]);
    expect(result.path.map((zone) => zone.name)).toEqual(['.', 'com', 'example.com']);
  });

  it('pregunta a Cloudflare por DoH, con el tipo de respuesta JSON', async () => {
    const asked: string[] = [];
    await lookup('example.com', 'A', { fetchImpl: recordedFetch(asked), isOnline: online });
    expect(RESOLVER.url).toBe('https://cloudflare-dns.com/dns-query');
    expect(asked).toContain(
      'https://cloudflare-dns.com/dns-query?name=example.com&type=A {"accept":"application/dns-json"}',
    );
    expect(asked).toHaveLength(4);
  });

  it('www.github.com A: el CNAME y la dirección, en la zona github.com', async () => {
    const result = await lookup('www.github.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.records[0]).toMatchObject({ type: 'CNAME', data: 'github.com.' });
    expect(result.records[1]).toMatchObject({ type: 'A', name: 'github.com' });
    expect(result.path.map((zone) => zone.name)).toEqual(['.', 'com', 'github.com']);
  });

  it('gmail.com MX: cinco servidores de correo', async () => {
    const result = await lookup('gmail.com', 'MX', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.records).toHaveLength(5);
    expect(result.records.every((record) => record.type === 'MX')).toBe(true);
  });

  it('un dominio que no existe: NXDOMAIN, y el recorrido se queda en .com', async () => {
    const result = await lookup('no-existe-backend-desde-cero.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.outcome).toBe('nxdomain');
    expect(result.path.map((zone) => zone.name)).toEqual(['.', 'com']);
  });

  it('github.com AAAA: el nombre existe, pero no tiene ese tipo (NODATA)', async () => {
    const result = await lookup('github.com', 'AAAA', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.outcome).toBe('nodata');
    expect(result.records).toEqual([]);
  });
});

describe('lookup cuando algo falla', () => {
  const networkDown = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;

  it('sin conexión', async () => {
    expect(
      await failure(lookup('example.com', 'A', { fetchImpl: networkDown, isOnline: () => false })),
    ).toBe('offline');
  });

  it('con conexión, pero el resolver no contesta a la petición', async () => {
    expect(
      await failure(lookup('example.com', 'A', { fetchImpl: networkDown, isOnline: online })),
    ).toBe('resolver');
  });

  it('el resolver responde con un error HTTP', async () => {
    const serverError = (async () => new Response('fallo', { status: 500 })) as typeof fetch;
    expect(
      await failure(lookup('example.com', 'A', { fetchImpl: serverError, isOnline: online })),
    ).toBe('resolver');
  });

  it('el resolver responde algo que no es una respuesta DNS', async () => {
    const odd = (async () => new Response('{"hola":1}', { status: 200 })) as typeof fetch;
    expect(await failure(lookup('example.com', 'A', { fetchImpl: odd, isOnline: online }))).toBe(
      'resolver',
    );
  });

  it('el resolver no responde a tiempo', async () => {
    const silent = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Cancelada', 'AbortError')),
        );
      })) as typeof fetch;
    expect(
      await failure(
        lookup('example.com', 'A', { fetchImpl: silent, isOnline: online, timeoutMs: 20 }),
      ),
    ).toBe('timeout');
  });
});

/** Un fetch que se queda esperando hasta que lo cancelan, y apunta las señales que recibe. */
function hanging(signals: AbortSignal[]): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      if (init?.signal) signals.push(init.signal);
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Cancelada', 'AbortError')),
      );
    })) as typeof fetch;
}

describe('lookup con respaldo: si Cloudflare no responde, Google', () => {
  it('los resolvers, en orden: 1.1.1.1 (Cloudflare) y 8.8.8.8 (Google)', () => {
    expect(RESOLVERS.map((resolver) => resolver.address)).toEqual(['1.1.1.1', '8.8.8.8']);
    expect(RESOLVERS[1]?.url).toBe('https://dns.google/resolve');
  });

  it('si Cloudflare está bloqueado (redes de empresa), responde Google, y se dice quién', async () => {
    const asked: string[] = [];
    const google = recordedFetch(asked);
    const blockedCloudflare = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('https://cloudflare-dns.com')) {
        throw new TypeError('Failed to fetch');
      }
      return google(input, init);
    }) as typeof fetch;
    const tried: string[] = [];
    const result = await lookup('example.com', 'A', {
      fetchImpl: blockedCloudflare,
      isOnline: online,
      onResolver: (resolver) => tried.push(resolver.address),
    });
    expect(result.outcome).toBe('answer');
    expect(result.resolver).toBe('8.8.8.8');
    expect(tried).toEqual(['1.1.1.1', '8.8.8.8']);
    expect(asked.every((url) => url.startsWith('https://dns.google/resolve?'))).toBe(true);
  });

  it('con Cloudflare funcionando, ni se pregunta a Google', async () => {
    const result = await lookup('example.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.resolver).toBe('1.1.1.1');
  });

  it('sin conexión no se prueba otro resolver: no serviría de nada', async () => {
    const tried: string[] = [];
    const networkDown = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(
      await failure(
        lookup('example.com', 'A', {
          fetchImpl: networkDown,
          isOnline: () => false,
          onResolver: (resolver) => tried.push(resolver.address),
        }),
      ),
    ).toBe('offline');
    expect(tried).toEqual(['1.1.1.1']);
  });
});

describe('lookup cancela lo que ya no sirve', () => {
  it('si una petición falla, cancela las demás (con nombres largos son decenas)', async () => {
    const signals: AbortSignal[] = [];
    const wait = hanging(signals);
    const oneFails = ((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input)).searchParams.get('type') === 'A'
        ? Promise.resolve(new Response('fallo', { status: 500 }))
        : wait(input, init)) as typeof fetch;
    expect(
      await failure(
        lookup('www.example.com', 'A', {
          fetchImpl: oneFails,
          isOnline: online,
          resolvers: [RESOLVER],
        }),
      ),
    ).toBe('resolver');
    expect(signals.length).toBeGreaterThan(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it('una consulta nueva cancela la anterior: con la señal de fuera se cancela todo, sin respaldo', async () => {
    const signals: AbortSignal[] = [];
    const tried: string[] = [];
    const controller = new AbortController();
    const pending = lookup('example.com', 'A', {
      fetchImpl: hanging(signals),
      isOnline: online,
      signal: controller.signal,
      onResolver: (resolver) => tried.push(resolver.address),
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(tried).toEqual(['1.1.1.1']);
  });
});
