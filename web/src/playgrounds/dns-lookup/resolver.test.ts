import { describe, expect, it } from 'vitest';
import { recorded } from './fixtures';
import { LookupError, lookup, RESOLVER, RESOLVERS } from './resolver';

/** A fetch that answers with the recorded responses and records the URLs it is asked for. */
function recordedFetch(asked: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    asked.push(
      `${url.origin}${url.pathname}?${url.search.slice(1)} ${JSON.stringify(init?.headers)}`,
    );
    const key = `${url.searchParams.get('name')} ${url.searchParams.get('type')}`;
    if (!(key in recorded)) throw new Error(`No recorded response for «${key}»`);
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
  throw new Error('The lookup did not fail');
}

describe('lookup with recorded real responses', () => {
  it('example.com A: two addresses and the path root → com → example.com', async () => {
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

  it('asks Cloudflare over DoH, with the JSON response type', async () => {
    const asked: string[] = [];
    await lookup('example.com', 'A', { fetchImpl: recordedFetch(asked), isOnline: online });
    expect(RESOLVER.url).toBe('https://cloudflare-dns.com/dns-query');
    expect(asked).toContain(
      'https://cloudflare-dns.com/dns-query?name=example.com&type=A {"accept":"application/dns-json"}',
    );
    expect(asked).toHaveLength(4);
  });

  it('www.github.com A: the CNAME and the address, in the github.com zone', async () => {
    const result = await lookup('www.github.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.records[0]).toMatchObject({ type: 'CNAME', data: 'github.com.' });
    expect(result.records[1]).toMatchObject({ type: 'A', name: 'github.com' });
    expect(result.path.map((zone) => zone.name)).toEqual(['.', 'com', 'github.com']);
  });

  it('gmail.com MX: five mail servers', async () => {
    const result = await lookup('gmail.com', 'MX', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.records).toHaveLength(5);
    expect(result.records.every((record) => record.type === 'MX')).toBe(true);
  });

  it('a domain that does not exist: NXDOMAIN, and the path stops at .com', async () => {
    const result = await lookup('no-existe-backend-desde-cero.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.outcome).toBe('nxdomain');
    expect(result.path.map((zone) => zone.name)).toEqual(['.', 'com']);
  });

  it('github.com AAAA: the name exists, but has no such type (NODATA)', async () => {
    const result = await lookup('github.com', 'AAAA', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.outcome).toBe('nodata');
    expect(result.records).toEqual([]);
  });
});

describe('lookup when something fails', () => {
  const networkDown = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;

  it('offline', async () => {
    expect(
      await failure(lookup('example.com', 'A', { fetchImpl: networkDown, isOnline: () => false })),
    ).toBe('offline');
  });

  it('online, but the resolver does not answer the request', async () => {
    expect(
      await failure(lookup('example.com', 'A', { fetchImpl: networkDown, isOnline: online })),
    ).toBe('resolver');
  });

  it('the resolver answers with an HTTP error', async () => {
    const serverError = (async () => new Response('failure', { status: 500 })) as typeof fetch;
    expect(
      await failure(lookup('example.com', 'A', { fetchImpl: serverError, isOnline: online })),
    ).toBe('resolver');
  });

  it('the resolver answers something that is not a DNS response', async () => {
    const odd = (async () => new Response('{"hola":1}', { status: 200 })) as typeof fetch;
    expect(await failure(lookup('example.com', 'A', { fetchImpl: odd, isOnline: online }))).toBe(
      'resolver',
    );
  });

  it('the resolver does not answer in time', async () => {
    const silent = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Cancelled', 'AbortError')),
        );
      })) as typeof fetch;
    expect(
      await failure(
        lookup('example.com', 'A', { fetchImpl: silent, isOnline: online, timeoutMs: 20 }),
      ),
    ).toBe('timeout');
  });
});

/** A fetch that waits until it is cancelled, and records the signals it receives. */
function hanging(signals: AbortSignal[]): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      if (init?.signal) signals.push(init.signal);
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('Cancelled', 'AbortError')),
      );
    })) as typeof fetch;
}

describe('lookup with fallback: if Cloudflare does not answer, Google', () => {
  it('the resolvers, in order: 1.1.1.1 (Cloudflare) and 8.8.8.8 (Google)', () => {
    expect(RESOLVERS.map((resolver) => resolver.address)).toEqual(['1.1.1.1', '8.8.8.8']);
    expect(RESOLVERS[1]?.url).toBe('https://dns.google/resolve');
  });

  it('if Cloudflare is blocked (corporate networks), Google answers, and who answered is stated', async () => {
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

  it('with Cloudflare working, Google is not even asked', async () => {
    const result = await lookup('example.com', 'A', {
      fetchImpl: recordedFetch(),
      isOnline: online,
    });
    expect(result.resolver).toBe('1.1.1.1');
  });

  it('when offline no other resolver is tried: it would be pointless', async () => {
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

describe('lookup cancels what is no longer useful', () => {
  it('if one request fails, it cancels the others (with long names there are dozens)', async () => {
    const signals: AbortSignal[] = [];
    const wait = hanging(signals);
    const oneFails = ((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input)).searchParams.get('type') === 'A'
        ? Promise.resolve(new Response('failure', { status: 500 }))
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

  it('a new lookup cancels the previous one: with the outside signal everything is cancelled, with no fallback', async () => {
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
