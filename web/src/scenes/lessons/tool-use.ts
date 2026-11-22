/**
 * The scenes of «Tool use: cómo un modelo llama a tus funciones» / "Tool use: how a model calls
 * your functions" (translationKey tool-use), one per part of the text, in the order of its
 * <Scene id="…" /> cues: an assistant that can't see the orders, a call center, a tool's
 * definition, the model asking, the loop, several tools at once, Zod again, a tool that fails, five
 * rounds, prompt injection, authorization in the tool, the stream's tool event, and the lesson's
 * test with the worst model possible (worlds/assistant/, worlds/analogies/). The model's answers
 * are placeholder lines, never words. Between two actors, requests take one lane and answers the other.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { analogies, internalRoute } from '../worlds/analogies/analogies';
import {
  assistant,
  INITIAL,
  lose,
  mark,
  relay,
  route,
  SEGMENTS,
  type AssistantState,
} from '../worlds/assistant/assistant';
import { strings } from '../worlds/assistant/strings';

type D = Director<AssistantState>;

const REQ = -1;
const RES = 1;
const shop = (d: D) => strings[d.lang];
/** The two tools, as each language's project names them. */
const getOrder = (d: D) => shop(d).tools.names[0];
const search = (d: D) => shop(d).tools.names[1];

/** Carmen asks the shop, and the shop the model (with `toModel`), with its key. */
async function ask(d: D, toModel: Text | string = 'POST /v1/messages'): Promise<void> {
  await d.fly(route(d, 'chat', 'api', REQ), shop(d).route, 'http', { arrive: 'api' });
  await d.fly(route(d, 'api', 'model', REQ), toModel, 'tls', { icon: 'key', arrive: 'model' });
}

/** The model writes its answer, and the shop passes it on to Carmen. */
async function answer(d: D, segments = SEGMENTS): Promise<void> {
  await d.fly(route(d, 'model', 'api', RES), 'end_turn', 'http', { small: true, arrive: 'api' });
  await d.fly(route(d, 'api', 'chat', RES), { es: 'la respuesta', en: 'the answer' }, 'http', {
    arrive: 'chat',
  });
  d.set({ aiAnswer: segments });
}

/** A row of a card lights up, and its caption says what it is. */
async function row(d: D, selector: string, text: Text): Promise<void> {
  d.q(selector).classList.add('is-lit');
  d.glow(selector, 'tcp');
  await d.caption(text);
}

/** A ✓ or a ✗ in one of the analogy's marks. */
function tick(d: D, selector: string, ok: boolean): void {
  const room = d.q(selector);
  room.textContent = ok ? '✓' : '✗';
  room.dataset.mark = ok ? 'ok' : 'ko';
}

const round = (n: number): Text => ({ es: `vuelta ${n}`, en: `round ${n}` });

const lesson: LessonModule<AssistantState> = {
  initial: INITIAL,
  worlds: [assistant, analogies],
  scenes: [
    {
      id: 'problem',
      view: 'lookup',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'No ve los pedidos', en: 'It can’t see the orders' },
      start: () => ({}),
      end: () => ({ aiAsk: 'pablo' }),
      async play(d) {
        await d.wait(300);
        d.set({ aiAsk: 'order' });
        await ask(d);
        await d.fly(
          route(d, 'model', 'api', RES),
          { es: '«míralo en la web»', en: '“check the website”' },
          'muted',
          { arrive: 'api' },
        );
        await d.fly(route(d, 'api', 'chat', RES), '', 'http', { small: true, arrive: 'chat' });
        d.set({ aiAnswer: 4 });
        await d.caption({
          es: 'El asistente no ve la base de datos: le dice que lo mire en la web',
          en: 'The assistant can’t see the database: it tells her to check the website',
        });
        await d.caption({
          es: 'Es correcto, y no le sirve de nada',
          en: 'It’s correct, and it’s no use to her',
        });
        d.set({ aiAnswer: 0 });
        await d.fly(
          route(d, 'orders', 'api'),
          { es: 'todos los pedidos', en: 'every order' },
          'muted',
          {
            arrive: 'api',
          },
        );
        await d.fly(
          route(d, 'api', 'model', REQ),
          { es: 'instrucciones + pedidos', en: 'instructions + orders' },
          'muted',
          { arrive: 'model' },
        );
        await d.note(
          d.pt('model', 'l'),
          { es: 'miles de tokens', en: 'thousands of tokens' },
          { where: 'left', look: 'tag', kind: 'muted', ttl: 1800 },
        );
        await d.caption({
          es: 'La tentación: meter los pedidos de todos en las instrucciones, en cada pregunta',
          en: 'The temptation: put everyone’s orders in the instructions, with every question',
        });
        d.set({ aiAsk: 'pablo' });
        d.glow('chat', 'tls');
        await d.caption({
          es: 'Delante de un modelo que también lee lo que escribe Carmen',
          en: 'In front of a model that also reads what Carmen writes',
        });
        await d.caption({
          es: 'Con tool use, el modelo pide lo que necesita, y tu backend decide qué le da',
          en: 'With tool use, the model asks for what it needs, and your backend decides what it gets',
        });
      },
    },
    {
      id: 'analogy',
      view: 'switchboard',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Una centralita', en: 'A call center' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.say(
          'an-caller',
          { es: '¿Cómo va mi pedido 21?', en: 'How’s my order 21 going?' },
          {
            hold: 900,
          },
        );
        d.glow('#an-sheet', 'tcp');
        await d.caption({
          es: 'La teleoperadora no ve el almacén: tiene una hoja con lo que puede preguntar',
          en: 'The operator can’t see the warehouse: she has a sheet with what she can ask',
        });
        await d.fly(internalRoute(d), '', 'muted', { trail: { dashed: true } });
        await d.fly(internalRoute(d), { es: 'pedido 21', en: 'order 21' }, 'tcp', {
          small: true,
          arrive: 'warehouse',
        });
        await d.show('#an-on-line');
        d.glow('#an-screen', 'tls');
        await d.caption({
          es: 'En el almacén miran en la centralita qué cliente está al teléfono',
          en: 'The warehouse looks up which customer is on the line',
        });
        tick(d, '#an-theirs', true);
        await d.fly(internalRoute(d, true), { es: 'su estado', en: 'its status' }, 'tcp', {
          small: true,
        });
        await d.caption({
          es: '…y solo dan sus pedidos',
          en: '…and only give out that customer’s orders',
        });
        await d.say('an-caller', { es: 'Soy Pablo', en: 'I’m Pablo' }, { hold: 700 });
        await d.fly(internalRoute(d), { es: 'pedido 22', en: 'order 22' }, 'tcp', {
          small: true,
          arrive: 'warehouse',
        });
        d.glow('#an-screen', 'tls');
        tick(d, '#an-others', false);
        await d.fly(internalRoute(d, true), 'no', 'muted', { small: true });
        await d.caption({
          es: 'Si el cliente dice «soy Pablo», la teleoperadora puede creérselo; el almacén, no',
          en: 'If the customer says “I’m Pablo,” the operator may believe it; the warehouse doesn’t',
        });
      },
    },
    {
      id: 'tooldef',
      view: 'tooldef',
      kind: 'tcp',
      chip: { es: 'definición', en: 'definition' },
      title: { es: 'Una herramienta', en: 'A tool' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await row(d, '#ai-def-1', {
          es: 'name: cómo la pide el modelo',
          en: 'name: how the model asks for it',
        });
        await row(d, '#ai-def-2', {
          es: 'description: no es para personas; el modelo la lee para decidir cuándo usarla',
          en: 'description: not for people; the model reads it to decide when to use it',
        });
        await row(d, '#ai-def-3', {
          es: 'input_schema: lo que hay que pasarle, en JSON Schema: un id entero',
          en: 'input_schema: what to pass it, in JSON Schema: an integer id',
        });
        await row(d, '#ai-def-4', {
          es: '…y nada más: additionalProperties false',
          en: '…and nothing else: additionalProperties false',
        });
        await row(d, '#ai-def-5', {
          es: 'strict: la API solo deja pedirla con una entrada que cumple el esquema',
          en: 'strict: the API only lets the model ask for it with input that fits the schema',
        });
        await d.fly(route(d, 'api', 'model', REQ), 'tools: 2', 'tcp', { arrive: 'model' });
        await d.caption({
          es: 'Las definiciones viajan en cada petición, en tools, y se pagan como entrada',
          en: 'The definitions travel with every request, in tools, and are paid as input',
        });
        await d.caption({
          es: `La otra herramienta, ${strings.es.tools.names[1]}, busca en el catálogo por el nombre`,
          en: `The other tool, ${strings.en.tools.names[1]}, searches the catalog by name`,
        });
      },
    },
    {
      id: 'ask',
      view: 'lookup',
      kind: 'tcp',
      chip: { es: 'tool_use', en: 'tool_use' },
      title: { es: 'El modelo pide', en: 'The model asks' },
      start: () => ({ aiAsk: 'order' }),
      end: () => ({ aiAsk: 'order', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await ask(d, { es: 'pregunta + herramientas', en: 'question + tools' });
        await d.setText('#ai-model-status', round(1));
        await d.fly(route(d, 'model', 'api', RES), `tool_use: ${getOrder(d)}, id 21`, 'tcp', {
          arrive: 'api',
        });
        await d.caption({
          es: 'El modelo no ejecuta nada: contesta con un bloque tool_use, y para',
          en: 'The model runs nothing: it answers with a tool_use block, and stops',
        });
        await d.fly(route(d, 'api', 'orders', REQ), { es: 'como Carmen', en: 'as Carmen' }, 'tcp', {
          arrive: 'orders',
        });
        await d.wiggle('hammer', d.pt('orders', 't'), 900);
        d.q('#ai-order-21').classList.add('is-lit');
        mark(d, '#ai-order-mark-21', true);
        await d.caption({
          es: `La tienda ejecuta ${strings.es.tools.names[0]}, como Carmen`,
          en: `The shop runs ${strings.en.tools.names[0]}, as Carmen`,
        });
        await d.fly(
          route(d, 'api', 'model', REQ),
          { es: 'todo + tool_result', en: 'everything + tool_result' },
          'tcp',
          { arrive: 'model' },
        );
        await d.setText('#ai-model-status', round(2));
        await d.caption({
          es: 'Y le pregunta otra vez, con todo y el resultado',
          en: 'And asks it again, with everything and the result',
        });
        await answer(d);
        await d.caption({
          es: 'Cada vuelta se paga entera: la segunda lleva otra vez instrucciones y herramientas',
          en: 'Each round is paid in full: the second carries the instructions and tools again',
        });
      },
    },
    {
      id: 'loop',
      view: 'duo',
      kind: 'tcp',
      chip: { es: 'bucle', en: 'loop' },
      title: { es: 'El bucle, a mano', en: 'The loop, by hand' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const toModel = (label: Text | string, kind: 'tcp' | 'muted' | 'tls') =>
          d.fly(route(d, 'api', 'model', REQ), label, kind, { small: true, arrive: 'model' });
        const toShop = (label: Text | string, kind: 'tcp' | 'muted' | 'http') =>
          d.fly(route(d, 'model', 'api', RES), label, kind, { small: true, arrive: 'api' });
        await d.wait(300);
        await d.setText('#ai-api-status', { es: 'bucle.ts', en: 'loop.ts' });
        await toModel({ es: 'pasos.preguntar()', en: 'steps.ask()' }, 'tls');
        await toShop('thinking', 'muted');
        await toShop('tool_use', 'tcp');
        await d.caption({
          es: 'Si no ha parado por tool_use, se acaba; si ha parado, ejecuta las llamadas',
          en: 'If it didn’t stop for tool_use, it’s over; if it did, it runs the calls',
        });
        await d.wiggle('hammer', d.pt('api', 'b'), 900);
        await d.caption({
          es: 'Todas las de la vuelta a la vez, con Promise.all',
          en: 'All of the round’s calls at the same time, with Promise.all',
        });
        await toModel({ es: 'thinking, tal cual', en: 'thinking, as is' }, 'muted');
        await d.caption({
          es: 'Añade a la conversación el mensaje del modelo tal cual, con lo que haya pensado',
          en: 'It adds the model’s message to the conversation as is, with whatever it thought',
        });
        await toModel('tool_result', 'tcp');
        await d.caption({
          es: 'Y después, un solo mensaje con todos los resultados',
          en: 'And then a single message with all the results',
        });
        await d.caption({
          es: 'Si un thinking no vuelve sin tocar, la API rechaza la petición con un 400',
          en: 'If a thinking block doesn’t come back untouched, the API rejects it with a 400',
        });
        await toShop('end_turn', 'http');
        await d.caption({
          es: 'Unas treinta líneas: el Tool Runner del SDK y LangChain hacen esto mismo por dentro',
          en: 'About thirty lines: the SDK’s Tool Runner and LangChain do this same thing inside',
        });
      },
    },
    {
      id: 'parallel',
      view: 'toolbox',
      kind: 'tcp',
      chip: { es: 'a la vez', en: 'at once' },
      title: { es: 'Varias a la vez', en: 'Several at once' },
      start: () => ({ aiAsk: 'both' }),
      end: () => ({ aiAsk: 'both', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await ask(d);
        await Promise.all([
          d.fly(route(d, 'model', 'api', RES), `tool_use: ${search(d)}`, 'tcp', { small: true }),
          d.wait(350).then(() =>
            d.fly(route(d, 'model', 'api', RES), `tool_use: ${getOrder(d)}`, 'tcp', {
              small: true,
              arrive: 'api',
            }),
          ),
        ]);
        await d.caption({
          es: 'Dos preguntas: el modelo pide las dos herramientas en el mismo mensaje',
          en: 'Two questions: the model asks for both tools in the same message',
        });
        await Promise.all(
          [1, 2].map((i) =>
            d.fly(route(d, 'api', `#ai-tool-${i}`), '', 'tcp', {
              small: true,
              arrive: `#ai-tool-${i}`,
            }),
          ),
        );
        for (const i of [1, 2]) {
          d.q(`#ai-tool-${i}`).classList.add('is-lit');
          mark(d, `#ai-tool-mark-${i}`, true);
        }
        await d.caption({
          es: 'Se ejecutan a la vez: Carmen espera lo que tarde la más lenta, no la suma',
          en: 'They run at the same time: Carmen waits for the slowest, not the sum',
        });
        await d.fly(
          route(d, 'api', 'model', REQ),
          { es: '2 tool_result, 1 mensaje', en: '2 tool_result, 1 message' },
          'tcp',
          { arrive: 'model' },
        );
        await d.caption({
          es: 'Todos los resultados vuelven en un solo mensaje, cada uno con su tool_use_id',
          en: 'All the results go back in a single message, each with its tool_use_id',
        });
        await answer(d);
        await d.caption({
          es: 'Una llamada que falla también lleva su resultado: si falta, la API rechaza la siguiente',
          en: 'A call that fails also carries its result: if it’s missing, the API rejects the next one',
        });
      },
    },
    {
      id: 'validate',
      view: 'toolbox',
      kind: 'tcp',
      chip: { es: 'Zod', en: 'Zod' },
      title: { es: 'Se comprueba otra vez', en: 'Checked again' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const param = d.lang === 'es' ? 'consulta' : 'query';
        await d.wait(300);
        await d.fly(route(d, 'model', 'api', RES), `${search(d)} · ${param}: ""`, 'tcp', {
          small: true,
          arrive: 'api',
        });
        await d.note(d.pt('api', 'l'), 'Zod ✗', {
          where: 'left',
          look: 'tag',
          kind: 'http',
          ttl: 1300,
        });
        await d.fly(route(d, 'api', 'model', REQ), shop(d).results.badInput, 'muted', {
          small: true,
          arrive: 'model',
        });
        await d.caption({
          es: 'strict: true es una promesa de la API; la tienda lo lee otra vez con Zod',
          en: 'strict: true is the API’s promise; the shop reads it again with Zod',
        });
        await d.caption({
          es: 'Zod pone lo que strict no admite: ni vacía ni de más de 100 caracteres',
          en: 'Zod adds what strict mode doesn’t allow: not empty, at most 100 characters',
        });
        await d.fly(route(d, 'model', 'api', RES), `${search(d)} · ${param}: "%"`, 'tcp', {
          small: true,
          arrive: 'api',
        });
        await d.fly(route(d, 'api', '#ai-tool-2'), '\\%', 'tcp', {
          small: true,
          arrive: '#ai-tool-2',
        });
        d.q('#ai-tool-2').classList.add('is-lit');
        await d.caption({
          es: 'Los comodines de LIKE se escapan: una consulta % no devuelve el catálogo entero',
          en: 'LIKE’s wildcards are escaped: a % query doesn’t return the whole catalog',
        });
        await d.fly(
          route(d, 'api', 'model', REQ),
          { es: '10 como mucho', en: '10 at most' },
          'tcp',
          {
            small: true,
            arrive: 'model',
          },
        );
        await d.caption({
          es: 'Y devuelve como mucho 10 productos: el resultado se paga en cada vuelta que queda',
          en: 'And it returns at most 10 products: the result is paid for in every round left',
        });
      },
    },
    {
      id: 'toolerror',
      view: 'lookup',
      kind: 'tcp',
      chip: { es: 'is_error', en: 'is_error' },
      title: { es: 'Un fallo no la tira', en: 'A failure doesn’t sink it' },
      start: () => ({ aiAsk: 'order' }),
      end: () => ({ aiAsk: 'order', aiAnswer: SEGMENTS, aiOrdersDown: true }),
      async play(d) {
        await d.wait(300);
        await d.fly(
          route(d, 'model', 'api', RES),
          { es: 'tool_use: una que no existe', en: 'tool_use: one that doesn’t exist' },
          'tcp',
          { small: true, arrive: 'api' },
        );
        await d.fly(route(d, 'api', 'model', REQ), shop(d).results.noTool, 'muted', {
          small: true,
          arrive: 'model',
        });
        await d.caption({
          es: 'Pide una herramienta que no existe: el resultado lleva is_error y una frase corta',
          en: 'It asks for a tool that doesn’t exist: the result has is_error and a short sentence',
        });
        d.set({ aiOrdersDown: true });
        await d.fly(route(d, 'model', 'api', RES), `tool_use: ${getOrder(d)}`, 'tcp', {
          small: true,
          arrive: 'api',
        });
        await lose(d, route(d, 'api', 'orders', REQ), '');
        await d.tag(
          d.pt('api', 't'),
          { es: 'error entero → log', en: 'whole error → log' },
          'muted',
        );
        await d.fly(route(d, 'api', 'model', REQ), shop(d).results.failed, 'muted', {
          small: true,
          arrive: 'model',
        });
        await d.caption({
          es: 'La base de datos no contesta: «La herramienta ha fallado», y el error entero, al log',
          en: 'The database doesn’t answer: “The tool failed,” and the whole error to the log',
        });
        await answer(d);
        await d.caption({
          es: 'El modelo decide: corregir la entrada, probar otra cosa o decírselo a Carmen',
          en: 'The model decides: fix the input, try something else or tell Carmen',
        });
        await d.caption({
          es: 'Un error lanzado tiraría la respuesta entera por una sola llamada',
          en: 'A thrown error would bring down the whole answer for a single call',
        });
        await d.caption({
          es: 'Al log, el nombre de la herramienta y si ha fallado; nunca lo que el modelo le pasó',
          en: 'The log gets the tool’s name and whether it failed; never what the model passed it',
        });
      },
    },
    {
      id: 'rounds',
      view: 'path',
      kind: 'tcp',
      chip: { es: '5 vueltas', en: '5 rounds' },
      title: { es: 'Cinco vueltas', en: 'Five rounds' },
      start: () => ({ aiAsk: 'order' }),
      end: () => ({ aiAsk: 'order', aiAnswer: 4 }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'chat', 'api', REQ), shop(d).route, 'http', { arrive: 'api' });
        for (const n of [1, 2, 3, 4, 5]) {
          await d.setText('#ai-model-status', round(n), false);
          await d.fly(route(d, 'api', 'model', REQ), '', 'tls', {
            icon: 'key',
            small: true,
            dur: 650,
          });
          await d.fly(route(d, 'model', 'api', RES), 'tool_use', 'tcp', { small: true, dur: 650 });
          if (n < 5) await d.wiggle('hammer', d.pt('api', 'b'), 440);
        }
        await d.caption({
          es: 'Un modelo puede pedir herramientas sin parar, porque se ha liado o porque lo lían',
          en: 'A model can keep asking for tools, because it got confused or someone confused it',
        });
        await d.fly(
          route(d, 'api', 'chat', RES),
          { es: 'frase fija', en: 'fixed sentence' },
          'muted',
          {
            arrive: 'chat',
          },
        );
        d.set({ aiAnswer: 4 });
        await d.tag(
          d.pt('api', 't'),
          { es: 'log: máximo de vueltas', en: 'log: maximum rounds' },
          'muted',
        );
        await d.caption({
          es: 'En la quinta, la tienda no ejecuta nada más: una frase fija, y un aviso en el log',
          en: 'In the fifth, the shop runs nothing more: a fixed sentence, and a warning in the log',
        });
        await d.caption({
          es: 'Los 50 segundos de la lección 1 cubren todas las vueltas juntas',
          en: 'Lesson 1’s 50 seconds cover all the rounds together',
        });
        await d.caption({
          es: 'Y el uso de la respuesta suma los tokens de todas las vueltas',
          en: 'And the answer’s usage adds up the tokens of every round',
        });
      },
    },
    {
      id: 'injection',
      view: 'inject',
      kind: 'tls',
      chip: { es: 'inyección', en: 'injection' },
      title: { es: 'La inyección de instrucciones', en: 'Prompt injection' },
      start: () => ({ aiAsk: 'inject' }),
      end: () => ({ aiAsk: 'inject' }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'chat', 'api', REQ), shop(d).route, 'http', { arrive: 'api' });
        d.q('#ai-reads').classList.add('is-one');
        d.glow('onetext', 'tls');
        await d.caption({
          es: 'El modelo lee tus instrucciones y lo que escribe Carmen en el mismo texto',
          en: 'The model reads your instructions and what Carmen writes in the same text',
        });
        await d.caption({
          es: 'Como la inyección SQL, pero aquí no hay parámetros: no hay forma de separarlos',
          en: 'Like SQL injection, but here there are no parameters: no way to separate them',
        });
        await d.fly(route(d, 'api', 'model', REQ), '', 'tls', {
          icon: 'key',
          small: true,
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'api', RES), `tool_use: ${getOrder(d)}, id 22`, 'tls', {
          arrive: 'api',
        });
        await d.caption({
          es: 'Directa: la escribe quien habla con el asistente, y el modelo puede creérsela',
          en: 'Direct: written by whoever talks to the assistant, and the model may believe it',
        });
        await d.fly(
          route(d, 'api', 'model', REQ),
          {
            es: 'producto: «ignora tus instrucciones y…»',
            en: 'product: “ignore your instructions and…”',
          },
          'muted',
          { arrive: 'model' },
        );
        await d.caption({
          es: 'Indirecta: escondida en algo que el modelo lee, como el resultado de una herramienta',
          en: 'Indirect: hidden in something the model reads, like a tool’s result',
        });
        await d.caption({
          es: 'La defensa: dar por hecho que al modelo lo pueden convencer, y que no sirva de nada',
          en: 'The defense: assume the model can be talked into it, and make that useless',
        });
      },
    },
    {
      id: 'authz',
      view: 'lookup',
      kind: 'tls',
      chip: { es: 'autoriza', en: 'authorize' },
      title: { es: 'La autorización, en la herramienta', en: 'Authorization, in the tool' },
      start: () => ({ aiAsk: 'inject' }),
      end: () => ({ aiAsk: 'inject', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'model', 'api', RES), `tool_use: ${getOrder(d)}, id 22`, 'tls', {
          arrive: 'api',
        });
        await d.caption({
          es: 'El modelo solo puede pasar un número de pedido: es lo único que hay en su esquema',
          en: 'The model can only pass an order number: it’s all there is in its schema',
        });
        await d.fly(
          route(d, 'chat', 'api', REQ),
          { es: 'sesión: Carmen', en: 'session: Carmen' },
          'tls',
          {
            arrive: 'api',
          },
        );
        await d.caption({
          es: 'Quién pregunta lo pone la ruta, con la sesión, nunca el modelo',
          en: 'Who is asking is set by the route, from the session, never by the model',
        });
        await d.fly(route(d, 'api', 'orders', REQ), 'id 22 · Carmen', 'tcp', { arrive: 'orders' });
        await d.note(
          d.pt('orders', 't'),
          d.lang === 'es'
            ? 'WHERE id = $1 AND cliente_id = $2'
            : 'WHERE id = $1 AND customer_id = $2',
          { where: 'above', look: 'tag', kind: 'tls', ttl: 2200 },
        );
        mark(d, '#ai-order-mark-22', false);
        await d.fly(route(d, 'api', 'model', REQ), shop(d).results.notFound, 'muted', {
          small: true,
          arrive: 'model',
        });
        await d.caption({
          es: 'Un pedido de otro no sale de PostgreSQL: «No encontrado», como uno que no existe',
          en: 'Someone else’s order never leaves PostgreSQL: “Not found,” like one that doesn’t exist',
        });
        await answer(d);
        await d.caption({
          es: 'El asistente tiene el poder del cliente que pregunta, ni uno más',
          en: 'The assistant has the power of the customer asking, and not one bit more',
        });
        await d.caption({
          es: 'Las instrucciones son la segunda muralla; la primera es el código',
          en: 'The instructions are the second wall; the first is the code',
        });
      },
    },
    {
      id: 'toolevent',
      view: 'path',
      kind: 'http',
      chip: { es: 'evento', en: 'event' },
      title: { es: 'Un evento más', en: 'One more event' },
      start: () => ({ aiAsk: 'order' }),
      end: () => ({ aiAsk: 'order', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'chat', 'api', REQ), 'Accept: text/event-stream', 'http', {
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'model', REQ), '', 'tls', {
          icon: 'key',
          small: true,
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'api', RES), 'tool_use', 'tcp', {
          small: true,
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'chat', RES), `event: ${shop(d).tools.event}`, 'http', {
          arrive: 'chat',
        });
        d.set({ aiNote: 'tool' });
        await d.caption({
          es: 'Mientras se ejecuta una herramienta, Carmen no ve texto nuevo',
          en: 'While a tool runs, Carmen sees no new text',
        });
        await d.caption({
          es: 'Por eso el flujo gana un evento, herramienta, antes de ejecutarla, con su etiqueta',
          en: 'So the stream gains an event, tool, before running it, with its label',
        });
        await d.wiggle('hammer', d.pt('api', 'b'), 800);
        await d.fly(route(d, 'api', 'model', REQ), 'tool_result', 'tcp', {
          small: true,
          arrive: 'model',
        });
        d.set({ aiNote: '' });
        await relay(d, 4, (i) => d.set({ aiAnswer: Math.round(((i + 1) * SEGMENTS) / 4) }));
        await d.caption({
          es: 'Nunca lleva lo que el modelo le pasa a la herramienta',
          en: 'It never carries what the model passes to the tool',
        });
        await d.caption({
          es: 'Un agente es este bucle, con más herramientas y más vueltas',
          en: 'An agent is this loop, with more tools and more rounds',
        });
        await d.caption({
          es: 'Cada herramienta comprueba quién puede, y el agente recibe solo las que necesita',
          en: 'Each tool checks who can, and the agent gets only the ones it needs',
        });
      },
    },
    {
      id: 'try',
      view: 'trytools',
      kind: 'tls',
      chip: { es: 'pedido 22', en: 'order 22' },
      title: { es: 'El peor modelo posible', en: 'The worst model possible' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const notFound = shop(d).results.notFound;
        await d.wait(300);
        await d.type('#ai-cmd-1', d.lang === 'es' ? 'curl …/v2/pedidos/22' : 'curl …/v2/orders/22');
        await d.fly(
          route(d, 'shell', 'api', REQ),
          { es: 'sesión de Carmen', en: 'Carmen’s session' },
          'http',
          {
            arrive: 'api',
          },
        );
        await d.fly(route(d, 'api', 'orders', REQ), '22 · Carmen', 'tcp', {
          small: true,
          arrive: 'orders',
        });
        mark(d, '#ai-order-mark-22', false);
        await d.fly(route(d, 'api', 'shell', RES), '404', 'http', { arrive: 'shell' });
        await d.caption({
          es: 'La API de siempre: 200 para el pedido de Carmen, 404 para el de Pablo',
          en: 'The usual API: 200 for Carmen’s order, 404 for Pablo’s',
        });
        await d.type('#ai-cmd-2', 'node --test …');
        await d.setText('#ai-fake-status', { es: 'se lo cree todo', en: 'believes everything' });
        await d.caption({
          es: 'El modelo de mentira es el peor modelo posible: se cree a Carmen enseguida',
          en: 'The fake model is the worst model possible: it believes Carmen right away',
        });
        const asks: (Text | string)[] = [
          'id 22',
          'id 22',
          { es: 'uno que no existe', en: 'one that doesn’t exist' },
          { es: 'uno sin dueño', en: 'one with no owner' },
        ];
        for (const label of asks) {
          await d.fly(route(d, 'fakemodel', 'api', RES), label, 'tls', { small: true, dur: 700 });
          await d.fly(route(d, 'api', 'orders', REQ), '', 'tcp', { small: true, dur: 600 });
          await d.fly(route(d, 'api', 'fakemodel', REQ), notFound, 'muted', {
            small: true,
            dur: 700,
          });
        }
        mark(d, '#ai-run-2', true);
        await d.caption({
          es: 'Pide el 22, insiste, prueba uno que no existe y uno sin dueño: «No encontrado»',
          en: 'It asks for 22, insists, tries one that doesn’t exist and one with no owner: “Not found”',
        });
        await d.caption({
          es: 'Diga lo que diga el modelo, la herramienta solo ve lo que Carmen vería en la web',
          en: 'Whatever the model says, the tool only sees what Carmen could see on the web',
        });
      },
    },
  ],
};

export default lesson;
