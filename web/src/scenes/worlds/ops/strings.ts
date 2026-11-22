/**
 * The ops world's labels in both languages (ops.ts, Ops.astro): what the lesson «IA en producción»
 * puts beside the assistant: the four kinds of tokens and their prices, the shop's two brakes, the
 * daily budget in Redis, the request's three parts and the API's prompt cache, the histogram of the
 * time to first token, Ana, the twelve evals and their judge, and the trace with its span's
 * attributes. Names, keys and figures are each language's project's and page's (tienda-api,
 * shop-api); the model's answers are never words.
 */
import type { Locale } from '../../../lib/locales';

export interface OpsStrings {
  /** The four kinds of tokens in `usage`, as the shop names them: price per million, and the text's example. */
  price: {
    title: string;
    head: readonly [string, string];
    rows: readonly (readonly [string, string, string])[];
    total: readonly [string, string];
  };
  /** The shop's two brakes, both before the model. */
  brakes: { title: string; rows: readonly [string, string] };
  /** Carmen's budget in Redis: its key (the lesson's own, from «Pruébalo»), the limit and the count. */
  budget: { title: string; key: string; limit: string; down: string };
  /** The request's three parts, in the order the API reads them, and the cache mark. */
  prompt: { title: string; parts: readonly [string, string, string]; mark: string; hour: string };
  /** The API's prompt cache. */
  pcache: { title: string; held: string; ttl: string };
  histogram: { title: string; axis: string };
  admin: string;
  /** The twelve evals, in the text's table's order. */
  evals: { title: string; cases: readonly string[] };
  judge: { title: string; result: string };
  /** The trace: the request's span and the SDK's, one per round, and the tool between them. */
  trace: { request: string; call: string; tool: string };
  attrs: { title: string; rows: readonly string[]; none: string };
}

export const strings: Record<Locale, OpsStrings> = {
  es: {
    price: {
      title: 'usage',
      head: ['$/millón', 'tokens'],
      rows: [
        ['entrada', '0,10', '2.000'],
        ['escrituraCache', '0,125', '0'],
        ['lecturaCache', '0,01', '0'],
        ['salida', '0,50', '150'],
      ],
      total: ['total', '0,000275 $'],
    },
    brakes: {
      title: 'antes del modelo',
      rows: ['límite · 20/10 min', 'presupuesto · 100.000'],
    },
    budget: {
      title: 'Redis · presupuesto',
      key: 'presupuesto:3:2026-11-21',
      limit: '100.000',
      down: 'no contesta',
    },
    prompt: {
      title: 'la petición',
      parts: ['tools · herramientas', 'system · instrucciones', 'messages · conversación'],
      mark: 'marca',
      hour: '+ la hora',
    },
    pcache: { title: 'caché de la API', held: 'tools + system', ttl: '5 min' },
    histogram: { title: 'tiempo hasta el primer token', axis: 'segundos →' },
    admin: 'Ana · admin',
    evals: {
      title: 'evals/casos.ts',
      cases: [
        'pedido-propio',
        'dos-pedidos',
        'pedido-ajeno',
        'inyeccion',
        'tienda-fisica',
        'telefono',
        'devolver-taza',
        'plazo-devolucion',
        'coste-envio',
        'abrigo',
        'precio',
        'regalo-cafe',
      ],
    },
    judge: { title: 'juez', result: '{ cumple, motivo }' },
    trace: {
      request: 'POST /v2/asistente',
      call: 'anthropic.messages.create',
      tool: 'herramienta',
    },
    attrs: {
      title: 'atributos del span',
      rows: ['modelo', 'tokens', 'id del mensaje', 'primer trozo'],
      none: 'sin la conversación',
    },
  },
  en: {
    price: {
      title: 'usage',
      head: ['$/million', 'tokens'],
      rows: [
        ['input', '0.10', '2,000'],
        ['cacheWrite', '0.125', '0'],
        ['cacheRead', '0.01', '0'],
        ['output', '0.50', '150'],
      ],
      total: ['total', '$0.000275'],
    },
    brakes: {
      title: 'before the model',
      rows: ['limit · 20/10 min', 'budget · 100,000'],
    },
    budget: {
      title: 'Redis · budget',
      key: 'budget:3:2026-11-21',
      limit: '100,000',
      down: 'not answering',
    },
    prompt: {
      title: 'the request',
      parts: ['tools · the tools', 'system · instructions', 'messages · conversation'],
      mark: 'mark',
      hour: '+ the time',
    },
    pcache: { title: 'the API’s cache', held: 'tools + system', ttl: '5 min' },
    histogram: { title: 'time to first token', axis: 'seconds →' },
    admin: 'Ana · admin',
    evals: {
      title: 'evals/cases.ts',
      cases: [
        'own-order',
        'two-orders',
        'someone-elses-order',
        'injection',
        'physical-shop',
        'phone',
        'return-mug',
        'return-window',
        'shipping-cost',
        'warm',
        'price',
        'coffee-gift',
      ],
    },
    judge: { title: 'judge', result: '{ meets, reason }' },
    trace: {
      request: 'POST /v2/assistant',
      call: 'anthropic.messages.create',
      tool: 'tool',
    },
    attrs: {
      title: 'span attributes',
      rows: ['model', 'tokens', 'message id', 'first piece'],
      none: 'without the conversation',
    },
  },
};
