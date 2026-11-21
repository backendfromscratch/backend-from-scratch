/**
 * The scenes of «Cómo llamar a la API de un modelo de IA» / "How to call an AI model's API"
 * (translationKey model-apis), one per part of the text, in the order of its <Scene id="…" /> cues:
 * the key in the browser, the translation service, the key on the server, who can ask, the
 * request, the answer, the tokens, a stateless API, the SDK's retries, the API's errors, the time
 * limit and the customer who leaves, a refusal, the fake model of the tests, and the lesson's
 * exercises (worlds/assistant/, worlds/analogies/). The model's answers are placeholder lines, never
 * words: the lesson quotes none. Between two actors, requests take one lane and answers the other.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { analogies, phoneRoute } from '../worlds/analogies/analogies';
import {
  assistant,
  cut,
  INITIAL,
  lose,
  mark,
  route,
  SEGMENTS,
  type AssistantState,
} from '../worlds/assistant/assistant';
import { strings } from '../worlds/assistant/strings';

type D = Director<AssistantState>;

const REQ = -1;
const RES = 1;

/** A row of a card lights up, and its caption says what it is. */
async function row(d: D, selector: string, text: Text): Promise<void> {
  d.q(selector).classList.add('is-lit');
  d.glow(selector, 'http');
  await d.caption(text);
}

/** A row of the meter shows its numbers. */
function meterRow(d: D, n: 1 | 2 | 3): void {
  for (const cell of d.qa(`[data-row="${n}"]`)) cell.classList.add('is-on');
  d.glow('meter', 'dns');
}

const POST_SHOP = (d: D) => strings[d.lang].route;
const POST_MODEL = 'POST /v1/messages';

/** Carmen asks the shop, and the shop the model, with its key. */
async function ask(d: D, toShop: Text | string = POST_SHOP(d)): Promise<void> {
  await d.fly(route(d, 'chat', 'api', REQ), toShop, 'http', { arrive: 'api' });
  await d.fly(route(d, 'api', 'model', REQ), POST_MODEL, 'tls', { icon: 'key', arrive: 'model' });
}

/** The model answers the shop, and the shop Carmen. */
async function answer(d: D, toShop: Text | string, toChat: Text | string): Promise<void> {
  await d.fly(route(d, 'model', 'api', RES), toShop, 'http', { arrive: 'api' });
  await d.fly(route(d, 'api', 'chat', RES), toChat, 'http', { arrive: 'chat' });
}

const lesson: LessonModule<AssistantState> = {
  initial: INITIAL,
  worlds: [assistant, analogies],
  scenes: [
    {
      id: 'problem',
      view: 'leak',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'La clave, en el navegador', en: 'The key, in the browser' },
      start: () => ({}),
      end: () => ({ aiAsk: 'hello', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(400);
        d.set({ aiAsk: 'hello' });
        await d.fly(route(d, 'chat', 'model', REQ), POST_MODEL, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.fly(
          route(d, 'model', 'chat', RES),
          { es: 'la respuesta', en: 'the answer' },
          'http',
          {
            arrive: 'chat',
          },
        );
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'La clave, en el JavaScript de la web: Carmen pregunta y el modelo contesta',
          en: 'The key, in the website’s JavaScript: Carmen asks and the model answers',
        });
        await d.show('#ai-dev-row');
        await d.caption({
          es: 'Pero ese JavaScript llega a cualquier navegador que abra la web',
          en: 'But that JavaScript reaches any browser that opens the site',
        });
        await d.show('#ai-dev-key');
        d.glow('#ai-dev-key', 'tls');
        await d.caption({
          es: 'Alguien abre DevTools y ve la clave en la pestaña Red',
          en: 'Someone opens DevTools and sees the key in the Network tab',
        });
        await d.fly(route(d, 'devtools', 'stranger'), { es: 'la clave', en: 'the key' }, 'tls', {
          icon: 'key',
          arrive: 'stranger',
        });
        for (let i = 0; i < 3; i++) {
          await d.fly(route(d, 'stranger', 'model'), '', 'tls', {
            icon: 'key',
            small: true,
            dur: 650,
            arrive: 'model',
          });
        }
        await d.tag(d.pt('model', 't'), { es: 'saldo gastado', en: 'credit spent' }, 'muted');
        await d.caption({
          es: 'Al día siguiente, la tienda se ha gastado todo su saldo',
          en: 'The next day, the shop has spent all its credit',
        });
        await d.caption({
          es: 'Todo lo que llega al navegador lo puede leer quien lo usa',
          en: 'Everything that reaches the browser can be read by whoever uses it',
        });
        await d.caption({
          es: 'La solución: el navegador pregunta a tu backend, y tu backend, con su clave, al modelo',
          en: 'The fix: the browser asks your backend, and your backend, with its key, asks the model',
        });
      },
    },
    {
      id: 'analogy',
      view: 'phoneline',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Un servicio de traducción', en: 'A translation service' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const tally = async (which: 'heard' | 'said', n: number) => {
          for (let i = 1; i <= n; i++) {
            d.q(`#an-${which}-${i}`).classList.add('is-on');
            await d.wait(110);
          }
        };
        await d.wait(400);
        await d.say('an-guest', { es: '¿…?', en: '…?' }, { hold: 700 });
        await d.caption({
          es: 'Un cliente extranjero pregunta algo en el mostrador',
          en: 'A foreign customer asks something at the counter',
        });
        await d.fly(phoneRoute(d), '', 'muted', { trail: { dashed: true } });
        await d.fly(phoneRoute(d), { es: 'nº de tarjeta', en: 'card number' }, 'tls', {
          small: true,
          arrive: 'interp',
        });
        await d.caption({
          es: 'Ana llama al servicio de traducción y da el número de la tarjeta de la tienda',
          en: 'Ana calls the translation service and gives the shop’s card number',
        });
        await d.fly(
          phoneRoute(d),
          { es: 'toda la conversación', en: 'the whole conversation' },
          'http',
          { small: true, arrive: 'interp' },
        );
        await tally('heard', 8);
        await d.caption({
          es: 'Y le lee la conversación entera, desde el principio',
          en: 'And reads out the whole conversation, from the start',
        });
        await d.caption({
          es: 'El servicio no recuerda las llamadas de antes',
          en: 'The service doesn’t remember earlier calls',
        });
        await d.fly(phoneRoute(d, true), { es: 'la traducción', en: 'the translation' }, 'http', {
          small: true,
        });
        await tally('said', 6);
        await d.caption({
          es: 'Cobra cada palabra que oye y cada palabra que dice',
          en: 'It charges for every word it hears and every word it says',
        });
        await d.show('#an-card');
        d.glow('#an-sign', 'tls');
        await d.caption({
          es: 'Y Ana nunca escribe el número de la tarjeta en un cartel del mostrador',
          en: 'And Ana never writes the card number on a sign on the counter',
        });
      },
    },
    {
      id: 'key',
      view: 'path',
      kind: 'tls',
      chip: { es: 'clave', en: 'key' },
      title: { es: 'La clave vive en el servidor', en: 'The key lives on the server' },
      start: () => ({}),
      end: () => ({ aiAsk: 'hello', aiKey: false, aiNote: 'unconfigured' }),
      async play(d) {
        await d.wait(300);
        d.set({ aiAsk: 'hello' });
        await d.fly(route(d, 'chat', 'api', REQ), POST_SHOP(d), 'http', { arrive: 'api' });
        await d.note(
          d.pt('api', 't'),
          {
            es: '¿Es una clienta? ¿Le quedan preguntas?',
            en: 'Is she a customer? Any questions left?',
          },
          { where: 'above', ttl: 1800 },
        );
        await d.caption({
          es: 'Carmen pregunta a la tienda, con su cookie de sesión',
          en: 'Carmen asks the shop, with her session cookie',
        });
        d.glow('#ai-key', 'tls');
        await d.fly(route(d, 'api', 'model', REQ), POST_MODEL, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.caption({
          es: 'La tienda pregunta al modelo con su clave, ANTHROPIC_API_KEY, que vive en su .env',
          en: 'The shop asks the model with its key, ANTHROPIC_API_KEY, which lives in its .env',
        });
        await answer(
          d,
          { es: 'texto + tokens', en: 'text + tokens' },
          { es: 'el texto, sin la clave', en: 'the text, without the key' },
        );
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'La clave solo sale del servidor hacia la API: nunca llega al navegador',
          en: 'The key only leaves the server toward the API: it never reaches the browser',
        });
        await d.caption({
          es: 'En un navegador, el propio SDK se niega sin dangerouslyAllowBrowser',
          en: 'In a browser, the SDK itself refuses without dangerouslyAllowBrowser',
        });
        d.set({ aiKey: false, aiAnswer: 0 });
        d.glow('#ai-key', 'http');
        await d.caption({
          es: 'La clave es opcional. Sin ella…',
          en: 'The key is optional. Without it…',
        });
        await d.fly(route(d, 'chat', 'api', REQ), POST_SHOP(d), 'http', { arrive: 'api' });
        await d.fly(route(d, 'api', 'chat', RES), '503', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'unconfigured' });
        await d.caption({
          es: '…la ruta contesta 503, y el resto de la tienda funciona igual',
          en: '…the route answers 503, and the rest of the shop works the same',
        });
      },
    },
    {
      id: 'who',
      view: 'gatekeep',
      kind: 'tls',
      chip: { es: 'quién', en: 'who' },
      title: { es: 'Quién puede preguntar', en: 'Who can ask' },
      start: () => ({ aiAsk: 'hello', aiCount: 18 }),
      end: () => ({ aiAsk: 'hello', aiCount: 20, aiRedisDown: true, aiNote: 'down' }),
      async play(d) {
        const checks = () => {
          for (const i of [1, 2, 3]) d.q(`#ai-check-${i}`).textContent = '';
        };
        const toGate = (label: Text | string, kind: 'http' | 'muted' = 'http') =>
          d.fly(route(d, 'chat', 'gate', REQ), label, kind, { arrive: 'gate' });
        const back = (label: Text | string) =>
          d.fly(route(d, 'gate', 'chat', RES), label, 'http', { arrive: 'chat' });
        await d.wait(300);
        await toGate(POST_SHOP(d));
        mark(d, '#ai-check-1', true);
        await d.wait(300);
        mark(d, '#ai-check-2', true);
        await d.caption({
          es: 'Solo pregunta un cliente con su sesión y el permiso asistente:usar',
          en: 'Only a customer with their session and the assistant:use permission can ask',
        });
        await d.fly(route(d, 'gate', 'redis', REQ), '+1', 'tls', { small: true, arrive: 'redis' });
        d.set({ aiCount: 19 });
        mark(d, '#ai-check-3', true);
        await d.fly(route(d, 'gate', 'model', REQ), POST_MODEL, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'gate', RES), '', 'http', { small: true, arrive: 'gate' });
        await back({ es: 'la respuesta', en: 'the answer' });
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'Como mucho, 20 preguntas por cliente cada 10 minutos, y 60 por IP, contadas en Redis',
          en: 'At most 20 questions per customer every 10 minutes, and 60 per IP, counted in Redis',
        });

        checks();
        d.set({ aiAnswer: 0 });
        await toGate({ es: 'sin sesión', en: 'no session' }, 'muted');
        mark(d, '#ai-check-1', false);
        await back('401');
        d.set({ aiNote: 'unauthorized' });
        await d.caption({
          es: 'Sin sesión, 401; con la clave de Reparto Rápido, 403',
          en: 'Without a session, 401; with Fast Delivery’s key, 403',
        });

        checks();
        d.set({ aiNote: '', aiCount: 20 });
        await toGate({ es: 'pregunta 21', en: 'question 21' });
        mark(d, '#ai-check-1', true);
        mark(d, '#ai-check-2', true);
        await d.fly(route(d, 'gate', 'redis', REQ), '+1', 'tls', { small: true, arrive: 'redis' });
        mark(d, '#ai-check-3', false);
        await back('429');
        d.set({ aiNote: 'limited' });
        await d.caption({
          es: 'La pregunta 21 recibe 429 con Retry-After, y al modelo no le llega',
          en: 'Question 21 gets 429 with Retry-After, and never reaches the model',
        });

        checks();
        d.set({ aiNote: '', aiRedisDown: true });
        await toGate({ es: 'pregunta', en: 'question' });
        mark(d, '#ai-check-1', true);
        mark(d, '#ai-check-2', true);
        await lose(d, route(d, 'gate', 'redis', REQ), '+1');
        mark(d, '#ai-check-3', false);
        await back('503');
        d.set({ aiNote: 'down' });
        await d.caption({
          es: 'Y si Redis no contesta, el límite se cierra: 503',
          en: 'And if Redis doesn’t answer, the limit closes: 503',
        });
      },
    },
    {
      id: 'request',
      view: 'reqview',
      kind: 'http',
      chip: { es: 'petición', en: 'request' },
      title: { es: 'Una petición', en: 'A request' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await row(d, '#ai-req-1', {
          es: 'model: qué modelo contesta; por defecto, claude-haiku-5-5',
          en: 'model: which model answers; by default, claude-haiku-5-5',
        });
        await row(d, '#ai-req-2', {
          es: 'max_tokens: lo más larga que puede ser la respuesta; si llega, se corta',
          en: 'max_tokens: the longest the answer can be; if it gets there, it’s cut',
        });
        await row(d, '#ai-req-3', {
          es: 'system: las instrucciones, lo que lee antes de la conversación',
          en: 'system: the instructions, what it reads before the conversation',
        });
        await row(d, '#ai-req-4', {
          es: 'effort: cuánto piensa antes de contestar; low tarda y cuesta menos',
          en: 'effort: how much it thinks before answering; low is faster and cheaper',
        });
        await row(d, '#ai-req-5', {
          es: 'messages: la conversación, con los roles user y assistant',
          en: 'messages: the conversation, with the roles user and assistant',
        });
        await d.fly(route(d, 'api', 'model', REQ), POST_MODEL, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.caption({
          es: 'No lleva temperature: los modelos actuales lo rechazan con un 400',
          en: 'No temperature: current models reject it with a 400',
        });
        await d.caption({
          es: 'El modelo aún no ve el catálogo ni los pedidos: se le dice que no se los invente',
          en: 'The model doesn’t see the catalog or the orders yet: it’s told not to make them up',
        });
      },
    },
    {
      id: 'response',
      view: 'resview',
      kind: 'http',
      chip: { es: 'respuesta', en: 'answer' },
      title: { es: 'La respuesta', en: 'The answer' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.fly(
          route(d, 'model', 'api', RES),
          { es: 'la respuesta', en: 'the answer' },
          'http',
          {
            arrive: 'api',
          },
        );
        await d.caption({
          es: 'content es una lista de bloques',
          en: 'content is a list of blocks',
        });
        await row(d, '#ai-res-1', {
          es: 'thinking: lo que pensó, con el texto vacío; no lo enseña, pero lo cobra',
          en: 'thinking: what it thought, with empty text; not shown, but charged for',
        });
        await row(d, '#ai-res-2', { es: 'text: la respuesta', en: 'text: the answer' });
        await row(d, '#ai-res-3', {
          es: 'stop_reason: por qué ha parado; end_turn, que ha terminado',
          en: 'stop_reason: why it stopped; end_turn, it has finished',
        });
        d.q('#ai-res-4').classList.add('is-lit');
        await row(d, '#ai-res-5', {
          es: 'usage: los tokens que se cobran, lo que ha leído y lo que ha escrito',
          en: 'usage: the tokens you pay for, what it read and what it wrote',
        });
        await d.setText('#ai-api-status', { es: 'texto + usage', en: 'text + usage' });
        await d.caption({
          es: 'La tienda se queda con el texto y los dos números de usage',
          en: 'The shop keeps the text and the two numbers in usage',
        });
      },
    },
    {
      id: 'tokens',
      view: 'tally',
      kind: 'dns',
      chip: { es: 'tokens', en: 'tokens' },
      title: { es: 'Lo que se paga', en: 'What you pay for' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'api', 'model', REQ), '500 tokens', 'dns', { arrive: 'model' });
        meterRow(d, 1);
        await d.caption({
          es: '500 tokens de entrada, entre instrucciones y conversación, a 0,10 $ el millón',
          en: '500 input tokens, instructions and conversation, at $0.10 per million',
        });
        await d.fly(route(d, 'model', 'api', RES), '150 tokens', 'dns', { arrive: 'api' });
        meterRow(d, 2);
        await d.caption({
          es: 'Una respuesta de 150, pensamiento incluido, a 0,50 $ el millón',
          en: 'An answer of 150, thinking included, at $0.50 per million',
        });
        meterRow(d, 3);
        await d.caption({
          es: '0,000125 $: unas ocho mil preguntas como esa por dólar',
          en: '$0.000125: about eight thousand questions like that per dollar',
        });
        await d.caption({
          es: 'La salida cuesta cinco veces más, y lo que piensa cuenta como salida',
          en: 'Output costs five times more, and what it thinks counts as output',
        });
        await d.caption({
          es: 'Y la entrada crece con la conversación, que viaja entera en cada pregunta',
          en: 'And input grows with the conversation, which travels whole with every question',
        });
      },
    },
    {
      id: 'stateless',
      view: 'path',
      kind: 'http',
      chip: { es: 'sin estado', en: 'stateless' },
      title: { es: 'La API no recuerda nada', en: 'The API remembers nothing' },
      start: () => ({ aiAsk: 'gift' }),
      end: () => ({ aiAsk: 'who', aiAnswer: SEGMENTS }),
      async play(d) {
        const one = { es: '1 mensaje', en: '1 message' };
        const three = { es: '3 mensajes', en: '3 messages' };
        await d.wait(300);
        await ask(d, one);
        await answer(d, '', '');
        d.set({ aiAnswer: SEGMENTS });
        await d.setText('#ai-model-status', { es: 'ya lo ha olvidado', en: 'already forgotten' });
        await d.caption({
          es: 'Entre una petición y la siguiente, la API lo olvida todo: es sin estado',
          en: 'Between one request and the next, the API forgets everything: it’s stateless',
        });
        d.set({ aiAsk: 'who', aiAnswer: 0 });
        await d.fly(route(d, 'chat', 'api', REQ), three, 'http', { arrive: 'api' });
        await d.fly(route(d, 'api', 'model', REQ), three, 'tls', { icon: 'key', arrive: 'model' });
        await d.setText('#ai-model-status', { es: 'lee los 3', en: 'reads all 3' });
        await answer(d, '', '');
        d.set({ aiAnswer: SEGMENTS });
        await d.caption({
          es: 'Para que sepa de qué se hablaba, cada petición lleva la conversación entera',
          en: 'For it to know what you were talking about, every request carries it all',
        });
        await d.caption({
          es: 'El frontend manda los últimos mensajes: como mucho 20, de 2000 caracteres',
          en: 'The frontend sends the latest messages: at most 20, of 2,000 characters',
        });
        await d.caption({
          es: 'En una conversación de diez preguntas, la primera se paga diez veces',
          en: 'In a ten-question conversation, the first question is paid for ten times',
        });
      },
    },
    {
      id: 'retries',
      view: 'duo',
      kind: 'http',
      chip: { es: 'reintentos', en: 'retries' },
      title: { es: 'El SDK, con reintentos', en: 'The SDK, with retries' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const attempt = (n: number) =>
          d.fly(route(d, 'api', 'model', REQ), { es: `intento ${n}`, en: `attempt ${n}` }, 'http', {
            arrive: 'model',
          });
        const waits = () =>
          d.note(
            d.pt('api', 'b'),
            { es: 'espera', en: 'waits' },
            { where: 'below', look: 'tag', kind: 'muted', ttl: 1200 },
          );
        await d.wait(300);
        await d.setText('#ai-api-status', 'SDK · maxRetries: 2');
        await d.caption({
          es: 'El SDK oficial hace la misma petición, con tipos y reintentos',
          en: 'The official SDK makes the same request, with types and retries',
        });
        await attempt(1);
        await d.fly(route(d, 'model', 'api', RES), '529', 'muted', { arrive: 'api' });
        await d.caption({
          es: 'Repite solo lo pasajero: un 429, un 529, otro 5xx o un corte de red',
          en: 'It only repeats what’s passing: a 429, a 529, another 5xx or a network cut',
        });
        await waits();
        await attempt(2);
        await d.fly(route(d, 'model', 'api', RES), '429 · retry-after', 'muted', {
          arrive: 'api',
        });
        await d.caption({
          es: 'Espera lo que diga retry-after o, si no lo dice, con una espera exponencial',
          en: 'It waits as long as retry-after says or, if it doesn’t, with exponential backoff',
        });
        await waits();
        await attempt(3);
        await d.fly(route(d, 'model', 'api', RES), '200', 'http', { arrive: 'api' });
        await d.caption({
          es: 'Con maxRetries 2, como mucho tres intentos, de 15 segundos cada uno',
          en: 'With maxRetries 2, at most three attempts, of 15 seconds each',
        });
        await d.caption({
          es: 'La dirección de la API sale de ANTHROPIC_BASE_URL: los tests la cambian',
          en: 'The API’s address comes from ANTHROPIC_BASE_URL: the tests change it',
        });
      },
    },
    {
      id: 'errors',
      view: 'path',
      kind: 'http',
      chip: { es: 'errores', en: 'errors' },
      title: { es: 'Cuando la API falla', en: 'When the API fails' },
      start: () => ({ aiAsk: 'hello' }),
      end: () => ({ aiAsk: 'hello', aiNote: 'failed' }),
      async play(d) {
        const fails = async (code: string) => {
          await d.fly(route(d, 'api', 'model', REQ), POST_MODEL, 'tls', {
            icon: 'key',
            arrive: 'model',
          });
          await d.fly(route(d, 'model', 'api', RES), code, 'muted', { arrive: 'api' });
        };
        await d.wait(300);
        await d.fly(route(d, 'chat', 'api', REQ), POST_SHOP(d), 'http', { arrive: 'api' });
        await fails('429');
        await d.fly(route(d, 'api', 'chat', RES), '503 · Retry-After', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'busy' });
        await d.caption({
          es: 'Ese 429 no es de Carmen: es de la cuenta de la tienda, que ha preguntado demasiado',
          en: 'That 429 isn’t Carmen’s: it’s the shop’s account, which has asked too much',
        });
        d.set({ aiNote: '' });
        await fails('529');
        await d.fly(route(d, 'api', 'chat', RES), '503 · Retry-After', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'busy' });
        await d.caption({
          es: 'Un 529 u otro 5xx, o nada a tiempo: también 503 con Retry-After',
          en: 'A 529 or another 5xx, or nothing in time: also 503 with Retry-After',
        });
        d.set({ aiNote: '' });
        await fails('400');
        await d.tag(
          d.pt('api', 't'),
          { es: 'el motivo, al log', en: 'the reason, to the log' },
          'muted',
        );
        await d.fly(route(d, 'api', 'chat', RES), '500', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'failed' });
        await d.caption({
          es: 'Un 400, 401 o 404 es culpa de la petición de la tienda: 500, y el motivo al log',
          en: 'A 400, 401 or 404 means the shop’s request is wrong: 500, and the reason to the log',
        });
        await d.caption({
          es: 'La tienda decide por la clase del error, nunca por el texto del mensaje',
          en: 'The shop decides by the error’s class, never by the message’s text',
        });
      },
    },
    {
      id: 'deadline',
      view: 'path',
      kind: 'http',
      chip: { es: 'plazo', en: 'time limit' },
      title: { es: 'El tiempo máximo', en: 'The time limit' },
      start: () => ({ aiAsk: 'hello' }),
      end: () => ({ aiAsk: 'hello', aiClosed: true }),
      async play(d) {
        await d.wait(300);
        await d.setText('#ai-api-status', { es: 'tope: 50 s', en: 'limit: 50 s' });
        await d.caption({
          es: 'Tres intentos de 15 segundos y sus esperas suman 46,5 segundos',
          en: 'Three 15-second attempts and their waits add up to 46.5 seconds',
        });
        await ask(d);
        await d.fly(
          route(d, 'model', 'api', RES),
          { es: '429 · espera 2 min', en: '429 · wait 2 min' },
          'muted',
          { arrive: 'api' },
        );
        await d.caption({
          es: 'Pero si retry-after pide dos minutos, el SDK los esperaría enteros',
          en: 'But if retry-after asks for two minutes, the SDK would wait all of them',
        });
        await d.note(d.pt('api', 't'), '50 s', {
          where: 'above',
          look: 'tag',
          kind: 'tls',
          ttl: 1400,
        });
        await cut(d, route(d, 'api', 'model', REQ));
        await d.fly(route(d, 'api', 'chat', RES), '503', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'busy' });
        await d.caption({
          es: 'Por eso la respuesta entera tiene su tope, 50 segundos, y contesta el 503 de la tienda',
          en: 'So the whole answer has its own limit, 50 seconds, and the shop answers its 503',
        });
        await d.caption({
          es: 'Por debajo de los 60 que nginx espera a la API, que darían un 504',
          en: 'Below the 60 that nginx waits for the API, which would give a 504',
        });
        d.set({ aiNote: '' });
        await ask(d);
        d.set({ aiClosed: true });
        d.glow('chat', 'muted');
        await d.caption({
          es: 'Si Carmen cierra la pestaña antes de la respuesta, salta la señal de su petición',
          en: 'If Carmen closes the tab before the answer, her request’s signal fires',
        });
        await cut(d, route(d, 'api', 'model', REQ));
        await d.caption({
          es: 'AbortSignal.any junta las dos señales y cancela con la primera que salte',
          en: 'AbortSignal.any joins the two signals and cancels with the first one to fire',
        });
      },
    },
    {
      id: 'refusal',
      view: 'path',
      kind: 'muted',
      chip: { es: 'negativa', en: 'refusal' },
      title: { es: 'Una negativa no es un error', en: 'A refusal isn’t an error' },
      start: () => ({ aiAsk: 'hello' }),
      end: () => ({ aiAsk: 'hello', aiAnswer: 4, aiNote: 'refused' }),
      async play(d) {
        await d.wait(300);
        await ask(d);
        await d.fly(route(d, 'model', 'api', RES), '200 · refusal', 'muted', { arrive: 'api' });
        await d.caption({
          es: 'A veces el modelo se niega: la API responde 200, con stop_reason refusal',
          en: 'Sometimes the model refuses: the API answers 200, with stop_reason refusal',
        });
        await d.fly(
          route(d, 'api', 'chat', RES),
          { es: 'la frase fija', en: 'the fixed sentence' },
          'muted',
          { arrive: 'chat' },
        );
        d.set({ aiAnswer: 4, aiNote: 'refused' });
        await d.caption({
          es: 'No es un error: Carmen recibe la frase fija de la tienda, con rechazada: true',
          en: 'It isn’t an error: Carmen gets the shop’s fixed sentence, with refused: true',
        });
        await d.tag(
          d.pt('api', 't'),
          { es: 'log: id y categoría', en: 'log: id and category' },
          'muted',
        );
        await d.caption({
          es: 'Al log van el id del mensaje y la categoría, nunca la conversación',
          en: 'The log gets the message’s id and the category, never the conversation',
        });
      },
    },
    {
      id: 'fake',
      view: 'tests',
      kind: 'tcp',
      chip: { es: 'tests', en: 'tests' },
      title: { es: 'El modelo de mentira', en: 'The fake model' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Un test que llamara al modelo costaría dinero y contestaría distinto cada vez',
          en: 'A test that called the model would cost money and answer differently every time',
        });
        await d.caption({
          es: 'Los tests usan un modelo de mentira, que contesta lo que pide cada test',
          en: 'The tests use a fake model, which answers whatever each test asks for',
        });
        await d.setText('#ai-fake-status', '429 · retry-after: 17');
        await d.caption({
          es: 'Este test le da su guion: un 429 con retry-after: 17',
          en: 'This test gives it its script: a 429 with retry-after: 17',
        });
        await d.type('#ai-cmd-1', 'node --test');
        await d.fly(route(d, 'shell', 'api', REQ), POST_SHOP(d), 'http', { arrive: 'api' });
        await d.fly(route(d, 'api', 'fakemodel', REQ), POST_MODEL, 'http', {
          arrive: 'fakemodel',
        });
        await d.caption({
          es: 'El SDK llega a él porque ANTHROPIC_BASE_URL apunta a su dirección',
          en: 'The SDK reaches it because ANTHROPIC_BASE_URL points at its address',
        });
        await d.fly(route(d, 'fakemodel', 'api', RES), '429 · retry-after: 17', 'muted', {
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'shell', RES), '503 · Retry-After: 17', 'http', {
          arrive: 'shell',
        });
        mark(d, '#ai-run-1', true);
        await d.caption({
          es: 'Un 429 de la API: Carmen recibe 503 con el mismo Retry-After, sin gastar nada',
          en: 'A 429 from the API: Carmen gets 503 with the same Retry-After, at no cost',
        });
      },
    },
    {
      id: 'try',
      view: 'tryit',
      kind: 'http',
      chip: { es: 'curl', en: 'curl' },
      title: { es: 'A mano y por la tienda', en: 'By hand and through the shop' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.type('#ai-cmd-1', 'curl …/v1/messages');
        await d.fly(route(d, 'shell', 'model', REQ), 'x-api-key', 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'shell', RES), 'content · usage', 'http', {
          arrive: 'shell',
        });
        mark(d, '#ai-run-1', true);
        await d.caption({
          es: 'Primero, a mano: la petición de la tienda, con curl y tu clave',
          en: 'First, by hand: the shop’s request, with curl and your key',
        });
        await d.caption({
          es: 'Con usage y los precios, jq calcula lo que ha costado',
          en: 'With usage and the prices, jq works out what it cost',
        });
        await d.type('#ai-cmd-2', `curl …${strings[d.lang].route.slice(5)}`);
        await d.fly(
          route(d, 'shell', 'api', REQ),
          { es: 'cookie de Carmen', en: 'Carmen’s cookie' },
          'http',
          { arrive: 'api' },
        );
        await d.fly(route(d, 'api', 'model', REQ), '', 'tls', {
          icon: 'key',
          small: true,
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'api', RES), '', 'http', { small: true, arrive: 'api' });
        await d.fly(
          route(d, 'api', 'shell', RES),
          { es: 'texto · rechazada · uso', en: 'text · refused · usage' },
          'http',
          { arrive: 'shell' },
        );
        mark(d, '#ai-run-2', true);
        await d.caption({
          es: 'La misma pregunta, a través de la tienda, con la sesión de Carmen',
          en: 'The same question, through the shop, with Carmen’s session',
        });
        await d.caption({
          es: 'Con la conversación entera, uso.entrada crece: lo dicho antes se vuelve a pagar',
          en: 'With the whole conversation, usage.input grows: what was said is paid for again',
        });
        await d.type('#ai-cmd-3', 'node --test …429');
        mark(d, '#ai-run-3', true);
        await d.caption({
          es: 'Y los dos 429, con el modelo de mentira: no gastan nada',
          en: 'And the two 429s, with the fake model: they cost nothing',
        });
      },
    },
  ],
};

export default lesson;
