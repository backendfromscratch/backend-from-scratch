/**
 * dns-lookup lab: the real lookups, over DNS over HTTPS (DoH).
 *
 * The browser cannot speak DNS over UDP, but it can make HTTPS requests: Cloudflare (1.1.1.1) and
 * Google (8.8.8.8) answer DNS queries in JSON and allow being called from any website
 * (CORS). Cloudflare is asked first and, if it does not answer (it is blocked on some corporate networks),
 * Google.
 */
import {
  buildPath,
  interpret,
  parseDohJson,
  suffixes,
  type DnsResponse,
  type LookupResult,
  type RecordType,
} from './dns';

export interface Resolver {
  address: string;
  name: string;
  url: string;
}

/** Who is asked, in order: if the first fails or does not answer in time, the next one. */
export const RESOLVERS: readonly Resolver[] = [
  { address: '1.1.1.1', name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { address: '8.8.8.8', name: 'Google', url: 'https://dns.google/resolve' },
];

/** The first one, which is always asked. */
export const RESOLVER: Resolver = RESOLVERS[0]!;

/** Why the lookup could not be made: offline, no answer in time or the resolver failed. */
export type LookupFailure = 'offline' | 'timeout' | 'resolver';

export class LookupError extends Error {
  constructor(readonly reason: LookupFailure) {
    super(`La consulta DNS ha fallado: ${reason}`);
  }
}

/** An answer, with the address of the resolver that gave it. */
export type ResolvedLookup = LookupResult & { resolver: string };

async function query(
  resolver: Resolver,
  name: string,
  type: RecordType,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<DnsResponse> {
  const url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetchImpl(url, { headers: { accept: 'application/dns-json' }, signal });
  if (!response.ok) throw new LookupError('resolver');
  return parseDohJson(await response.json());
}

interface LookupOptions {
  /** For tests: a fetch that does not go out to the network. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  isOnline?: () => boolean;
  /** For tests: who to ask. */
  resolvers?: readonly Resolver[];
  /** Cancels the lookup (a new lookup cancels the previous one): fails with an AbortError. */
  signal?: AbortSignal;
  /** Called before asking each resolver, to say who is being asked. */
  onResolver?: (resolver: Resolver) => void;
}

/**
 * Looks up `type` of `name` on one resolver and, at the same time, the NS of each suffix, to reconstruct the
 * path. If one request fails, it cancels the others.
 */
async function lookupWith(
  resolver: Resolver,
  name: string,
  type: RecordType,
  {
    fetchImpl,
    timeoutMs,
    isOnline,
    signal,
  }: Required<Omit<LookupOptions, 'resolvers' | 'onResolver' | 'signal'>> &
    Pick<LookupOptions, 'signal'>,
): Promise<ResolvedLookup> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const [final, ...ns] = await Promise.all([
      query(resolver, name, type, fetchImpl, controller.signal),
      ...suffixes(name).map((suffix) =>
        query(resolver, suffix, 'NS', fetchImpl, controller.signal),
      ),
    ]);
    return { ...interpret(name, type, final, buildPath(name, ns)), resolver: resolver.address };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Lookup cancelled', 'AbortError');
    if (error instanceof LookupError) throw error;
    if (controller.signal.aborted) throw new LookupError('timeout');
    if (!isOnline()) throw new LookupError('offline');
    throw new LookupError('resolver');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    // Whatever is still running (if one request failed, the others) is no longer useful.
    controller.abort();
  }
}

/**
 * Looks up `type` of `name`: first on Cloudflare and, if it fails or does not answer in time, on Google.
 * Fails with LookupError if neither gives a useful answer (when offline the next one is not tried),
 * or with an AbortError if it is cancelled from outside.
 */
export async function lookup(
  name: string,
  type: RecordType,
  {
    fetchImpl = fetch,
    timeoutMs = 8000,
    isOnline = () => navigator.onLine,
    resolvers = RESOLVERS,
    signal,
    onResolver,
  }: LookupOptions = {},
): Promise<ResolvedLookup> {
  let failure: unknown = new LookupError('resolver');
  for (const resolver of resolvers) {
    onResolver?.(resolver);
    try {
      return await lookupWith(resolver, name, type, { fetchImpl, timeoutMs, isOnline, signal });
    } catch (error) {
      failure = error;
      const retry = error instanceof LookupError && error.reason !== 'offline';
      if (!retry) throw error;
    }
  }
  throw failure;
}
