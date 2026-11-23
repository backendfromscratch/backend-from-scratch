/**
 * The loop world's labels in both languages (loop.ts, Loop.astro): what the lesson «El event loop
 * de Node.js» draws. The shop's API with its one thread, the queue and the fulfilled promises'
 * queue, libuv's four helper threads, the operating system, Luis and Ana, the two `curl` of the
 * text's diagrams and of «Pruébalo», `ejemplos/orden.ts` and what it prints, the four ways out, ten
 * people at once and the restaurant of the analogy. Routes, numbers and outputs are each language's
 * lesson's (tienda-api, shop-api): loop.test.ts checks them against the text.
 */
import type { Locale } from '../../../lib/locales';

/** What a queue's slot or the thread's slot can hold: a request that arrived or a piece of code. */
export type Item =
  | 'luis'
  | 'ana'
  | 'luis1'
  | 'luis2'
  | 'req1'
  | 'req2'
  | 'req3'
  | 'fetch'
  | 'readFile'
  | 'net'
  | 'file'
  | 'products'
  | 'slow'
  | 'slowAsync'
  | 'sync'
  | 'await'
  | 'result'
  | 'list'
  | 'report'
  | 'script'
  | 'then'
  | 'timer'
  | 'items'
  | 'carryOn'
  | 'more';

/** What Luis and Ana have waited (the problem). */
export type Clock = 'fast' | 'waiting' | 'slow' | 'report';

/** What each `curl` printed: the text's diagrams (the blocking part) and «Pruébalo»'s outputs. */
export type Out =
  | 'syncDiagram'
  | 'asyncDiagram'
  | 'late'
  | 'quick'
  | 'slowAlone'
  | 'listAlone'
  | 'slowTogether'
  | 'listTogether'
  | 'asyncTogether'
  | 'listAsync';

export interface LoopStrings {
  api: string;
  /** Under the API's name: Node and its single thread, as the text's diagrams call it. */
  thread: string;
  /** The thread's slot when it runs nothing. */
  free: string;
  queue: string;
  promises: string;
  helpers: string;
  os: string;
  network: string;
  /** The operating system's slot while it watches a connection for libuv. */
  osWaiting: string;
  items: Record<Item, string>;
  clocks: Record<Clock, string>;
  /** What the tenth of ten people waits for a route that blocks a second and a half. */
  tenth: string;
  /** The `curl` clients' routes: /lento, /lento-asincrono, /productos. */
  routes: { slow: string; slowAsync: string; list: string };
  outputs: Record<Out, string>;
  /** `ejemplos/orden.ts`: its file and its four statements, as the text's bullets write them. */
  code: { file: string; lines: readonly [string, string, string, string] };
  /** What it prints, in order: the start of each of the four lines of the TryIt's output. */
  output: { cmd: string; lines: readonly [string, string, string, string] };
  /** The text's table of ways out: what to do and how. */
  ways: { title: string; rows: readonly (readonly [string, string])[] };
  tables: readonly [string, string, string];
  kitchen: string;
}

export const strings: Record<Locale, LoopStrings> = {
  es: {
    api: 'API de la tienda',
    thread: 'Node · un hilo',
    free: 'libre',
    queue: 'la cola',
    promises: 'promesas cumplidas',
    helpers: '4 hilos de ayuda',
    os: 'sistema operativo',
    network: 'la red',
    osWaiting: 'esperando datos',
    items: {
      luis: 'petición de Luis',
      ana: 'petición de Ana',
      luis1: 'Luis: trozo 1',
      luis2: 'Luis: trozo 2',
      req1: 'petición 1',
      req2: 'petición 2',
      req3: 'petición 3',
      fetch: '1: await fetch(…)',
      readFile: '2: await readFile(…)',
      net: 'datos de la red',
      file: 'fichero leído',
      products: 'GET /productos',
      slow: 'GET /lento',
      slowAsync: 'GET /lento-asincrono',
      sync: 'pbkdf2Sync(…)',
      await: 'await pbkdf2Asincrono',
      result: 'resultado de pbkdf2',
      list: 'lista de productos',
      report: 'informe de ventas',
      script: 'orden.ts',
      then: 'then(…)',
      timer: 'temporizador',
      items: 'mil elementos',
      carryOn: 'seguir',
      more: 'mil elementos más',
    },
    clocks: { fast: '3 ms', waiting: 'esperando…', slow: 'más de 1 s', report: '1,5 s' },
    tenth: '15 s',
    routes: { slow: '/lento', slowAsync: '/lento-asincrono', list: '/productos' },
    outputs: {
      syncDiagram: '{"ms":656}',
      asyncDiagram: '{"ms":659}',
      late: 'medio segundo tarde',
      quick: 'en milisegundos',
      slowAlone: '{"ms":668}',
      listAlone: '0.000799 s',
      slowTogether: '0.657301 s',
      listTogether: '0.455318 s',
      asyncTogether: '0.659849 s',
      listAsync: '0.001121 s',
    },
    code: {
      file: 'ejemplos/orden.ts',
      lines: [
        "console.log('1. …')",
        'setTimeout(…, 0)',
        'Promise.resolve().then(…)',
        "console.log('2. …')",
      ],
    },
    output: {
      cmd: 'node ejemplos/orden.ts',
      lines: [
        '1. Empieza el programa',
        '2. Termina el código…',
        '3. La promesa ya resuelta',
        '4. El temporizador…',
      ],
    },
    ways: {
      title: '4 salidas',
      rows: [
        ['versión asíncrona', 'pbkdf2, readFile'],
        ['partir el trabajo', 'setImmediate'],
        ['otro hilo', 'worker_threads'],
        ['otro servicio', 'una cola de trabajos'],
      ],
    },
    tables: ['mesa 1', 'mesa 2', 'mesa 3'],
    kitchen: 'cocina',
  },
  en: {
    api: 'the shop’s API',
    thread: 'Node · one thread',
    free: 'free',
    queue: 'the queue',
    promises: 'fulfilled promises',
    helpers: '4 helper threads',
    os: 'operating system',
    network: 'the network',
    osWaiting: 'waiting for data',
    items: {
      luis: 'Luis’s request',
      ana: 'Ana’s request',
      luis1: 'Luis: piece 1',
      luis2: 'Luis: piece 2',
      req1: 'request 1',
      req2: 'request 2',
      req3: 'request 3',
      fetch: '1: await fetch(…)',
      readFile: '2: await readFile(…)',
      net: 'network data',
      file: 'file read',
      products: 'GET /products',
      slow: 'GET /slow',
      slowAsync: 'GET /slow-async',
      sync: 'pbkdf2Sync(…)',
      await: 'await pbkdf2Async',
      result: 'pbkdf2’s result',
      list: 'product list',
      report: 'sales report',
      script: 'order.ts',
      then: 'then(…)',
      timer: 'timer',
      items: 'a thousand items',
      carryOn: 'carry on',
      more: 'a thousand more',
    },
    clocks: { fast: '3 ms', waiting: 'waiting…', slow: 'over 1 s', report: '1.5 s' },
    tenth: '15 s',
    routes: { slow: '/slow', slowAsync: '/slow-async', list: '/products' },
    outputs: {
      syncDiagram: '{"ms":663}',
      asyncDiagram: '{"ms":658}',
      late: 'half a second late',
      quick: 'in milliseconds',
      slowAlone: '{"ms":666}',
      listAlone: '0.000780 s',
      slowTogether: '0.663501 s',
      listTogether: '0.463793 s',
      asyncTogether: '0.658673 s',
      listAsync: '0.001002 s',
    },
    code: {
      file: 'examples/order.ts',
      lines: [
        "console.log('1. …')",
        'setTimeout(…, 0)',
        'Promise.resolve().then(…)',
        "console.log('2. …')",
      ],
    },
    output: {
      cmd: 'node examples/order.ts',
      lines: ['1. The program starts', '2. The code ends…', '3. The promise…', '4. The timer…'],
    },
    ways: {
      title: '4 ways out',
      rows: [
        ['asynchronous version', 'pbkdf2, readFile'],
        ['split the work', 'setImmediate'],
        ['another thread', 'worker_threads'],
        ['another service', 'a job queue'],
      ],
    },
    tables: ['table 1', 'table 2', 'table 3'],
    kitchen: 'kitchen',
  },
};
