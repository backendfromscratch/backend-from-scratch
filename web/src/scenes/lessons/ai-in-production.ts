/**
 * The scenes of «IA en producción: costes, latencia y evals» / "AI in production: costs, latency
 * and evals" (translationKey ai-in-production), one per part of the text, in the order of its
 * <Scene id="…" /> cues: a bill three times larger, a cafeteria card with a daily balance, what each
 * answer costs, the two brakes, the budget checked before and charged after, Redis not answering,
 * the prompt cache, the time to first token, long work in the queue, the evals and their judge, the
 * fake model in CI, the trace, and the lesson's commands (worlds/ops/, worlds/assistant/,
 * worlds/vectors/, worlds/analogies/). Prices, budgets and estimates are each page's own; the
 * model's answers are placeholder lines, never words, and the histogram has no values.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { analogies } from '../worlds/analogies/analogies';
import {
  assistant,
  INITIAL,
  lose,
  mark,
  route,
  SEGMENTS,
  type AssistantState,
} from '../worlds/assistant/assistant';
import { strings as shop } from '../worlds/assistant/strings';
import { budgetFill, ops, OPS_INITIAL, type OpsState } from '../worlds/ops/ops';
import { strings } from '../worlds/ops/strings';
import { animate, vectors, VECTORS_INITIAL, type VectorsState } from '../worlds/vectors/vectors';

type State = AssistantState & VectorsState & OpsState;
type D = Director<State>;

const REQ = -1;
const RES = 1;
const data = (d: D) => strings[d.lang];
const MESSAGES = 'POST /v1/messages';

/** A transform tweened on a part, for the run (pause, speed, cancel); the state draws its end. */
async function tween(d: D, selector: string, from: string, to: string, dur = 700): Promise<void> {
  if (d.run.instant) return;
  await d.run.track(
    d.run.adopt(
      d.q(selector).animate([{ transform: from }, { transform: to }], {
        duration: dur,
        easing: 'cubic-bezier(.45,.05,.35,1)',
      }),
    ),
  );
}

/** Carmen's budget goes from what it was to `spent` (a share of the 100.000 tokens). */
async function spend(d: D, spent: number): Promise<void> {
  const from = `scaleX(${budgetFill(d.state.opSpent).toFixed(3)})`;
  d.set({ opSpent: spent });
  await tween(d, '#op-spent i', from, `scaleX(${budgetFill(spent).toFixed(3)})`);
}

/** The shop reads Carmen's count in Redis before asking the model. */
async function check(d: D): Promise<void> {
  await d.fly(route(d, 'api', 'budget', REQ), 'GET', 'tls', { small: true, arrive: 'budget' });
  await d.fly(route(d, 'budget', 'api', RES), '', 'tls', { small: true, dur: 600 });
}

const lesson: LessonModule<State> = {
  initial: { ...INITIAL, ...VECTORS_INITIAL, ...OPS_INITIAL },
  worlds: [ops, assistant, vectors, analogies],
  scenes: [
    {
      id: 'problem',
      view: 'path',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Un mes después', en: 'A month later' },
      start: () => ({}),
      end: () => ({ aiAsk: 'hello', aiAnswer: SEGMENTS }),
      async play(d) {
        await d.wait(300);
        d.set({ aiAsk: 'hello' });
        await Promise.all(
          [0, 1, 2].map(async (i) => {
            await d.wait(i * 380);
            await d.fly(route(d, 'chat', 'api', REQ), '', 'http', { small: true, dur: 700 });
            await d.fly(route(d, 'api', 'model', REQ), '', 'tls', { small: true, dur: 700 });
          }),
        );
        await d.note(
          d.pt('model', 'b'),
          { es: 'factura × 3', en: 'bill × 3' },
          {
            where: 'below',
            look: 'tag',
            kind: 'dns',
          },
        );
        await d.caption({
          es: 'La factura de la Console sale el triple de lo esperado, y no sabes por qué',
          en: 'The Console’s bill is three times what you expected, and you don’t know why',
        });
        await d.wait(900);
        await d.fly(route(d, 'model', 'api', RES), '', 'http', { small: true });
        await d.fly(route(d, 'api', 'chat', RES), '', 'http', { small: true, arrive: 'chat' });
        d.set({ aiAnswer: SEGMENTS });
        await d.note(
          d.pt('chat', 'b'),
          { es: '«tarda un mundo en empezar»', en: '“takes forever to start”' },
          { where: 'below', look: 'tag', kind: 'muted' },
        );
        await d.caption({
          es: 'Una clienta escribe que «tarda un mundo en empezar a contestar»',
          en: 'A customer writes that it “takes forever to start answering”',
        });
        await d.note(
          d.pt('api', 't'),
          { es: '¿mejor o peor?', en: 'better or worse?' },
          {
            where: 'above',
            look: 'tag',
            kind: 'http',
          },
        );
        await d.caption({
          es: 'Y ayer cambiaste una frase de las instrucciones: ¿contesta mejor o peor?',
          en: 'And yesterday you changed a sentence in the instructions: better or worse?',
        });
        await d.caption({
          es: 'Una pregunta al modelo tiene precio, tarda segundos y no contesta dos veces igual',
          en: 'A question to the model has a price, takes seconds and never answers the same twice',
        });
      },
    },
    {
      id: 'analogy',
      view: 'lunch',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'El comedor', en: 'The cafeteria' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const refuse = async (text: Text) => {
          await d.setText('#an-till-status', text);
          d.glow('#an-till-status', 'http');
        };
        await d.wait(400);
        await d.caption({
          es: 'El comedor se paga con una tarjeta con saldo diario',
          en: 'The cafeteria is paid for with a card that has a daily balance',
        });
        const left = [1, 0.62, 0.3, 0] as const;
        for (const i of [1, 2, 3]) {
          await d.show(`#an-line-${i}`);
          await animate(d, '#an-balance', `scaleX(${left[i - 1]})`, `scaleX(${left[i]})`, 600);
          if (i === 1)
            await d.caption({
              es: 'Cada plato tiene su precio, que sale en el ticket',
              en: 'Each dish has its price, which shows on the receipt',
            });
        }
        await refuse({ es: 'sin saldo', en: 'no balance' });
        await d.caption({
          es: 'Si ya has gastado tu saldo, la caja no te deja coger nada más hasta mañana',
          en: 'If you’ve spent today’s balance, the register won’t let you take anything else',
        });
        await refuse({ es: 'no lee la tarjeta', en: 'can’t read the card' });
        await d.caption({
          es: 'Y si no puede consultar tu tarjeta, no te fía',
          en: 'And if it can’t check your card, it won’t give you credit',
        });
        for (const i of [1, 2, 3]) {
          await d.fly([d.pt('#an-pot', 'r'), d.pt(`#an-bowl-${i}`, 't')], '', 'dns', {
            small: true,
            dur: 650,
          });
          d.q(`#an-bowl-${i}`).classList.add('is-on');
        }
        await d.caption({
          es: 'En la cocina, el caldo se hace una vez para todas las sopas: cada plato, más barato',
          en: 'In the kitchen, the broth is made once for all the soups: each dish, cheaper',
        });
      },
    },
    {
      id: 'bill',
      view: 'pricing',
      kind: 'dns',
      chip: { es: 'cuenta', en: 'bill' },
      title: { es: 'Cada respuesta, su cuenta', en: 'Every answer, its bill' },
      start: () => ({ opBill: false }),
      end: () => ({ opBill: true }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'api', 'model', REQ), MESSAGES, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'api', RES), 'usage', 'dns', { arrive: 'api' });
        await d.caption({
          es: 'Cada respuesta dice en usage cuántos tokens ha leído y escrito el modelo',
          en: 'Every answer says in usage how many tokens the model read and wrote',
        });
        d.glow('pricecard', 'dns');
        await d.caption({
          es: 'En cuatro tipos, con cuatro precios por millón de tokens',
          en: 'In four kinds, with four prices per million tokens',
        });
        d.set({ opBill: true });
        d.glow('#op-total', 'dns');
        await d.caption({
          es: 'Leer 2.000 tokens sin caché y escribir 150: 0,000275 $',
          en: 'Reading 2,000 tokens without cache and writing 150: $0.000275',
        });
        await d.note(
          d.pt('api', 'b'),
          { es: 'log: llamada al modelo · costeUsd', en: 'log: call to the model · costUsd' },
          { where: 'below', look: 'tag', kind: 'muted', ttl: 2400 },
        );
        await d.caption({
          es: 'Cada llamada deja en el log su uso y su coste, nunca la conversación',
          en: 'Every call leaves its usage and its cost in the log, never the conversation',
        });
        await d.fly(
          route(d, 'api', 'model', REQ),
          { es: 'vuelta 2: todo otra vez', en: 'round 2: all again' },
          'tls',
          { icon: 'key', arrive: 'model' },
        );
        await d.fly(route(d, 'model', 'api', RES), 'usage', 'dns', { arrive: 'api' });
        await d.caption({
          es: 'Una pregunta pueden ser varias llamadas: la segunda vuelta lee todo otra vez',
          en: 'One question can be several calls: the second round reads everything again',
        });
      },
    },
    {
      id: 'brakes',
      view: 'gatekeep',
      kind: 'tls',
      chip: { es: 'frenos', en: 'brakes' },
      title: { es: 'Dos frenos', en: 'Two brakes' },
      start: () => ({ aiBudget: true, aiCount: 4, aiAsk: 'hello' }),
      end: () => ({ aiBudget: true, aiCount: 5, aiAsk: 'hello', aiNote: 'exhausted' }),
      async play(d) {
        const pass = async (refused: 0 | 3 | 4) => {
          await d.fly(route(d, 'chat', 'gate', REQ), shop[d.lang].route, 'http', {
            arrive: 'gate',
          });
          for (const i of [1, 2, 3, 4]) mark(d, `#ai-check-${i}`, i !== refused);
          if (refused) {
            await d.fly(route(d, 'gate', 'chat', RES), '429', 'http', { arrive: 'chat' });
            d.set({ aiNote: refused === 3 ? 'tooMany' : 'exhausted' });
            return;
          }
          await d.fly(route(d, 'gate', 'model', REQ), MESSAGES, 'tls', {
            icon: 'key',
            arrive: 'model',
          });
        };
        await d.wait(300);
        await d.caption({
          es: 'POST /v2/asistente tiene dos frenos, y los dos se miran antes del modelo',
          en: 'POST /v2/assistant has two brakes, and both are checked before the model',
        });
        await pass(0);
        d.set({ aiCount: 20 });
        await d.wait(500);
        await pass(3);
        await d.caption({
          es: 'El límite frena a quien pregunta muy deprisa: 20 cada 10 minutos, 60 por IP',
          en: 'The limit brakes whoever asks very fast: 20 every 10 minutes, 60 per IP',
        });
        d.set({ aiCount: 5, aiNote: '' });
        await pass(4);
        await d.caption({
          es: 'El presupuesto, lo que de verdad paga la tienda: 100.000 tokens al día',
          en: 'The budget, what the shop really pays for: 100,000 tokens a day',
        });
        await d.caption({
          es: 'Pasado, 429 presupuesto-agotado, con Retry-After hasta las 00:00 UTC',
          en: 'Past it, 429 budget-exhausted, with Retry-After until 00:00 UTC',
        });
      },
    },
    {
      id: 'budget',
      view: 'budgeting',
      kind: 'tls',
      chip: { es: 'tope', en: 'budget' },
      title: { es: 'Se mira antes, se cobra después', en: 'Checked before, charged after' },
      start: () => ({ opSpent: 0.62, aiAsk: 'hello' }),
      end: () => ({ opSpent: 1.05, aiAsk: 'hello', aiNote: 'exhausted' }),
      async play(d) {
        const question = async (spent: number) => {
          await d.fly(route(d, 'chat', 'api', REQ), '', 'http', { small: true, dur: 600 });
          await check(d);
          await d.fly(route(d, 'api', 'model', REQ), '', 'tls', { small: true, dur: 600 });
          await d.fly(route(d, 'model', 'api', RES), 'usage', 'dns', { small: true, dur: 600 });
          await d.fly(route(d, 'api', 'budget', REQ), '+ tokens', 'tls', {
            small: true,
            dur: 600,
            arrive: 'budget',
          });
          await spend(d, spent);
        };
        await d.wait(300);
        await d.caption({
          es: 'Cada cliente tiene una cuenta por día en Redis, que solo sube',
          en: 'Each customer has a count per day in Redis, which only goes up',
        });
        await question(0.86);
        await d.caption({
          es: 'Antes de llamar al modelo, la ruta la lee; después de cada llamada, suma sus tokens',
          en: 'Before calling the model, the route reads it; after each call, it adds its tokens',
        });
        await question(1.05);
        await d.caption({
          es: 'La última pregunta del día puede pasarse lo que cuesta una',
          en: 'The last question of the day can go over by what one costs',
        });
        await d.fly(route(d, 'chat', 'api', REQ), '', 'http', { small: true, dur: 600 });
        await check(d);
        await d.fly(route(d, 'api', 'chat', RES), '429', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'exhausted' });
        await d.caption({
          es: 'Cuenta todo, también la caché; un flujo cortado se cobra con su entrada entera',
          en: 'It counts everything, cache included; a cut stream is charged its whole input',
        });
        await d.caption({
          es: '100.000 tokens son unas 20 preguntas, estimado: como mucho 5 céntimos al día',
          en: '100,000 tokens are about 20 questions, estimated: 5 cents a day at most',
        });
      },
    },
    {
      id: 'closed',
      view: 'budgeting',
      kind: 'tls',
      chip: { es: 'Redis', en: 'Redis' },
      title: { es: 'El presupuesto se cierra', en: 'The budget closes' },
      start: () => ({ opSpent: 0.62, aiAsk: 'hello' }),
      end: () => ({ opSpent: 0.62, opRedisDown: true, aiAsk: 'hello', aiNote: 'unchecked' }),
      async play(d) {
        await d.wait(300);
        d.set({ opRedisDown: true });
        d.glow('budget', 'http');
        await d.fly(route(d, 'chat', 'api', REQ), shop[d.lang].route, 'http', { arrive: 'api' });
        await lose(d, route(d, 'api', 'budget', REQ), 'GET');
        await d.note(d.pt('api', 'b'), '200 ms', {
          where: 'below',
          look: 'tag',
          kind: 'tls',
          ttl: 1600,
        });
        await d.caption({
          es: 'Cada consulta espera a Redis 200 ms como mucho',
          en: 'Each check waits 200 ms for Redis at most',
        });
        await d.fly(route(d, 'api', 'chat', RES), '503', 'http', { arrive: 'chat' });
        d.set({ aiNote: 'unchecked' });
        await d.caption({
          es: 'Si no contesta, 503 presupuesto-sin-comprobar, con Retry-After: 5: se cierra',
          en: 'If it doesn’t answer, 503 budget-unchecked, with Retry-After: 5: it closes',
        });
        await d.caption({
          es: 'Preguntas sin contar son justo el gasto que existe para frenar',
          en: 'Uncounted questions are exactly the spending it exists to brake',
        });
        await d.caption({
          es: 'Si falla al cobrar, después de la llamada, la respuesta llega igual y el log avisa',
          en: 'If it fails when charging, after the call, the answer arrives anyway and the log warns',
        });
      },
    },
    {
      id: 'cache',
      view: 'caching',
      kind: 'dns',
      chip: { es: 'caché', en: 'cache' },
      title: { es: 'La caché de prompts', en: 'Prompt caching' },
      start: () => ({ opCached: false }),
      end: () => ({ opCached: true }),
      async play(d) {
        const call = (n: number) =>
          d.fly(route(d, 'api', 'model', REQ), { es: `petición ${n}`, en: `request ${n}` }, 'tls', {
            icon: 'key',
            arrive: 'model',
          });
        await d.wait(300);
        for (const i of [1, 2]) {
          d.q(`#op-part-${i}`).classList.add('is-lit');
          d.glow(`#op-part-${i}`, 'dns');
        }
        d.q('#op-prompt').classList.add('is-marked');
        await d.caption({
          es: 'Cada pregunta empieza igual; la marca va al final de las instrucciones',
          en: 'Every question starts the same; the mark goes at the end of the instructions',
        });
        await call(1);
        await d.fly(route(d, 'model', 'pcache'), '', 'dns', { small: true, arrive: 'pcache' });
        d.set({ opCached: true });
        await d.setText('#op-pcache-status', { es: 'escritura: 1,25 ×', en: 'write: 1.25 ×' });
        await d.caption({
          es: 'La primera vez lo guarda, a 1,25 veces la entrada, durante 5 minutos',
          en: 'The first time it stores it, at 1.25 times the input, for 5 minutes',
        });
        await call(2);
        await d.fly(route(d, 'pcache', 'model'), '', 'dns', { small: true, arrive: 'model' });
        await d.setText('#op-pcache-status', { es: 'lectura: una décima', en: 'read: a tenth' });
        await d.caption({
          es: 'La siguiente que empiece igual lo lee de la caché: una décima parte',
          en: 'The next one that starts the same reads it from the cache: a tenth',
        });
        d.q('#op-part-2').classList.add('is-miss');
        await d.show('#op-hour');
        await call(3);
        await d.setText('#op-pcache-status', { es: 'no coincide', en: 'no match' });
        await d.caption({
          es: 'Cualquier cambio antes de la marca, como la hora, la rompe sin avisar',
          en: 'Any change before the mark, like the time, breaks it without warning',
        });
        await d.caption({
          es: 'Con menos de 512 tokens delante no guarda nada; aquí hay unos 1.850, estimados',
          en: 'With fewer than 512 tokens before it, nothing is kept; here, about 1,600, estimated',
        });
      },
    },
    {
      id: 'ttft',
      view: 'ttfthist',
      kind: 'http',
      chip: { es: '1.er token', en: '1st token' },
      title: { es: 'El primer token', en: 'The first token' },
      start: () => ({ opTtft: 0 }),
      end: () => ({ opTtft: 3 }),
      async play(d) {
        /** The first piece reaches the shop, and its wait drops into the histogram. */
        const first = async (n: 1 | 2 | 3, bucket: number) => {
          await d.fly(
            route(d, 'model', 'api', RES),
            { es: 'primer trozo', en: 'first piece' },
            'http',
            {
              small: true,
              arrive: 'api',
            },
          );
          await d.fly([d.pt('api', 'b'), d.pt(`#op-bucket-${bucket}`, 't')], '', 'http', {
            small: true,
            dur: 650,
          });
          d.set({ opTtft: n });
          d.glow(`#op-bucket-${bucket}`, 'dns');
        };
        await d.wait(300);
        await d.fly(route(d, 'api', 'model', REQ), MESSAGES, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await first(1, 1);
        await d.caption({
          es: 'Lo que el cliente espera mirando la pantalla vacía, hasta el primer trozo',
          en: 'What the customer waits looking at the empty screen, until the first piece',
        });
        await d.fly(route(d, 'api', 'model', REQ), MESSAGES, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.fly(route(d, 'model', 'api', RES), 'tool_use', 'tcp', {
          small: true,
          arrive: 'api',
        });
        await d.fly(route(d, 'api', 'model', REQ), 'tool_result', 'tcp', {
          small: true,
          arrive: 'model',
        });
        await first(2, 3);
        await d.caption({
          es: 'Cada vuelta con herramientas es una llamada entera antes de la primera palabra',
          en: 'Each round with tools is a whole call before the first word',
        });
        await d.fly(route(d, 'api', 'model', REQ), MESSAGES, 'tls', {
          icon: 'key',
          arrive: 'model',
        });
        await d.setText('#ai-model-status', { es: 'piensa más', en: 'thinks more' });
        await d.wait(900);
        await first(3, 5);
        await d.caption({
          es: 'Con más esfuerzo piensa más, y lo pensado también se paga',
          en: 'With more effort it thinks more, and what it thinks is paid for too',
        });
        await d.caption({
          es: 'El streaming hace que la respuesta empiece antes, no que acabe antes',
          en: 'Streaming makes the answer start sooner, not finish sooner',
        });
      },
    },
    {
      id: 'queue',
      view: 'longjob',
      kind: 'tcp',
      chip: { es: 'cola', en: 'queue' },
      title: { es: 'El trabajo largo, a la cola', en: 'Long work, to the queue' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.fly(
          route(d, 'admin', 'api', REQ),
          { es: 'POST …/descripcion', en: 'POST …/description' },
          'http',
          { arrive: 'api' },
        );
        await d.caption({
          es: 'Ana quiere que el modelo escriba la descripción de un producto',
          en: 'Ana wants the model to write a product’s description',
        });
        await d.fly(route(d, 'api', 'admin', RES), '202', 'tcp', { arrive: 'admin' });
        await d.caption({
          es: 'La ruta apunta el encargo y contesta enseguida, 202, sin llamar al modelo',
          en: 'The route records the request and answers right away, 202, without the model',
        });
        await d.fly(route(d, 'api', 'worker'), { es: 'el encargo', en: 'the job' }, 'tcp', {
          arrive: 'worker',
        });
        await d.setText('#vx-worker-status', { es: 'intento 1', en: 'attempt 1' });
        await d.fly(route(d, 'worker', 'model', REQ), '', 'tls', { small: true, arrive: 'model' });
        await d.fly(route(d, 'model', 'worker', RES), 'error', 'muted', { small: true });
        await d.note(
          d.pt('worker', 'b'),
          { es: 'espera 1 s', en: 'waits 1 s' },
          {
            where: 'below',
            look: 'tag',
            kind: 'tcp',
            ttl: 1500,
          },
        );
        await d.caption({
          es: 'El trabajador la escribe con reintentos: cinco intentos, con 1, 2, 4 y 8 s entre ellos',
          en: 'The worker writes it with retries: five attempts, 1, 2, 4 and 8 s apart',
        });
        await d.setText('#vx-worker-status', { es: 'intento 2', en: 'attempt 2' });
        await d.fly(route(d, 'worker', 'model', REQ), '', 'tls', { small: true, arrive: 'model' });
        await d.fly(
          route(d, 'model', 'worker', RES),
          { es: 'descripción', en: 'description' },
          'http',
          { small: true, arrive: 'worker' },
        );
        await d.setText('#vx-worker-status', { es: 'esquema ✓', en: 'schema ✓' });
        await d.caption({
          es: 'Lo que escribe un modelo es una entrada más: pasa por el mismo esquema',
          en: 'What a model writes is one more input: it goes through the same schema',
        });
        await d.caption({
          es: 'Si no vale, el trabajo falla y la cola lo repite; si el modelo se niega, no',
          en: 'If it isn’t valid, the job fails and the queue repeats it; if the model refuses, not',
        });
      },
    },
    {
      id: 'evals',
      view: 'evalrun',
      kind: 'tcp',
      chip: { es: 'evals', en: 'evals' },
      title: { es: 'Doce casos', en: 'Twelve cases' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const group = async (cases: readonly number[], text: Text) => {
          d.qa('.op-case.is-lit').forEach((one) => one.classList.remove('is-lit'));
          for (const i of cases) d.q(`#op-case-${i}`).classList.add('is-lit');
          await d.fly(route(d, 'evals', 'api', REQ), '', 'tcp', { small: true, dur: 550 });
          await d.fly(route(d, 'api', 'model', REQ), '', 'tls', { small: true, dur: 550 });
          await d.fly(route(d, 'model', 'api', RES), '', 'http', { small: true, dur: 550 });
          await d.fly(route(d, 'api', 'evals', RES), '', 'http', { small: true, dur: 550 });
          await d.caption(text);
        };
        await d.wait(300);
        await d.caption({
          es: 'Un asistente no contesta dos veces igual: se comprueba lo que hace, no sus palabras',
          en: 'An assistant never answers the same twice: you check what it does, not its words',
        });
        await group([1, 2], {
          es: `Llama a ${shop.es.tools.names[0]} con el número que ha dicho`,
          en: `It calls ${shop.en.tools.names[0]} with the number she gave`,
        });
        await group([3, 4], {
          es: 'No dice qué lleva el pedido 22, que es de Pablo',
          en: 'It doesn’t say what’s in order 22, which is Pablo’s',
        });
        await group([5, 6], {
          es: 'Dice que no lo sabe, y no da ningún teléfono',
          en: 'It says it doesn’t know, and gives no phone number',
        });
        await group([7, 8, 9], {
          es: 'La página correcta está en fuentes, y el plazo es 30',
          en: 'The right page is in sources, and the window is 30',
        });
        await group([10, 11], {
          es: 'Busca antes de hablar de un producto, y da su precio de verdad',
          en: 'It searches before talking about a product, and gives its real price',
        });
        await d.caption({
          es: 'Casi todos los correctores son código: exactos, siempre iguales y gratis',
          en: 'Nearly all the graders are code: exact, always the same and free',
        });
      },
    },
    {
      id: 'judge',
      view: 'judging',
      kind: 'tcp',
      chip: { es: 'juez', en: 'judge' },
      title: { es: 'El modelo como juez', en: 'The model as judge' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        d.q('#op-case-12').classList.add('is-lit');
        await d.caption({
          es: 'Si una recomendación de regalo tiene sentido, el código no sabe mirarlo',
          en: 'Whether a gift recommendation makes sense isn’t something code can look at',
        });
        await d.fly(route(d, 'evals', 'model', REQ), '', 'tcp', { small: true, arrive: 'model' });
        await d.fly(
          route(d, 'model', 'evals', RES),
          { es: 'la respuesta', en: 'the answer' },
          'http',
          {
            small: true,
            arrive: 'evals',
          },
        );
        await d.fly(
          route(d, 'evals', 'judge', REQ),
          { es: 'pregunta, respuesta, rúbrica', en: 'question, answer, rubric' },
          'tcp',
          { arrive: 'judge' },
        );
        await d.caption({
          es: 'Otro modelo lee la pregunta, la respuesta y una rúbrica corta',
          en: 'Another model reads the question, the answer and a short rubric',
        });
        await d.setText('#op-judge-status', data(d).judge.result);
        await d.fly(route(d, 'judge', 'evals', RES), 'JSON', 'tcp', {
          small: true,
          arrive: 'evals',
        });
        await d.caption({
          es: 'Con salidas estructuradas: la API garantiza un JSON con cumple y motivo',
          en: 'With structured outputs: the API guarantees a JSON with meets and reason',
        });
        await d.caption({
          es: 'Pero también se equivoca, es el mismo modelo que el asistente, y cuesta tokens',
          en: 'But it makes mistakes too, it’s the same model as the assistant, and costs tokens',
        });
        await d.caption({
          es: 'Por eso lo usa un solo caso, y un fallo del juez se mira a mano',
          en: 'That’s why a single case uses it, and a failure from the judge is checked by hand',
        });
      },
    },
    {
      id: 'ci',
      view: 'tests',
      kind: 'tcp',
      chip: { es: 'CI', en: 'CI' },
      title: { es: 'En CI, el modelo de mentira', en: 'In CI, the fake model' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        const script = async (name: Text, back: string) => {
          await d.setText('#ai-fake-status', name);
          await d.fly(route(d, 'api', 'fakemodel', REQ), '', 'tcp', { small: true, dur: 600 });
          await d.fly(route(d, 'fakemodel', 'api', RES), back, 'tcp', { small: true, dur: 600 });
        };
        await d.wait(300);
        await d.caption({
          es: 'Las evals cuestan dinero, piden la clave y varían: en CI serían intermitentes',
          en: 'Evals cost money, need the key and vary: in CI they’d be flaky',
        });
        await d.caption({
          es: 'Se pasan a mano, después de cambiar las instrucciones, una herramienta o el modelo',
          en: 'You run them by hand, after changing the instructions, a tool or the model',
        });
        await d.type('#ai-cmd-1', 'npm test');
        await d.fly(route(d, 'shell', 'api', REQ), '', 'tcp', { small: true, arrive: 'api' });
        await script({ es: 'guion: buena', en: 'script: good' }, '✓');
        await d.caption({
          es: 'En CI van los tests, con el modelo de mentira: gratis, sin clave, siempre igual',
          en: 'CI runs the tests, with the fake model: free, keyless, always the same',
        });
        await script({ es: 'guion: mala', en: 'script: bad' }, '✗');
        await d.caption({
          es: 'Respuestas buenas que tienen que pasar, y malas que tienen que fallar',
          en: 'Good answers that must pass, and bad ones that must fail',
        });
        await script({ es: 'guion: 429', en: 'script: 429' }, '429');
        mark(d, '#ai-run-1', true);
        await d.caption({
          es: 'Y capaz de fallar a propósito, con un 429 o un corte',
          en: 'And able to fail on purpose, with a 429 or a cut',
        });
      },
    },
    {
      id: 'trace',
      view: 'spans',
      kind: 'http',
      chip: { es: 'traza', en: 'trace' },
      title: { es: 'El span del SDK', en: 'The SDK’s span' },
      start: () => ({ opTraced: false }),
      end: () => ({ opTraced: true }),
      async play(d) {
        await d.wait(300);
        await animate(d, '#op-span-1', 'scaleX(0)', 'scaleX(1)', 700);
        await animate(d, '#op-span-2', 'scaleX(0)', 'scaleX(1)', 600);
        await d.caption({
          es: 'En Jaeger, cada llamada al modelo es un span dentro del de la petición',
          en: 'In Jaeger, each call to the model is a span inside the request’s',
        });
        await animate(d, '#op-span-3', 'scaleX(0)', 'scaleX(1)', 400);
        await animate(d, '#op-span-4', 'scaleX(0)', 'scaleX(1)', 600);
        await d.caption({
          es: 'No lo crea la tienda, sino el SDK, con el proveedor de trazas de la Fase 10',
          en: 'The shop doesn’t create it; the SDK does, with the trace provider from Phase 10',
        });
        for (const i of [1, 2, 3, 4]) {
          await d.show(`#op-attr-${i}`);
          await d.wait(200);
        }
        await d.caption({
          es: 'Un span por vuelta: el modelo, los tokens, el id del mensaje y el primer trozo',
          en: 'One span per round: the model, the tokens, the message id and the first piece',
        });
        await d.show('#op-attr-none');
        d.set({ opTraced: true });
        await d.caption({
          es: 'Sin la conversación: una traza no lleva lo que el log no lleva',
          en: 'Without the conversation: a trace doesn’t carry what the log doesn’t',
        });
        await d.caption({
          es: 'Y en Grafana, el coste de la última hora y el p50 y el p95 del primer token',
          en: 'And in Grafana, the last hour’s cost and the first token’s p50 and p95',
        });
      },
    },
    {
      id: 'try',
      view: 'tryprod',
      kind: 'tls',
      chip: { es: 'Carmen', en: 'Carmen' },
      title: { es: 'El presupuesto de Carmen', en: 'Carmen’s budget' },
      start: () => ({ opSpent: 0, opCount: '' }),
      end: () => ({ opSpent: 1, opCount: '100000' }),
      async play(d) {
        await d.wait(300);
        const es = d.lang === 'es';
        await d.type('#ai-cmd-1', es ? 'redis-cli GET "$CLAVE"' : 'redis-cli GET "$KEY"');
        await d.fly(route(d, 'shell', 'budget', REQ), 'GET', 'tls', { arrive: 'budget' });
        d.set({ opCount: '300', opSpent: 0.003 });
        await d.fly(route(d, 'budget', 'shell', RES), '300', 'tls', {
          small: true,
          arrive: 'shell',
        });
        mark(d, '#ai-run-1', true);
        await d.caption({
          es: 'Lo que lleva gastado hoy: la suma de los cuatro tipos de su pregunta',
          en: 'What she’s spent today: the sum of the four kinds from her question',
        });
        await d.type('#ai-cmd-2', 'redis-cli SET … 100000');
        await d.fly(route(d, 'shell', 'budget', REQ), 'SET', 'tls', { arrive: 'budget' });
        await spend(d, 1);
        d.set({ opCount: '100000' });
        mark(d, '#ai-run-2', true);
        await d.caption({
          es: 'Ahora, agótalo: la cuenta en 100.000, y KEEPTTL conserva su caducidad',
          en: 'Now, use it up: the count at 100,000, and KEEPTTL keeps its expiry',
        });
        await d.type('#ai-cmd-3', es ? 'curl …/v2/asistente' : 'curl …/v2/assistant');
        await d.fly(route(d, 'shell', 'api', REQ), '', 'http', { small: true, arrive: 'api' });
        await check(d);
        await d.fly(route(d, 'api', 'shell', RES), '429', 'http', { arrive: 'shell' });
        mark(d, '#ai-run-3', false);
        await d.caption({
          es: 'No llega al modelo: 429 presupuesto-agotado, con Retry-After hasta las 00:00 UTC',
          en: 'It never reaches the model: 429 budget-exhausted, Retry-After until 00:00 UTC',
        });
        await d.caption({
          es: 'Devuélvele el día a Carmen: DEL borra su cuenta',
          en: 'Give Carmen her day back: DEL deletes her count',
        });
      },
    },
  ],
};

export default lesson;
