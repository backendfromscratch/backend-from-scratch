/**
 * The scenes of «El event loop de Node.js: qué bloquea y qué no» / "Node.js event loop explained:
 * what blocks it" (translationKey event-loop), one per part of the text, in the order of its
 * <Scene id="…" /> cues: Luis's report and Ana's list, a restaurant with a single waiter, one thread
 * and its queue, waiting that doesn't block, calculating that does (the text's two diagrams), the
 * order of code, promises and timers, the four ways out, ten people at once, and «Pruébalo»'s `curl`
 * runs (worlds/loop/). Routes, numbers and outputs are each language's lesson's (strings.ts).
 *
 * Everything that arrives waits in the queue first, and the event loop takes the first thing to your
 * thread; what the thread calculates fills its orange bar, what a helper thread calculates fills a
 * green one.
 */
import type { Director } from '../core/director';
import type { Kind, LessonModule, Text } from '../core/types';
import {
  dequeue,
  empty,
  enqueue,
  fill,
  INITIAL,
  kindOf,
  loop,
  route,
  walk,
  type LoopState,
} from '../worlds/loop/loop';
import { strings, type Item } from '../worlds/loop/strings';

type D = Director<LoopState>;

const BAR = '#lp-bar i';
const lane = (i: number) => `#lp-h-${i} i`;
const label = (d: D, item: Item) => strings[d.lang].items[item];

const PEOPLE = new Set(['luis', 'ana']);
const REQUEST: Text = { es: 'petición', en: 'request' };
const DONE: Text = { es: 'listo', en: 'done' };

/**
 * A promise that runs in the background while the scene goes on (a bar that fills while the
 * captions are read): leaving the scene cancels it, and that is no error.
 */
function meanwhile(job: Promise<void>): Promise<void> {
  job.catch(() => {});
  return job;
}

/** Something arrives from `from` and waits in the queue's next free slot. */
async function arrive(d: D, from: string, item: Item, text?: Text | string): Promise<void> {
  const to = `#lp-q-${d.state.lpQueue.length + 1}`;
  await d.fly(route(d, from, to), text ?? label(d, item), kindOf(item), {
    small: true,
    dur: 700,
    arrive: to,
  });
  d.set({ lpQueue: enqueue(d.state.lpQueue, item) });
}

/**
 * The event loop takes the first thing from the queue to `to` (your thread, by default), which then
 * runs `run`. The queue moves up at once: what is first has left it.
 */
async function take(d: D, run: Item, to = '#lp-run'): Promise<void> {
  const first = d.state.lpQueue[0]!;
  d.set({ lpQueue: dequeue(d.state.lpQueue) });
  await d.fly(route(d, '#lp-q-1', to), label(d, first), kindOf(first), {
    small: true,
    dur: 550,
    arrive: to,
  });
  d.set({ lpRun: run });
}

/** Your thread calculates for `ms` (its bar fills), and is done. */
async function calculate(d: D, ms: number): Promise<void> {
  await fill(d, BAR, 1, ms);
  empty(d, BAR);
}

/** The API answers a client. */
async function reply(d: D, to: string, text: Text | string = '200', kind: Kind = 'http') {
  // A box lights up when the answer arrives; a person does not (the glow is a square).
  const arrive = PEOPLE.has(to) ? undefined : to;
  await d.fly(route(d, 'nodeapi', to), text, kind, { small: true, dur: 650, arrive });
}

const lesson: LessonModule<LoopState> = {
  initial: INITIAL,
  worlds: [loop],
  scenes: [
    {
      id: 'problem',
      view: 'story',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Un informe que frena la tienda', en: 'A report that stalls the shop' },
      start: () => ({}),
      end: () => ({ lpLuis: 'report', lpAna: 'slow' }),
      async play(d) {
        const products: Text = { es: 'productos', en: 'products' };
        const list: Text = { es: 'lista', en: 'list' };
        const report: Text = { es: 'informe', en: 'report' };
        await d.wait(400);
        await d.fly(route(d, 'ana', 'nodeapi'), products, 'http', { dur: 750, arrive: 'nodeapi' });
        d.set({ lpRun: 'list' });
        await d.wait(250);
        d.set({ lpRun: '' });
        await reply(d, 'ana', list);
        d.set({ lpAna: 'fast' });
        await d.caption({
          es: 'La lista de productos de la tienda tardaba 3 milisegundos',
          en: 'The shop’s product list used to take 3 milliseconds',
        });
        await d.fly(route(d, 'luis', 'nodeapi'), report, 'http', { dur: 750, arrive: 'nodeapi' });
        d.set({ lpRun: 'report', lpAna: '' });
        const calculating = meanwhile(fill(d, BAR, 1, 6200));
        await d.caption({
          es: 'Luis pide un informe: calcularlo tarda un segundo y medio',
          en: 'Luis asks for a report: calculating it takes a second and a half',
        });
        // Ana's request reaches the API and waits under it, outside: the API is busy.
        const api = d.box('nodeapi');
        const outside = { x: api.x + api.w * 0.3, y: api.y + api.h + 14 };
        await d.fly([d.pt('ana', 'r'), outside], products, 'http', { dur: 750 });
        const waiting = await d.note(outside, products, {
          look: 'tag',
          kind: 'muted',
          where: 'center',
        });
        d.set({ lpAna: 'waiting' });
        await d.caption({
          es: 'Mientras, Ana recarga la tienda, y la lista se queda esperando',
          en: 'Meanwhile, Ana reloads the shop, and the list is left waiting',
        });
        await calculating;
        empty(d, BAR);
        d.set({ lpRun: '' });
        await reply(d, 'luis', report);
        d.set({ lpLuis: 'report' });
        await d.vanish(waiting);
        await d.fly([outside, d.pt('nodeapi', 'b', -api.w * 0.2)], products, 'http', {
          small: true,
          dur: 400,
          arrive: 'nodeapi',
        });
        d.set({ lpRun: 'list' });
        await d.wait(250);
        d.set({ lpRun: '' });
        await reply(d, 'ana', list);
        d.set({ lpAna: 'slow' });
        await d.caption({
          es: 'La lista tarda más de un segundo, a Ana y a todos los que compran',
          en: 'The list takes over a second, for Ana and everyone shopping',
        });
        await d.caption({
          es: 'El servidor no se ha caído: está ocupado con el informe',
          en: 'The server hasn’t crashed: it’s busy with the report',
        });
      },
    },
    {
      id: 'analogy',
      view: 'dining',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Un solo camarero', en: 'A single waiter' },
      start: () => ({ lpWaiter: 1 }),
      end: () => ({ lpWaiter: 3, lpPotatoes: true }),
      async play(d) {
        const slip: Text = { es: 'nota', en: 'order' };
        const head = '#lp-server-head';
        const ding = () =>
          d.note(
            d.pt('#lp-bell', 't'),
            { es: '¡din!', en: 'ding!' },
            {
              look: 'tag',
              kind: 'tcp',
              ttl: 900,
            },
          );
        await d.wait(400);
        await d.caption({
          es: 'Toma nota en la mesa 1 y lleva el papel a la cocina',
          en: 'He takes the order at table 1 and carries the slip to the kitchen',
        });
        await Promise.all([
          walk(d, 'pass', 1100),
          d.fly([d.pt(head, 't'), d.pt('#lp-bell', 'l')], slip, 'http', { small: true, dur: 1100 }),
        ]);
        await d.caption({
          es: 'Mientras cocinan, no se queda esperando: va a la mesa 2',
          en: 'While they cook, he doesn’t stand there waiting: he goes to table 2',
        });
        await walk(d, 2, 1000);
        await d.note(d.pt('#lp-table-2', 't'), slip, { look: 'tag', kind: 'http', ttl: 700 });
        d.glow('#lp-bell', 'tcp');
        await ding();
        await walk(d, 'pass', 800);
        await Promise.all([
          walk(d, 1, 1200),
          d.fly(
            [d.pt('#lp-bell', 'l'), d.pt('#lp-table-1', 't')],
            { es: 'plato', en: 'dish' },
            'http',
            {
              small: true,
              dur: 1200,
              arrive: '#lp-table-1',
            },
          ),
        ]);
        await d.caption({
          es: 'Cuando suena la campana, sirve el plato: así atiende él solo veinte mesas',
          en: 'When the bell rings, he serves the dish: that’s how he alone serves twenty tables',
        });
        await walk(d, 3, 1300);
        d.set({ lpPotatoes: true });
        const peeling = meanwhile(fill(d, '#lp-peel i', 1, 6500));
        await d.caption({
          es: 'La mesa 3 le pide pelar tres kilos de patatas, y mientras pela, todas esperan',
          en: 'Table 3 asks him to peel six pounds of potatoes, and while he peels, every table waits',
        });
        const waits: Text = { es: 'esperan', en: 'waiting' };
        await d.tag(d.pt('#lp-diner-1-head', 't', 0, -4), waits, 'muted');
        await d.tag(d.pt('#lp-diner-2-head', 't', 0, -4), waits, 'muted');
        d.glow('#lp-bell', 'tcp');
        await ding();
        await d.caption({
          es: 'El camarero es el hilo; la cocina, el sistema operativo; pelar, un cálculo largo',
          en: 'The waiter is the thread; the kitchen, the operating system; peeling, a long calculation',
        });
        await peeling;
      },
    },
    {
      id: 'thread',
      view: 'loop',
      kind: 'tcp',
      chip: { es: 'un hilo', en: 'one thread' },
      title: { es: 'Un solo hilo para tu código', en: 'A single thread for your code' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await arrive(d, 'luis', 'luis', REQUEST);
        await arrive(d, 'ana', 'ana', REQUEST);
        await d.caption({
          es: 'Todo tu JavaScript corre en un solo hilo, que hace una cosa cada vez',
          en: 'All your JavaScript runs on a single thread, one thing at a time',
        });
        await take(d, 'luis1');
        await calculate(d, 700);
        await d.caption({
          es: 'El event loop saca lo primero de la cola y lo ejecuta hasta el final',
          en: 'The event loop takes the first thing from the queue and runs it to the end',
        });
        d.set({ lpRun: '' });
        // The second piece waits outside the thread, above it, for its promise.
        const promise = await d.note(
          d.pt('nodeapi', 't'),
          { es: 'await: espera su promesa', en: 'await: waits for its promise' },
          { look: 'tag', kind: 'muted', where: 'above', gap: 8 },
        );
        await d.caption({
          es: 'Con await, la ruta se parte en dos trozos',
          en: 'With await, the route splits into two pieces',
        });
        await take(d, 'ana');
        await calculate(d, 500);
        d.set({ lpRun: '' });
        await reply(d, 'ana');
        await d.caption({
          es: 'Entre los dos, el hilo queda libre y atiende a Ana',
          en: 'Between the two, the thread is free, and it serves Ana',
        });
        // It goes round the API's right side into the queue (an instant run never drew the note).
        const at = promise ? d.box(promise) : d.box('nodeapi');
        await d.vanish(promise);
        const start = { x: at.x + at.w / 2, y: at.y + at.h / 2 };
        const slot = d.pt('#lp-q-1', 'r');
        const side = Math.min(d.stage.size().w - 8, d.box('nodeapi').x + d.box('nodeapi').w + 14);
        await d.fly(
          [start, { x: side, y: start.y }, { x: side, y: slot.y }, slot],
          label(d, 'luis2'),
          'tcp',
          { small: true, dur: 1000, arrive: '#lp-q-1' },
        );
        d.set({ lpQueue: ['luis2'] });
        await d.caption({
          es: 'Cuando su promesa se cumple, el segundo trozo entra en la cola',
          en: 'When its promise is fulfilled, the second piece enters the queue',
        });
        await take(d, 'luis2');
        await calculate(d, 500);
        d.set({ lpRun: '' });
        await reply(d, 'luis');
      },
    },
    {
      id: 'waiting',
      view: 'pool',
      kind: 'tcp',
      chip: { es: 'esperar', en: 'waiting' },
      title: { es: 'Esperar no bloquea', en: 'Waiting doesn’t block' },
      start: () => ({ lpQueue: ['req1', 'req2', 'req3'] }),
      end: () => ({ lpQueue: ['file', 'net'] }),
      async play(d) {
        await d.wait(400);
        await take(d, 'fetch');
        await d.fly(route(d, 'nodeapi', 'libuv'), 'fetch', 'tcp', { small: true, dur: 650 });
        d.set({ lpRun: '' });
        await d.fly(route(d, 'libuv', 'os'), { es: 'avísame', en: 'let me know' }, 'tcp', {
          small: true,
          dur: 600,
          arrive: 'os',
        });
        d.set({ lpOsWaiting: true });
        await d.caption({
          es: 'Para esperar a la red, libuv le pide al sistema operativo que avise',
          en: 'To wait on the network, libuv asks the operating system to let it know',
        });
        await take(d, 'readFile');
        await d.fly(route(d, 'nodeapi', '#lp-h-1'), 'readFile', 'tcp', {
          small: true,
          dur: 650,
          arrive: '#lp-h-1',
        });
        d.set({ lpRun: '', lpHelpers: 1 });
        const reading = meanwhile(fill(d, lane(1), 1, 4200));
        await d.caption({
          es: 'Leer un fichero lo hace uno de los cuatro hilos de ayuda',
          en: 'Reading a file is done by one of the four helper threads',
        });
        await take(d, 'req3');
        await calculate(d, 500);
        d.set({ lpRun: '' });
        await d.caption({
          es: 'Mientras, tu hilo sigue con la cola, y atiende la petición 3',
          en: 'Meanwhile, your thread carries on with the queue and serves request 3',
        });
        await reading;
        await arrive(d, '#lp-h-1', 'file');
        empty(d, lane(1));
        d.set({ lpHelpers: 0 });
        await arrive(d, 'os', 'net');
        d.set({ lpOsWaiting: false });
        await d.caption({
          es: 'Cuando acaban, dejan el resultado en la cola',
          en: 'When they finish, they leave the result in the queue',
        });
        await d.caption({
          es: 'Un servidor web pasa casi todo su tiempo esperando: le basta un hilo',
          en: 'A web server spends almost all its time waiting: one thread is enough',
        });
      },
    },
    {
      id: 'blocking',
      view: 'bench',
      kind: 'tcp',
      chip: { es: 'calcular', en: 'calculate' },
      title: { es: 'Calcular sí bloquea', en: 'Calculating does block' },
      start: () => ({ lpSlowRoute: 'slow' }),
      end: () => ({ lpSlowRoute: 'slowAsync', lpSlowOut: 'asyncDiagram', lpListOut: 'quick' }),
      async play(d) {
        await d.wait(400);
        await arrive(d, 'slowcurl', 'slow');
        await take(d, 'sync');
        const calculating = meanwhile(fill(d, BAR, 1, 5000));
        await d.caption({
          es: '/lento llama a pbkdf2Sync: calcula en tu hilo, sin soltarlo',
          en: '/slow calls pbkdf2Sync: it calculates on your thread without letting go',
        });
        await arrive(d, 'listcurl', 'products');
        await d.caption({
          es: 'GET /productos llega, y espera en la cola',
          en: 'GET /products arrives, and waits in the queue',
        });
        await calculating;
        empty(d, BAR);
        d.set({ lpRun: '' });
        await reply(d, 'slowcurl');
        d.set({ lpSlowOut: 'syncDiagram' });
        await take(d, 'products');
        await d.wait(200);
        d.set({ lpRun: '' });
        await reply(d, 'listcurl');
        d.set({ lpListOut: 'late' });
        await d.caption({
          es: 'Cuando /lento termina, la lista sale medio segundo tarde',
          en: 'When /slow finishes, the list goes out half a second late',
        });
        d.set({ lpSlowRoute: 'slowAsync', lpSlowOut: '', lpListOut: '' });
        d.glow('slowcurl', 'tcp');
        await arrive(d, 'slowcurl', 'slowAsync');
        await take(d, 'await');
        await d.fly(route(d, 'nodeapi', '#lp-h-1'), 'pbkdf2', 'tcp', {
          small: true,
          dur: 600,
          arrive: '#lp-h-1',
        });
        d.set({ lpRun: '', lpHelpers: 1 });
        const helping = meanwhile(fill(d, lane(1), 1, 4400));
        await d.caption({
          es: '/lento-asincrono hace el mismo cálculo en un hilo de ayuda',
          en: '/slow-async does the same calculation on a helper thread',
        });
        await arrive(d, 'listcurl', 'products');
        await take(d, 'products');
        await d.wait(200);
        d.set({ lpRun: '' });
        await reply(d, 'listcurl');
        d.set({ lpListOut: 'quick' });
        await d.caption({
          es: 'Tu hilo, libre, atiende la lista en milisegundos',
          en: 'Your thread, free, serves the list in milliseconds',
        });
        await helping;
        await arrive(d, '#lp-h-1', 'result', DONE);
        empty(d, lane(1));
        d.set({ lpHelpers: 0 });
        await take(d, 'result');
        await d.wait(200);
        d.set({ lpRun: '' });
        await reply(d, 'slowcurl');
        d.set({ lpSlowOut: 'asyncDiagram' });
        await d.caption({
          es: 'Listo: el resultado entra en la cola, y /lento-asincrono responde',
          en: 'Done: the result enters the queue, and /slow-async answers',
        });
      },
    },
    {
      id: 'order',
      view: 'order',
      kind: 'tcp',
      chip: { es: 'el orden', en: 'the order' },
      title: { es: 'Código, promesas y temporizadores', en: 'Code, promises and timers' },
      start: () => ({}),
      end: () => ({ lpPrinted: 4 }),
      async play(d) {
        // On a short stage the API is left out (loop.css): the code card stands for the thread, and a
        // callback goes back to the line that wrote it.
        const thread = (line: number) => (d.shown('nodeapi') ? '#lp-run' : `#lp-line-${line}`);
        const print = async (n: 1 | 2 | 3 | 4, line: number) => {
          await d.fly(route(d, thread(line), `#lp-out-${n}`), `${n}.`, 'tcp', {
            small: true,
            dur: 600,
            arrive: `#lp-out-${n}`,
          });
          d.set({ lpPrinted: n });
        };
        const timer = label(d, 'timer');
        await d.wait(400);
        d.set({ lpRun: 'script', lpLine: 1 });
        await print(1, 1);
        d.set({ lpLine: 2 });
        await d.fly(route(d, '#lp-line-2', '#lp-q-1'), timer, 'tcp', {
          small: true,
          dur: 700,
          arrive: '#lp-q-1',
        });
        d.set({ lpQueue: ['timer'] });
        d.set({ lpLine: 3 });
        await d.fly(route(d, '#lp-line-3', '#lp-p-1'), 'then(…)', 'tcp', {
          small: true,
          dur: 700,
          arrive: '#lp-p-1',
        });
        d.set({ lpPromises: ['then'] });
        await d.caption(
          {
            es: 'Primero, el código actual entero, de arriba abajo: el 1 y el 2',
            en: 'First, the current code, all of it, from top to bottom: 1 and 2',
          },
          { n: '1', kind: 'tcp' },
        );
        d.set({ lpLine: 4 });
        await print(2, 4);
        d.set({ lpRun: '', lpLine: 0 });
        await d.wait(300);
        d.set({ lpPromises: [] });
        await d.fly(route(d, '#lp-p-1', thread(3)), 'then(…)', 'tcp', {
          small: true,
          dur: 550,
          arrive: thread(3),
        });
        d.set({ lpRun: 'then', lpLine: 3 });
        await print(3, 3);
        await d.caption(
          {
            es: 'Después, todas las promesas cumplidas: el 3',
            en: 'Then, every promise that is already fulfilled: number 3',
          },
          { n: '2', kind: 'tcp' },
        );
        d.set({ lpRun: '', lpLine: 0 });
        await d.wait(300);
        await take(d, 'timer', thread(2));
        d.set({ lpLine: 2 });
        await print(4, 2);
        await d.caption(
          {
            es: 'Luego, en otra vuelta del bucle, el temporizador: el 4',
            en: 'After that, on another turn of the loop, the timer: number 4',
          },
          { n: '3', kind: 'tcp' },
        );
        d.set({ lpRun: '', lpLine: 0 });
        await d.caption({
          es: 'setTimeout(…, 0) no significa «ahora», sino «en cuanto el bucle llegue a los temporizadores»',
          en: 'setTimeout(…, 0) doesn’t mean “now”, but “as soon as the loop gets to the timers”',
        });
      },
    },
    {
      id: 'unblock',
      view: 'ways',
      kind: 'tcp',
      chip: { es: '4 salidas', en: '4 ways out' },
      title: { es: 'Cómo no bloquear el servidor', en: 'How not to block the server' },
      start: () => ({ lpRun: 'items', lpQueue: ['products'] }),
      end: () => ({ lpWays: 4 }),
      async play(d) {
        const light = (n: 1 | 2 | 3 | 4) => {
          d.set({ lpWays: n });
          d.glow(`#lp-way-${n}`, 'tcp');
        };
        await d.wait(400);
        light(1);
        await d.caption(
          {
            es: 'Si Node tiene versión asíncrona, úsala: pbkdf2 en vez de pbkdf2Sync',
            en: 'If Node has an asynchronous version, use it: pbkdf2 instead of pbkdf2Sync',
          },
          { n: '1', kind: 'tcp' },
        );
        light(2);
        await fill(d, BAR, 0.5, 1400);
        await d.fly(route(d, '#lp-run', '#lp-q-2'), 'setImmediate', 'tcp', {
          small: true,
          dur: 650,
          arrive: '#lp-q-2',
        });
        d.set({ lpQueue: enqueue(d.state.lpQueue, 'carryOn'), lpRun: '' });
        await d.caption(
          {
            es: 'En un bucle largo tuyo: mil elementos, devuelve el turno con setImmediate y sigue',
            en: 'In a long loop of yours: a thousand items, give the turn back with setImmediate, carry on',
          },
          { n: '2', kind: 'tcp' },
        );
        await take(d, 'products');
        await d.wait(250);
        d.set({ lpRun: '' });
        await d.note(d.pt('nodeapi', 't'), '200', { look: 'tag', kind: 'http', ttl: 800 });
        await take(d, 'more');
        await d.caption({
          es: 'Entre trozo y trozo, el bucle atiende lo que espera en la cola',
          en: 'Between one piece and the next, the loop serves what waits in the queue',
        });
        await fill(d, BAR, 1, 1400);
        empty(d, BAR);
        d.set({ lpRun: '' });
        light(3);
        light(4);
        await d.caption({
          es: 'Lo pesado, a otro hilo con worker_threads; lo largo, a otro servicio',
          en: 'Heavy work, to another thread with worker_threads; long jobs, to another service',
        });
        await d.caption({
          es: 'Las funciones Sync, al arrancar, no hacen esperar a nadie; en una ruta, sí',
          en: 'Sync functions at startup make nobody wait; inside a route, they do',
        });
      },
    },
    {
      id: 'crowd',
      view: 'ten',
      kind: 'dns',
      chip: { es: 'usuarios', en: 'many users' },
      title: { es: 'Diez a la vez', en: 'Ten at once' },
      start: () => ({}),
      end: () => ({ lpServed: 10, lpHelpers: 4 }),
      async play(d) {
        await d.wait(400);
        await d.fly(route(d, 'ten', 'nodeapi'), { es: '10 × informe', en: '10 × report' }, 'http', {
          dur: 800,
          arrive: 'nodeapi',
        });
        d.set({ lpRun: 'report' });
        await d.caption({
          es: 'Diez personas piden a la vez una ruta que bloquea un segundo y medio',
          en: 'Ten people ask at once for a route that blocks for a second and a half',
        });
        for (let served = 1; served <= 10; served++) {
          await calculate(d, 420);
          d.set({ lpServed: served });
        }
        d.set({ lpRun: '' });
        await d.caption({
          es: 'Van en fila: la décima espera quince segundos',
          en: 'They go in single file: the tenth waits fifteen seconds',
        });
        await d.caption({
          es: 'Y cualquier otra petición que llegue entre medias espera también',
          en: 'And any other request that arrives in the meantime waits too',
        });
        await d.tag(d.pt('nodeapi', 'b'), { es: 'un núcleo', en: 'one core' }, 'muted', 'below');
        await d.caption({
          es: 'Un ordenador más grande no lo arregla: un hilo usa un solo núcleo',
          en: 'A bigger computer doesn’t fix it: a thread uses a single core',
        });
        await Promise.all(
          [1, 2, 3, 4].map((i) =>
            d.fly(route(d, 'nodeapi', `#lp-h-${i}`), 'pbkdf2', 'tcp', {
              small: true,
              dur: 700,
              arrive: `#lp-h-${i}`,
            }),
          ),
        );
        d.set({ lpHelpers: 4 });
        await Promise.all([1, 2, 3, 4].map((i) => fill(d, lane(i), 1, 1500)));
        await d.caption({
          es: 'La versión asíncrona sí: los hilos de ayuda calculan a la vez en otros núcleos',
          en: 'The asynchronous version does: the helper threads calculate at once on other cores',
        });
      },
    },
    {
      id: 'try',
      view: 'bench',
      kind: 'dns',
      chip: { es: 'dos curl', en: 'two curls' },
      title: { es: 'Medirlo desde fuera', en: 'Measuring it from outside' },
      start: () => ({ lpSlowRoute: 'slow' }),
      end: () => ({ lpSlowRoute: 'slowAsync', lpSlowOut: 'asyncTogether', lpListOut: 'listAsync' }),
      async play(d) {
        await d.wait(300);
        // 1 and 2: each route on its own.
        await arrive(d, 'slowcurl', 'slow');
        await take(d, 'sync');
        await calculate(d, 800);
        d.set({ lpRun: '' });
        await reply(d, 'slowcurl');
        d.set({ lpSlowOut: 'slowAlone' });
        await arrive(d, 'listcurl', 'products');
        await take(d, 'products');
        d.set({ lpRun: '' });
        await reply(d, 'listcurl');
        d.set({ lpListOut: 'listAlone' });
        await d.caption({
          es: 'Solas: /lento tarda menos de un segundo; la lista, menos de un milisegundo',
          en: 'On their own: /slow takes under a second; the list, under a millisecond',
        });
        // 3: the two at once.
        d.set({ lpSlowOut: '', lpListOut: '' });
        await arrive(d, 'slowcurl', 'slow');
        await take(d, 'sync');
        const calculating = meanwhile(fill(d, BAR, 1, 3000));
        await arrive(d, 'listcurl', 'products');
        await d.caption({
          es: 'A la vez, la lista espera en la cola casi medio segundo',
          en: 'At once, the list waits in the queue for almost half a second',
        });
        await calculating;
        empty(d, BAR);
        d.set({ lpRun: '' });
        await reply(d, 'slowcurl');
        d.set({ lpSlowOut: 'slowTogether' });
        await take(d, 'products');
        d.set({ lpRun: '' });
        await reply(d, 'listcurl');
        d.set({ lpListOut: 'listTogether' });
        // 4: what the log doesn't see.
        await d.caption({
          es: 'Tu log dice "ms":0: empieza a contar cuando la petición sale de la cola',
          en: 'Your log says "ms":0: it starts counting when the request leaves the queue',
        });
        await d.note(d.pt('nodeapi', 't'), 'log: "ms":0', {
          look: 'tag',
          kind: 'dns',
          where: 'above',
          ttl: 2400,
        });
        // 5: without blocking.
        d.set({ lpSlowRoute: 'slowAsync', lpSlowOut: '', lpListOut: '' });
        d.glow('slowcurl', 'tcp');
        await arrive(d, 'slowcurl', 'slowAsync');
        await take(d, 'await');
        await d.fly(route(d, 'nodeapi', '#lp-h-1'), 'pbkdf2', 'tcp', {
          small: true,
          dur: 550,
          arrive: '#lp-h-1',
        });
        d.set({ lpRun: '', lpHelpers: 1 });
        const helping = meanwhile(fill(d, lane(1), 1, 2600));
        await arrive(d, 'listcurl', 'products');
        await take(d, 'products');
        d.set({ lpRun: '' });
        await reply(d, 'listcurl');
        d.set({ lpListOut: 'listAsync' });
        await d.caption({
          es: 'Con /lento-asincrono, la lista sale primero, en un milisegundo',
          en: 'With /slow-async, the list comes out first, in a millisecond',
        });
        await helping;
        await arrive(d, '#lp-h-1', 'result', DONE);
        empty(d, lane(1));
        d.set({ lpHelpers: 0 });
        await take(d, 'result');
        d.set({ lpRun: '' });
        await reply(d, 'slowcurl');
        d.set({ lpSlowOut: 'asyncTogether' });
      },
    },
  ],
};

export default lesson;
