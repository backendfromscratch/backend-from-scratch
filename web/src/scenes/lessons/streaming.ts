/**
 * The scenes of «Respuestas de IA en streaming con SSE» / "Streaming AI responses with SSE"
 * (translationKey streaming), one per part of the text, in the order of its <Scene id="…" /> cues:
 * a screen that stays still, two interpreters, the first piece and not the last, the API's events,
 * Accept, the shop's own events, errors before and after the 200, the customer who leaves, fetch
 * and a reader, nginx's buffering, and the lesson's exercises (worlds/assistant/,
 * worlds/analogies/). The answer is placeholder lines that grow piece by piece, never words: the
 * lesson quotes none from the model. Between two actors, requests take one lane and answers the other.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { analogies } from '../worlds/analogies/analogies';
import {
  assistant,
  cut,
  INITIAL,
  mark,
  relay,
  route,
  SEGMENTS,
  stream,
  type AssistantState,
} from '../worlds/assistant/assistant';
import { strings } from '../worlds/assistant/strings';

type D = Director<AssistantState>;

const REQ = -1;
const RES = 1;
const POST_MODEL = 'POST /v1/messages';
const shop = (d: D) => strings[d.lang];

/** Carmen asks the shop (with `toShop`, a header, say), and the shop the model, with its key. */
async function ask(d: D, toShop?: Text | string): Promise<void> {
  await d.fly(route(d, 'chat', 'api', REQ), toShop ?? shop(d).route, 'http', { arrive: 'api' });
  await d.fly(route(d, 'api', 'model', REQ), POST_MODEL, 'tls', { icon: 'key', arrive: 'model' });
}

/** How many of the answer's segments show after `i + 1` of `n` pieces. */
const grown = (i: number, n: number) => Math.round(((i + 1) * SEGMENTS) / n);

const lesson: LessonModule<AssistantState> = {
  initial: INITIAL,
  worlds: [assistant, analogies],
  scenes: [
    {
      id: 'problem',
      view: 'path',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Una pantalla quieta', en: 'A screen that stays still' },
      start: () => ({}),
      end: () => ({ aiAsk: 'wash' }),
      async play(d) {
        await d.wait(300);
        d.set({ aiAsk: 'wash' });
        await ask(d);
        await d.setText('#ai-model-status', { es: 'escribe…', en: 'writing…' });
        await stream(d, () => route(d, 'model', 'api', RES), ['', '', '', '', ''], 'http');
        await d.setText('#ai-api-status', { es: 'espera el final', en: 'waits for the end' });
        await d.caption({
          es: 'La tienda de la lección 1 espera la respuesta entera antes de mandar nada',
          en: 'Lesson 1’s shop waits for the whole answer before sending anything',
        });
        await d.caption({
          es: 'Carmen no sabe si el asistente piensa o se ha colgado, y recarga la página',
          en: 'Carmen can’t tell if the assistant is thinking or stuck, and reloads the page',
        });
        d.glow('chat', 'muted');
        await ask(d);
        await d.tag(d.pt('model', 't'), { es: 'otra vez pagada', en: 'paid for again' }, 'muted');
        await d.caption({
          es: 'Otra pregunta, otra vez pagada',
          en: 'Another question, paid for again',
        });
        await d.caption({
          es: 'En los chats de IA que usas, la respuesta no termina antes: empieza antes',
          en: 'In the AI chats you use, the answer doesn’t finish sooner: it starts sooner',
        });
      },
    },
    {
      id: 'analogy',
      view: 'interpreting',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Dos intérpretes', en: 'Two interpreters' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const toBooth = () => route(d, 'speaker', 'booth');
        const toYou = () => route(d, 'booth', 'audience');
        const phrase = (i: number) => ({ es: `frase ${i}`, en: `phrase ${i}` });
        await d.wait(400);
        await d.setText('#an-mode', { es: 'simultáneo', en: 'simultaneous' });
        await Promise.all(
          [1, 2, 3].map(async (i) => {
            await d.wait((i - 1) * 900);
            await d.fly(toBooth(), phrase(i), 'http', { small: true, dur: 800 });
            await d.fly(toYou(), phrase(i), 'http', { small: true, dur: 800, arrive: 'audience' });
          }),
        );
        await d.caption({
          es: 'El intérprete simultáneo traduce frase a frase, según la oye',
          en: 'The simultaneous interpreter translates phrase by phrase, as they hear it',
        });
        await d.setText('#an-mode', { es: 'consecutivo', en: 'consecutive' });
        for (const i of [1, 2, 3]) {
          await d.fly(toBooth(), phrase(i), 'http', { small: true, dur: 800 });
          d.q(`#an-held-${i}`).classList.add('is-on');
        }
        await d.caption({
          es: 'El consecutivo espera al final: mientras tanto, la sala en silencio',
          en: 'The consecutive one waits for the end: meanwhile, the room in silence',
        });
        for (const i of [1, 2, 3]) d.q(`#an-held-${i}`).classList.remove('is-on');
        await d.fly(toYou(), { es: 'todo', en: 'everything' }, 'http', { arrive: 'audience' });
        await d.caption({
          es: 'Y luego lo cuenta todo de golpe',
          en: 'And then tells it all at once',
        });
        await d.setText('#an-mode', { es: 'simultáneo', en: 'simultaneous' });
        await d.fly(toBooth(), phrase(1), 'http', { small: true, dur: 800 });
        await d.fly(toYou(), phrase(1), 'http', { small: true, dur: 800, arrive: 'audience' });
        await d.caption({
          es: 'El streaming es el intérprete simultáneo',
          en: 'Streaming is the simultaneous interpreter',
        });
        d.q('#an-audience').classList.add('is-gone');
        await d.setText('#an-mode', { es: 'deja de traducir', en: 'stops' });
        await d.caption({
          es: 'Y si te levantas y te vas, en la cabina dejan de traducir para ti',
          en: 'And if you get up and leave, the booth stops translating for you',
        });
      },
    },
    {
      id: 'ttft',
      view: 'path',
      kind: 'http',
      chip: { es: '1.er trozo', en: '1st piece' },
      title: { es: 'El primer trozo, no el último', en: 'The first piece, not the last' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await d.setText('#ai-api-status', { es: 'sin streaming', en: 'no streaming' });
        await ask(d);
        await stream(d, () => route(d, 'model', 'api', RES), ['', '', '', '', '', ''], 'http');
        await d.fly(route(d, 'api', 'chat', RES), { es: 'todo', en: 'everything' }, 'http', {
          arrive: 'chat',
        });
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'Sin streaming, la tienda junta los trozos y lo manda todo al final',
          en: 'Without streaming, the shop gathers the pieces and sends it all at the end',
        });
        d.set({ aiAnswer: 0 });
        await d.setText('#ai-api-status', { es: 'en streaming', en: 'streaming' });
        await ask(d);
        await relay(d, 6, (i) => {
          d.set({ aiAnswer: grown(i, 6) });
          // Not awaited, so the pieces keep coming: leaving the scene cancels it, and that is no error.
          if (i === 0)
            void d
              .note(
                d.pt('chat', 't'),
                { es: 'primer texto', en: 'first text' },
                { where: 'above', look: 'tag', kind: 'http', ttl: 1600 },
              )
              .catch(() => {});
        });
        await d.caption({
          es: 'Con streaming, manda cada trozo en cuanto llega',
          en: 'With streaming, it sends each piece as soon as it arrives',
        });
        await d.caption({
          es: 'La última palabra llega a la vez: lo que nota Carmen es el primer trozo',
          en: 'The last word arrives at the same time: what Carmen notices is the first piece',
        });
        await d.caption({
          es: 'Es el tiempo hasta el primer token, el primo del TTFB',
          en: 'It’s the time to first token, the cousin of TTFB',
        });
      },
    },
    {
      id: 'events',
      view: 'events',
      kind: 'http',
      chip: { es: 'eventos', en: 'events' },
      title: { es: 'Los eventos de la API', en: 'The API’s events' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const back = () => route(d, 'model', 'api', RES);
        const event = (name: string, kind: 'http' | 'muted' = 'http') =>
          d.fly(back(), name, kind, { small: true, dur: 900, arrive: 'api' });
        const lit = (row: number) => {
          d.q(`#ai-evt-${row}`).classList.add('is-lit');
          d.glow(`#ai-evt-${row}`, 'http');
        };
        await d.wait(300);
        await d.fly(route(d, 'api', 'model', REQ), '"stream": true', 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.caption({
          es: 'Con "stream": true, la API contesta con un flujo de eventos SSE, siempre en orden',
          en: 'With "stream": true, the API answers with a stream of SSE events, always in order',
        });
        await event('message_start');
        lit(1);
        await d.caption(
          {
            es: 'message_start: el mensaje, todavía vacío, con los tokens de entrada',
            en: 'message_start: the message, still empty, with the input tokens',
          },
          { n: '1', kind: 'http' },
        );
        await event('content_block_start');
        lit(2);
        await stream(d, back, ['text_delta', 'text_delta', 'text_delta'], 'http');
        lit(3);
        await event('content_block_stop');
        lit(4);
        await d.caption(
          {
            es: 'Por cada bloque, su principio, sus trozos y su final: aquí, text_delta',
            en: 'For each block, its start, its pieces and its end: here, text_delta',
          },
          { n: '2', kind: 'http' },
        );
        await event('ping', 'muted');
        await d.caption({
          es: 'Entre medias puede llegar un ping, para que la conexión no parezca muerta',
          en: 'In between, a ping may arrive, so the connection doesn’t look dead',
        });
        await event('message_delta');
        lit(5);
        await d.caption(
          {
            es: 'message_delta: por qué ha parado y los tokens de salida',
            en: 'message_delta: why it stopped and the output tokens',
          },
          { n: '3', kind: 'http' },
        );
        await event('message_stop');
        lit(6);
        await d.caption(
          { es: 'message_stop: el final', en: 'message_stop: the end' },
          { n: '4', kind: 'http' },
        );
        await d.setText('#ai-api-status', 'finalMessage()');
        await d.caption({
          es: 'Y finalMessage() da el mensaje entero, el mismo que messages.create()',
          en: 'And finalMessage() gives the whole message, the same as messages.create()',
        });
      },
    },
    {
      id: 'accept',
      view: 'path',
      kind: 'http',
      chip: { es: 'Accept', en: 'Accept' },
      title: { es: 'Lo decide Accept', en: 'Accept decides' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await ask(d, 'Accept: text/event-stream');
        await relay(d, 4, (i) => d.set({ aiAnswer: grown(i, 4) }), '', shop(d).events.text);
        await d.caption({
          es: 'Con text/event-stream, eventos',
          en: 'With text/event-stream, events',
        });
        d.set({ aiAnswer: 0 });
        await ask(d, 'Accept: application/json');
        await stream(d, () => route(d, 'model', 'api', RES), ['', '', '', ''], 'http');
        await d.fly(route(d, 'api', 'chat', RES), 'JSON', 'http', { arrive: 'chat' });
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'Con cualquier otra cosa, el JSON entero de la lección 1',
          en: 'With anything else, lesson 1’s whole JSON',
        });
        await d.caption({
          es: `La misma ruta, ${strings.es.route}: es la negociación de contenido`,
          en: `The same route, ${strings.en.route}: it’s content negotiation`,
        });
        await d.caption({
          es: 'Un frontend que ya usaba el JSON sigue funcionando sin cambiar nada',
          en: 'A frontend that already used the JSON keeps working without changing a thing',
        });
      },
    },
    {
      id: 'translate',
      view: 'path',
      kind: 'http',
      chip: { es: 'traducir', en: 'translate' },
      title: { es: 'Los eventos de la tienda', en: 'The shop’s events' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await d.setText('#ai-api-status', { es: 'eventoDeLaTienda()', en: 'shopEvent()' });
        await ask(d);
        await d.fly(route(d, 'model', 'api', RES), 'thinking_delta', 'muted', {
          small: true,
          arrive: 'api',
        });
        await d.note(d.pt('api', 'l'), '✗', { where: 'center', look: 'tag', ttl: 1200 });
        await d.caption({
          es: 'Lo que el modelo piensa no es para Carmen: se queda en la tienda',
          en: 'What the model thinks isn’t for Carmen: it stays in the shop',
        });
        await relay(
          d,
          4,
          (i) => d.set({ aiAnswer: grown(i, 4) }),
          'text_delta',
          shop(d).events.text,
        );
        await d.caption({
          es: 'Solo pasan los trozos de texto, como eventos «texto»',
          en: 'Only the pieces of text go through, as “text” events',
        });
        await d.fly(route(d, 'model', 'api', RES), 'message_delta', 'http', {
          small: true,
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'chat', RES), shop(d).events.end, 'tcp', { arrive: 'chat' });
        await d.caption({
          es: 'Los tokens y por qué ha parado llegan juntos al final, en «fin»',
          en: 'The tokens and why it stopped arrive together at the end, in “end”',
        });
        await d.caption({
          es: 'Si cambias de modelo o de proveedor, cambias esta función, y el frontend ni se entera',
          en: 'If you change models or providers, you change this function: the frontend never notices',
        });
      },
    },
    {
      id: 'errors',
      view: 'path',
      kind: 'http',
      chip: { es: 'errores', en: 'errors' },
      title: { es: 'Antes y después del 200', en: 'Before and after the 200' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: grown(1, 4), aiNote: 'error' }),
      async play(d) {
        await d.wait(300);
        await ask(d, 'Accept: text/event-stream');
        await d.fly(route(d, 'model', 'api', RES), '429', 'muted', { arrive: 'api' });
        await d.fly(route(d, 'api', 'chat', RES), '503 · Retry-After', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'busy' });
        await d.caption({
          es: 'Antes del primer evento, la tienda aún no ha mandado nada: un 503 normal, en JSON',
          en: 'Before the first event, the shop hasn’t sent anything yet: a normal 503, in JSON',
        });
        d.set({ aiNote: '' });
        await ask(d, 'Accept: text/event-stream');
        await d.fly(route(d, 'model', 'api', RES), 'message_start', 'http', {
          small: true,
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'chat', RES), '200 · text/event-stream', 'http', {
          arrive: 'chat',
        });
        await d.caption({
          es: 'Por eso espera al primer evento del modelo antes de abrir su flujo con un 200',
          en: 'That’s why it waits for the model’s first event before opening its stream with a 200',
        });
        await relay(d, 2, (i) => d.set({ aiAnswer: grown(i, 4) }), '', shop(d).events.text);
        await d.fly(route(d, 'model', 'api', RES), 'error', 'muted', { arrive: 'api' });
        await d.fly(route(d, 'api', 'chat', RES), 'event: error', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'error' });
        await d.caption({
          es: 'Si falla después, el 200 ya ha salido: llega un evento «error», y el flujo se cierra',
          en: 'If it fails after, the 200 has already gone: an “error” event arrives, and the stream closes',
        });
        await d.caption({
          es: 'Sin «fin», y con parte del texto ya en la pantalla de Carmen',
          en: 'With no “end”, and part of the text already on Carmen’s screen',
        });
      },
    },
    {
      id: 'cancel',
      view: 'path',
      kind: 'http',
      chip: { es: 'cancelar', en: 'cancel' },
      title: { es: 'El cliente se va', en: 'The customer leaves' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: grown(1, 4), aiClosed: true }),
      async play(d) {
        await d.wait(300);
        await ask(d, 'Accept: text/event-stream');
        await relay(d, 2, (i) => d.set({ aiAnswer: grown(i, 4) }), '', shop(d).events.text);
        d.set({ aiClosed: true });
        d.glow('chat', 'muted');
        await d.caption({
          es: 'Si Carmen cierra la pestaña a mitad, nadie va a leer el resto',
          en: 'If Carmen closes the tab halfway, nobody is going to read the rest',
        });
        await d.setText('#ai-api-status', { es: 'cancelar.abort()', en: 'cancel.abort()' });
        await d.caption({
          es: 'sse.onAbort lo nota y llama a abort(): salta la señal de la llamada al modelo',
          en: 'sse.onAbort notices and calls abort(): the model call’s signal fires',
        });
        await cut(d, route(d, 'api', 'model', REQ));
        await d.setText('#ai-model-status', { es: 'conexión cortada', en: 'connection cut' });
        await d.caption({
          es: 'El SDK corta su conexión con la API',
          en: 'The SDK cuts its connection with the API',
        });
        await d.tag(
          d.pt('api', 't'),
          { es: 'log: el cliente se ha ido', en: 'log: the customer left' },
          'muted',
        );
        await d.caption({
          es: 'Si la API deja de cobrar lo que ya no escribe, su documentación no lo dice',
          en: 'Whether the API stops charging for what it no longer writes, its docs don’t say',
        });
      },
    },
    {
      id: 'reader',
      view: 'frontend',
      kind: 'http',
      chip: { es: 'fetch', en: 'fetch' },
      title: { es: 'fetch y un lector', en: 'fetch and a reader' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: SEGMENTS }),
      async play(d) {
        const t = shop(d);
        const chunk = async (i: 0 | 1 | 2) => {
          await d.fly(
            route(d, 'api', 'reader', RES),
            { es: `trozo ${i + 1}`, en: `chunk ${i + 1}` },
            'http',
            { small: true, arrive: 'reader' },
          );
          await d.setText('#ai-chunk', t.reader.chunks[i]);
        };
        const event = async (n: number, segments: number) => {
          await d.show(`#ai-ev-${n}`);
          await d.fly(route(d, 'reader', 'chat', RES), '', 'http', { small: true, dur: 700 });
          d.set({ aiAnswer: segments });
        };
        await d.wait(300);
        await d.caption({
          es: 'EventSource solo hace GET, y la conversación va en el cuerpo de un POST',
          en: 'EventSource only makes GET requests, and the conversation goes in a POST’s body',
        });
        await d.fly(route(d, 'chat', 'api', REQ), 'fetch · POST', 'http', { arrive: 'api' });
        await d.fly(route(d, 'api', 'reader', RES), { es: 'cabeceras', en: 'headers' }, 'http', {
          arrive: 'reader',
        });
        await d.caption({
          es: 'fetch contesta en cuanto llegan las cabeceras, sin esperar al cuerpo',
          en: 'fetch resolves as soon as the headers arrive, without waiting for the body',
        });
        await chunk(0);
        await d.setText('#ai-buffer', t.reader.buffers[0]);
        await event(1, 4);
        await d.caption({
          es: 'Un trozo no es un evento: este trae uno y medio',
          en: 'A chunk isn’t an event: this one brings one and a half',
        });
        await chunk(1);
        await d.setText('#ai-buffer', t.reader.buffers[1]);
        await event(2, 8);
        await d.caption({
          es: 'El lector junta el texto y lo corta por cada línea en blanco',
          en: 'The reader gathers the text and cuts it at each blank line',
        });
        await chunk(2);
        await event(3, SEGMENTS);
        await d.show('#ai-ev-4');
        await d.caption({
          es: `Con «${t.events.text}», añade el trozo; con «${t.events.end}», termina`,
          en: `With “${t.events.text}”, it adds the piece; with “${t.events.end}”, it finishes`,
        });
        await d.caption({
          es: 'Reconectar no conviene: volver a pedir es volver a preguntar, y a pagar',
          en: 'Reconnecting isn’t a good idea: asking again is asking, and paying, again',
        });
      },
    },
    {
      id: 'nginx',
      view: 'proxy',
      kind: 'http',
      chip: { es: 'nginx', en: 'nginx' },
      title: { es: 'El buffering de nginx', en: 'nginx’s buffering' },
      start: () => ({ aiAsk: 'wash' }),
      end: () => ({ aiAsk: 'wash', aiAnswer: SEGMENTS }),
      async play(d) {
        const asks = async () => {
          await d.fly(route(d, 'chat', 'nginx', REQ), shop(d).route, 'http', { arrive: 'nginx' });
          await d.fly(route(d, 'nginx', 'api', REQ), '', 'http', { small: true, arrive: 'api' });
        };
        await d.wait(300);
        await d.setText('#ai-buffering', 'proxy_buffering on');
        await asks();
        await stream(
          d,
          () => route(d, 'api', 'nginx', RES),
          ['', '', ''],
          'http',
          (i) => d.q(`#ai-slot-${i + 1}`).classList.add('is-on'),
        );
        await d.caption({
          es: 'Por defecto, nginx guarda lo que manda la API hasta tener un bloque entero',
          en: 'By default, nginx holds what the API sends until it has a whole block',
        });
        for (const i of [1, 2, 3]) d.q(`#ai-slot-${i}`).classList.remove('is-on');
        await d.fly(
          route(d, 'nginx', 'chat', RES),
          { es: 'todo de golpe', en: 'all at once' },
          'http',
          {
            arrive: 'chat',
          },
        );
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'Con un flujo, Carmen lo recibiría de golpe, al final',
          en: 'With a stream, Carmen would get it all at once, at the end',
        });
        d.set({ aiAnswer: 0 });
        await d.setText('#ai-buffering', 'proxy_buffering off');
        await d.caption({
          es: `El paso 48 lo apaga solo para ${strings.es.location}`,
          en: `Step 48 turns it off only for ${strings.en.location}`,
        });
        await asks();
        await relay(d, 4, (i) => d.set({ aiAnswer: grown(i, 4) }), '', '', 'nginx', 'api');
        await d.caption({
          es: 'Cada trozo sale hacia Carmen en cuanto llega',
          en: 'Each piece goes out toward Carmen as soon as it arrives',
        });
        await d.caption({
          es: 'proxy_read_timeout se queda en 60 s: entre dos trozos pasa mucho menos',
          en: 'proxy_read_timeout stays at 60 s: much less goes by between two pieces',
        });
      },
    },
    {
      id: 'try',
      view: 'tryit',
      kind: 'http',
      chip: { es: 'curl -N', en: 'curl -N' },
      title: { es: 'Trozo a trozo', en: 'Piece by piece' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const t = shop(d);
        await d.wait(300);
        await d.type('#ai-cmd-1', 'curl -sN …/v1/messages');
        await d.fly(route(d, 'shell', 'model', REQ), '"stream": true', 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await stream(
          d,
          () => route(d, 'model', 'shell', RES),
          ['message_start', 'text_delta', 'message_stop'],
          'http',
        );
        mark(d, '#ai-run-1', true);
        await d.caption({
          es: '-N hace que curl escriba cada trozo en cuanto llega',
          en: '-N makes curl write each piece as soon as it arrives',
        });
        await d.type('#ai-cmd-2', `curl -N …${t.route.slice(5)}`);
        await d.fly(route(d, 'shell', 'api', REQ), 'Accept: text/event-stream', 'http', {
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'model', REQ), '', 'tls', { icon: 'key', small: true });
        await stream(
          d,
          () => route(d, 'api', 'shell', RES),
          [t.events.text, t.events.text, t.events.end],
          'http',
        );
        mark(d, '#ai-run-2', true);
        await d.caption({
          es: 'La tienda: un evento «texto» por trozo y, al final, «fin»; ni rastro de los de la API',
          en: 'The shop: a “text” event per piece and, at the end, “end”; no trace of the API’s',
        });
        await d.type('#ai-cmd-3', 'curl -N --max-time 2 …');
        await d.fly(route(d, 'shell', 'api', REQ), shop(d).route, 'http', { arrive: 'api' });
        await d.fly(route(d, 'api', 'model', REQ), '', 'tls', { icon: 'key', small: true });
        await d.fly(route(d, 'api', 'shell', RES), t.events.text, 'http', {
          small: true,
          arrive: 'shell',
        });
        mark(d, '#ai-run-3', false);
        await cut(d, route(d, 'api', 'model', REQ));
        await d.tag(
          d.pt('api', 't'),
          { es: 'log: el cliente se ha ido', en: 'log: the customer left' },
          'muted',
        );
        await d.caption({
          es: 'Con --max-time 2, curl se va a mitad, y la tienda cancela la llamada al modelo',
          en: 'With --max-time 2, curl leaves halfway, and the shop cancels the call to the model',
        });
      },
    },
  ],
};

export default lesson;
