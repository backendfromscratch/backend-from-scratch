/**
 * Laboratorio dns-lookup: las consultas de verdad, por DNS sobre HTTPS (DoH).
 *
 * El navegador no puede hablar DNS por UDP, pero sí hacer peticiones HTTPS: Cloudflare (1.1.1.1) y
 * Google (8.8.8.8) responden a las consultas DNS en JSON y permiten llamarlos desde cualquier web
 * (CORS). Se pregunta a Cloudflare y, si no responde (en algunas redes de empresa está bloqueado), a
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

/** A quién se pregunta, en orden: si el primero falla o no responde a tiempo, el siguiente. */
export const RESOLVERS: readonly Resolver[] = [
  { address: '1.1.1.1', name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { address: '8.8.8.8', name: 'Google', url: 'https://dns.google/resolve' },
];

/** El primero, al que se pregunta siempre. */
export const RESOLVER: Resolver = RESOLVERS[0]!;

/** Por qué no se ha podido consultar: sin conexión, sin respuesta a tiempo o el resolver ha fallado. */
export type LookupFailure = 'offline' | 'timeout' | 'resolver';

export class LookupError extends Error {
  constructor(readonly reason: LookupFailure) {
    super(`La consulta DNS ha fallado: ${reason}`);
  }
}

/** Una respuesta, con la dirección del resolver que la ha dado. */
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
  /** Para los tests: un fetch que no sale a la red. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  isOnline?: () => boolean;
  /** Para los tests: a quién preguntar. */
  resolvers?: readonly Resolver[];
  /** Cancela la consulta (una consulta nueva cancela la anterior): falla con un AbortError. */
  signal?: AbortSignal;
  /** Se llama antes de preguntar a cada resolver, para decir a quién se pregunta. */
  onResolver?: (resolver: Resolver) => void;
}

/**
 * Consulta `type` de `name` a un resolver y, a la vez, los NS de cada sufijo, para reconstruir el
 * recorrido. Si una petición falla, cancela las demás.
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
    if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError');
    if (error instanceof LookupError) throw error;
    if (controller.signal.aborted) throw new LookupError('timeout');
    if (!isOnline()) throw new LookupError('offline');
    throw new LookupError('resolver');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    // Lo que siga en marcha (si una petición ha fallado, las demás) ya no sirve.
    controller.abort();
  }
}

/**
 * Consulta `type` de `name`: primero a Cloudflare y, si falla o no responde a tiempo, a Google.
 * Falla con LookupError si ninguno da una respuesta útil (sin conexión no se prueba el siguiente),
 * o con un AbortError si se cancela desde fuera.
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
