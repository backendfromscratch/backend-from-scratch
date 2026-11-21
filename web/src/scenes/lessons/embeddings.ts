/**
 * The scenes of «Embeddings y búsqueda semántica con pgvector» / "Embeddings and semantic search
 * with pgvector" (translationKey embeddings), one per part of the text, in the order of its
 * <Scene id="…" /> cues: a search by name that finds nothing, a supermarket, a text turned into a
 * vector, cosine distance, a small model in its volume, pgvector, HNSW and what it costs, the
 * hybrid search, the nearest neighbor that is no use, the worker and the outbox, the memory, when
 * words are enough, and the lesson's commands (worlds/vectors/, worlds/assistant/,
 * worlds/analogies/). Each language's shop measured its own distances, so the map and the numbers
 * are each page's own.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { analogies } from '../worlds/analogies/analogies';
import { assistant, INITIAL, mark, type AssistantState } from '../worlds/assistant/assistant';
import {
  animate,
  ARROW_REST,
  arrowAngle,
  barLength,
  connect,
  dot,
  light,
  quote,
  route,
  vectors,
  VECTORS_INITIAL,
  type VectorsState,
} from '../worlds/vectors/vectors';
import { strings } from '../worlds/vectors/strings';

type State = AssistantState & VectorsState;
type D = Director<State>;

const REQ = -1;
const RES = 1;
const data = (d: D) => strings[d.lang];
/** A product's label on the map. */
const label = (d: D, name: string) => dot(d.lang, name).replace('dot', 'label');

/** From the map's question to each product, in order: a line, and its label. */
async function reach(
  d: D,
  pin: 'cold' | 'word',
  names: readonly string[],
  kind: 'dns' | 'tcp' | 'muted' = 'dns',
  dashed = false,
): Promise<void> {
  const at = (name: string) => data(d).products.find((product) => product.name === name)!.at;
  for (const name of names) {
    await connect(d, data(d)[pin].at, at(name), kind, dashed);
    await d.show(label(d, name));
  }
}

/** One jump of HNSW's search, from node to node (`0a`: node a on the top floor), lighting the one reached. */
async function hop(d: D, from: string, to: string): Promise<void> {
  await d.fly([d.pt(`#vx-h-${from}`), d.pt(`#vx-h-${to}`)], '', 'dns', { small: true, dur: 650 });
  d.q(`#vx-h-${to}`).classList.add('is-path');
}

/** The search's path down the three floors, and the candidates it gathers at the bottom. */
const PATH = ['0a', '0b', '0c', '1c', '1e', '2e', '2j'] as const;
const BEST = ['2e', '2j', '2l', '2k'] as const;
/** pgvector's cosine operator, as the text writes it (not drawn as a ligature). */
const OPERATOR = '<span class="vx-code">&lt;=&gt;</span>';

const lesson: LessonModule<State> = {
  initial: { ...INITIAL, ...VECTORS_INITIAL },
  worlds: [vectors, assistant, analogies],
  scenes: [
    {
      id: 'problem',
      view: 'byname',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Por el nombre, nada', en: 'By name, nothing' },
      start: () => ({}),
      end: () => ({ aiAsk: 'cold' }),
      async play(d) {
        await d.wait(300);
        d.set({ aiAsk: 'cold' });
        d.glow('chat', 'http');
        await d.fly(
          route(d, 'chat', 'catalog'),
          { es: 'buscar_productos', en: 'search_products' },
          'http',
          { arrive: 'catalog' },
        );
        const rows = data(d).catalog.names.length;
        for (let i = 1; i <= rows; i++) {
          const row = d.q(`#vx-cat-${i}`);
          row.classList.add('is-scan');
          await d.wait(170);
          row.classList.remove('is-scan');
        }
        await d.note(d.pt('catalog', 'l'), '[]', { where: 'left', look: 'tag', kind: 'muted' });
        await d.caption({
          es: 'buscar_productos busca un nombre que contenga «algo para el frío»: no hay ninguno',
          en: 'search_products looks for a name containing “something for the cold”: there are none',
        });
        for (const i of [5, 6, 7, 8]) light(d, `#vx-cat-${i}`);
        await d.caption({
          es: 'Y la tienda vende una bufanda, unos guantes, un gorro de lana y una manta',
          en: 'And the shop sells a scarf, gloves, a wool hat and a blanket',
        });
        await d.caption({
          es: 'Las palabras no coinciden; el significado, sí',
          en: 'The words don’t match; the meaning does',
        });
        await d.caption({
          es: 'Buscar por palabras encuentra palabras, y la gente pide lo que necesita',
          en: 'Searching by words finds words, and people ask for what they need',
        });
        await d.caption({
          es: 'La búsqueda semántica busca por lo que significa la pregunta, no por sus palabras',
          en: 'Semantic search goes by what the question means, not by its words',
        });
      },
    },
    {
      id: 'analogy',
      view: 'aisles',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Un supermercado', en: 'A supermarket' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'En un supermercado, las cosas están colocadas por lo que son',
          en: 'In a supermarket, things are placed by what they are',
        });
        await d.say(
          'an-shopper',
          { es: 'Algo para el frío', en: 'Something for the cold' },
          { hold: 900 },
        );
        // Up the corridor between the aisles, then into the winter aisle.
        const from = d.pt('#an-shopper', 't');
        const aisle = d.pt('#an-aisle-1', 'r');
        await d.fly([from, { x: from.x, y: aisle.y }, aisle], '', 'muted', {
          trail: { dashed: true },
        });
        light(d, '#an-aisle-1');
        await d.caption({
          es: 'Te llevan al pasillo del invierno, aunque ningún cartel diga «frío»',
          en: 'They take you to the winter aisle, even though no sign says “cold”',
        });
        await Promise.all([1, 2, 3, 4].map((i) => d.show(`#an-goods-${i}`)));
        await d.caption({
          es: 'Un embedding le da a cada producto su sitio, colocado por lo que significa',
          en: 'An embedding gives each product its place, arranged by what it means',
        });
        await d.show('#an-spot');
        await d.caption({
          es: 'Tu pregunta también recibe un sitio, y los productos más cercanos son la respuesta',
          en: 'Your question gets a place too, and the nearest products are the answer',
        });
      },
    },
    {
      id: 'embed',
      view: 'embed',
      kind: 'dns',
      chip: { es: 'embedding', en: 'embedding' },
      title: { es: 'Un texto, 384 números', en: 'A text, 384 numbers' },
      start: () => ({ vxDots: false }),
      end: () => ({ vxDots: true }),
      async play(d) {
        await d.wait(300);
        await d.show('#vx-in');
        await d.caption({
          es: 'Al modelo le entran el nombre y la descripción de la bufanda…',
          en: 'Into the model go the scarf’s name and description…',
        });
        await d.show('#vx-out');
        await d.caption({
          es: '…y sale un vector: una lista de 384 números',
          en: '…and out comes a vector: a list of 384 numbers',
        });
        const scarf = data(d).products[4]!.name;
        await d.fly([d.pt('embedder', 'r'), d.pt(dot(d.lang, scarf))], '', 'dns', { small: true });
        await d.show(dot(d.lang, scarf));
        await d.show(label(d, scarf));
        await d.caption({
          es: 'Un vector: un punto en un espacio de 384 dimensiones',
          en: 'A vector: a point in a space of 384 dimensions',
        });
        const groups = ['warm', 'shop', 'coffee', 'summer', 'gifts'] as const;
        for (const group of groups) {
          await Promise.all(
            data(d).products.map((product, i) =>
              product.group === group && product.name !== scarf
                ? d.show(`#vx-dot-${i + 1}`)
                : Promise.resolve(),
            ),
          );
        }
        d.set({ vxDots: true });
        await d.caption({
          es: 'El modelo está entrenado para que dos textos que significan lo mismo den puntos cercanos',
          en: 'The model is trained so that two texts that mean the same thing give nearby points',
        });
        await d.caption({
          es: 'El catálogo pasa de 4 a 20 productos: abrigo, café, verano y regalos',
          en: 'The catalog goes from 4 to 20 products: warm clothes, coffee, summer and gifts',
        });
        await d.caption({
          es: 'Un supermercado tiene dos dimensiones; un embedding, 384',
          en: 'A supermarket has two dimensions; an embedding, 384',
        });
      },
    },
    {
      id: 'cosine',
      view: 'cosine',
      kind: 'dns',
      chip: { es: 'coseno', en: 'cosine' },
      title: { es: 'Cerca es parecido', en: 'Close means similar' },
      start: () => ({}),
      end: () => ({ vxPin: 'cold' }),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'La distancia del coseno mide el ángulo entre las flechas, no lo largas que son',
          en: 'Cosine distance measures the angle between the arrows, not how long they are',
        });
        const turns: readonly (readonly [number, string, Text])[] = [
          [
            0,
            '0',
            {
              es: '0: apuntan igual; significan lo mismo',
              en: '0: same direction; they mean the same',
            },
          ],
          [
            90,
            '1',
            {
              es: '1: un ángulo recto; no tienen nada que ver',
              en: '1: a right angle; nothing in common',
            },
          ],
          [
            180,
            '2',
            {
              es: '2: sentidos contrarios; casi nunca pasa',
              en: '2: opposite ways; it almost never happens',
            },
          ],
        ];
        let from = ARROW_REST;
        for (const [deg, distance, caption] of turns) {
          await animate(d, '#vx-arrow', arrowAngle(from), arrowAngle(deg));
          from = deg;
          await d.setText('#vx-cos', distance);
          await d.caption(caption);
        }
        d.set({ vxPin: 'cold' });
        d.glow('#vx-pin-cold', 'http');
        await reach(d, 'cold', data(d).cold.nearest);
        await d.caption({
          es: 'Lo más cercano a «algo para el frío»: guantes, manta, bufanda, gorro de lana y abanico',
          en: 'Nearest to “something for the cold”: hoodie, blanket, scarf, wool hat and hand fan',
        });
        await d.caption({
          es: 'A 0,371, 0,394, 0,410, 0,444 y 0,453: ninguno lleva «frío» en el nombre',
          en: 'At 0.477, 0.492, 0.514, 0.529 and 0.547: none has “cold” in its name',
        });
      },
    },
    {
      id: 'local',
      view: 'lazyload',
      kind: 'dns',
      chip: { es: 'modelo', en: 'model' },
      title: { es: 'Un modelo pequeño', en: 'A small model' },
      start: () => ({ vxModel: false }),
      end: () => ({ vxModel: true }),
      async play(d) {
        await d.wait(300);
        const search = { es: 'primera búsqueda', en: 'first search' };
        await d.fly([d.pt('api', 'l', -70, -20), d.pt('api', 'l')], search, 'dns', {
          arrive: 'api',
        });
        await d.setText('#ai-api-status', { es: 'carga el modelo', en: 'loads the model' });
        await d.fly(route(d, 'api', 'modelvol', REQ), { es: 'descarga', en: 'download' }, 'dns', {
          small: true,
          arrive: 'modelvol',
        });
        await animate(d, '#vx-fill', 'scaleX(0)', 'scaleX(1)', 1200);
        d.set({ vxModel: true });
        await d.caption({
          es: 'La primera vez, el modelo se descarga en el volumen modelos: 135 MB, unos 30 segundos',
          en: 'The first time, the model downloads into the models volume: 135 MB, about 30 seconds',
        });
        await d.fly(route(d, 'modelvol', 'api', RES), '', 'dns', { small: true, arrive: 'api' });
        await d.setText('#ai-api-status', { es: 'modelo en memoria', en: 'model in memory' });
        await d.caption({
          es: 'Las siguientes, lo carga de ahí en menos de un segundo, sin internet',
          en: 'After that, it loads it from there in under a second, with no internet',
        });
        await d.caption({
          es: 'Y convierte cada texto en unos 3 ms',
          en: 'And it turns each text in about 3 ms',
        });
        await d.fly(route(d, 'modelvol', 'worker'), '', 'dns', { small: true, arrive: 'worker' });
        await d.setText('#vx-worker-status', { es: 'modelo en memoria', en: 'model in memory' });
        await d.caption({
          es: 'El volumen lo comparten la API y el trabajador',
          en: 'The API and the worker share the volume',
        });
        await d.caption({
          es: 'Gratis y en tu ordenador: la API de Claude no calcula embeddings',
          en: 'Free and on your computer: the Claude API doesn’t compute embeddings',
        });
      },
    },
    {
      id: 'pgvector',
      view: 'pgv',
      kind: 'dns',
      chip: { es: 'pgvector', en: 'pgvector' },
      title: { es: 'Vectores en PostgreSQL', en: 'Vectors in PostgreSQL' },
      start: () => ({}),
      end: () => ({ vxRanked: true }),
      async play(d) {
        await d.wait(300);
        light(d, '.vx-table__head');
        await d.caption({
          es: 'pgvector le añade a PostgreSQL un tipo, vector, sus operadores de distancia y sus índices',
          en: 'pgvector adds a type to PostgreSQL, vector, with its distance operators and indexes',
        });
        await d.caption({
          es: 'embedding es un vector(384): exactamente 384 números; NULL es «aún sin calcular»',
          en: 'embedding is a vector(384): exactly 384 numbers; NULL means “not computed yet”',
        });
        d.q('.vx-table__head').classList.remove('is-lit');
        const query = data(d).cold.query;
        await d.note(d.pt('vtable', 't'), `${OPERATOR} ${quote(d.lang, query)}`, {
          where: 'above',
          look: 'tag',
          kind: 'dns',
        });
        const rows = data(d).table.rows;
        for (const [i, [, distance]] of rows.entries()) {
          const row = `#vx-row-${i + 1}`;
          d.q(row).classList.add('is-lit');
          await d.setText(`#vx-dist-${i + 1}`, distance);
          await d.wait(380);
          d.q(row).classList.remove('is-lit');
        }
        await d.caption({
          es: `El operador ${OPERATOR} es la distancia del coseno: sin un índice, se calcula con las 20 filas`,
          en: `The ${OPERATOR} operator is cosine distance: without an index, it’s computed for all 20 rows`,
        });
        d.set({ vxRanked: true });
        d.glow('vtable', 'dns');
        await d.caption({
          es: 'ORDER BY la distancia y LIMIT 5: los cinco vecinos más cercanos',
          en: 'ORDER BY the distance and LIMIT 5: the five nearest neighbors',
        });
      },
    },
    {
      id: 'hnsw',
      view: 'graph',
      kind: 'dns',
      chip: { es: 'HNSW', en: 'HNSW' },
      title: { es: 'De vecino en vecino', en: 'Neighbor to neighbor' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Con un millón de productos, cuesta: y 384 números juntos no tienen un orden',
          en: 'With a million products, it costs: and 384 numbers together have no order',
        });
        d.q('#vx-h-0a').classList.add('is-path');
        await hop(d, '0a', '0b');
        await hop(d, '0b', '0c');
        await d.caption({
          es: 'Entra por arriba y salta al vecino más cercano a la pregunta, hasta que ninguno lo está más',
          en: 'It enters at the top and jumps to the neighbor closest to the question, until none is closer',
        });
        await hop(d, '0c', '1c');
        await hop(d, '1c', '1e');
        await d.caption({ es: 'Baja un piso y repite', en: 'It goes down a floor and repeats' });
        await hop(d, '1e', '2e');
        await hop(d, '2e', '2j');
        for (const best of BEST) d.q(`#vx-h-${best}`).classList.add('is-best');
        d.glow('hnsw', 'dns');
        await d.caption({
          es: 'Abajo, junta los mejores candidatos',
          en: 'At the bottom, it gathers the best candidates',
        });
        await d.caption({
          es: 'Como un viaje en coche: autopista, carretera, calle',
          en: 'Like a car trip: highway, road, street',
        });
      },
    },
    {
      id: 'recall',
      view: 'graph',
      kind: 'dns',
      chip: { es: 'ef_search', en: 'ef_search' },
      title: { es: 'Aproximado, y medido', en: 'Approximate, and measured' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        for (const step of PATH) d.q(`#vx-h-${step}`).classList.add('is-path');
        for (const best of BEST) d.q(`#vx-h-${best}`).classList.add('is-best');
        d.q('#vx-h-2n').classList.add('is-missed');
        await d.note(
          d.pt('#vx-h-2n', 'b'),
          { es: 'se lo salta', en: 'missed' },
          { where: 'below', look: 'tag', kind: 'http', ttl: 2600 },
        );
        await d.caption({
          es: 'HNSW es aproximado: si el camino de saltos no pasa cerca de un vecino, se lo salta',
          en: 'HNSW is approximate: if the path of jumps doesn’t pass near a neighbor, it misses it',
        });
        await d.caption({
          es: 'Cuántos candidatos junta lo decide hnsw.ef_search: 40, si no se dice',
          en: 'hnsw.ef_search decides how many candidates it gathers: 40, unless told otherwise',
        });
        await hop(d, '2e', '2k');
        await hop(d, '2k', '2c');
        await hop(d, '2c', '2n');
        const found = d.q('#vx-h-2n');
        found.classList.remove('is-missed');
        found.classList.add('is-best');
        await d.caption({
          es: 'Con ef_search 100 mira más, y lo encuentra',
          en: 'With ef_search 100 it looks further, and finds it',
        });
        await d.caption({
          es: 'Con 50.000 vectores: 0,8 ms por búsqueda con el índice, y 18,5 ms leyendo la tabla entera',
          en: 'With 50,000 vectors: 0.7 ms per search with the index, and 18.7 ms reading the whole table',
        });
        await d.caption({
          es: 'De los 10 más cercanos de verdad, encuentra 8,5 de media con 40, y 9,9 con 100',
          en: 'Of the true 10 nearest, it finds 9.3 on average with 40, and 9.8 with 100',
        });
      },
    },
    {
      id: 'hybrid',
      view: 'map',
      kind: 'dns',
      chip: { es: 'híbrida', en: 'hybrid' },
      title: { es: 'Nombre y significado', en: 'Name and meaning' },
      start: () => ({}),
      end: () => ({ vxPin: 'word' }),
      async play(d) {
        await d.wait(300);
        const word = data(d).word;
        d.set({ vxPin: 'word' });
        d.glow('#vx-pin-word', 'http');
        await reach(d, 'word', word.nearest);
        await d.caption({
          es: 'Para «taza», la Taza queda a 0,793, más lejos que la Camiseta, a 0,711…',
          en: 'Here, “mug” finds the Mug first even by meaning, at 0.226…',
        });
        if (!word.nearest.includes(word.match)) await reach(d, 'word', [word.match], 'muted', true);
        await d.caption({
          es: '…y ni sale entre los cinco más cercanos',
          en: '…but that’s luck: in the Spanish shop, “taza” didn’t even make the five nearest',
        });
        d.q('#vx-lines').replaceChildren();
        await reach(d, 'word', [word.match], 'tcp');
        light(d, label(d, word.match), 'tcp');
        // In the map's header, beside the question: inside the map it would cover a label.
        await d.note(
          d.pt('#vx-query', 'r'),
          { es: `por el nombre: ${word.match}`, en: `by name: ${word.match}` },
          {
            where: 'right',
            look: 'tag',
            kind: 'tcp',
          },
        );
        await d.caption({
          es: 'Por eso la tienda junta las dos: primero, los que tienen la consulta en el nombre',
          en: 'So the shop combines both: first, the products with the query in their name',
        });
        await reach(d, 'word', word.after);
        await d.caption({
          es: 'Después, los cinco más cercanos, sin repetir: una búsqueda híbrida',
          en: 'Then, the five nearest, without repeats: a hybrid search',
        });
      },
    },
    {
      id: 'nearest',
      view: 'map',
      kind: 'dns',
      chip: { es: 'abanico', en: 'hand fan' },
      title: { es: 'Siempre hay un vecino', en: 'Always a neighbor' },
      start: () => ({ vxPin: 'cold' }),
      end: () => ({ vxPin: 'cold' }),
      async play(d) {
        await d.wait(300);
        const cold = data(d).cold;
        await reach(d, 'cold', cold.nearest);
        const fan = cold.nearest[4]!;
        light(d, label(d, fan), 'dns');
        light(d, dot(d.lang, fan), 'dns');
        await d.note(
          d.pt(dot(d.lang, fan), 'b'),
          { es: '«para darte aire en los días de calor»', en: '“to cool down on hot days”' },
          { where: 'below', look: 'tag', kind: 'dns', ttl: 3000 },
        );
        await d.caption({
          es: 'En «algo para el frío», el quinto es el abanico, por delante de la sudadera',
          en: 'For “something for the cold,” the fifth is the hand fan, ahead of the gloves',
        });
        await reach(d, 'cold', [cold.next], 'muted', true);
        await d.caption({
          es: 'El modelo ha entendido de qué trata la pregunta, la temperatura, pero no hacia qué lado',
          en: 'The model understood what the question is about, the temperature, but not which way',
        });
        await d.caption({
          es: 'Y siempre devuelve cinco, aunque ninguno sirva: los vectores no saben decir «no hay nada»',
          en: 'And it always returns five, even if none fits: vectors can’t say “there’s nothing”',
        });
        await d.caption({
          es: 'Por eso cada producto viaja con su distancia y su descripción',
          en: 'That’s why each product travels with its distance and its description',
        });
      },
    },
    {
      id: 'worker',
      view: 'outbox',
      kind: 'tcp',
      chip: { es: 'trabajador', en: 'worker' },
      title: { es: 'Los vectores, aparte', en: 'Vectors, on the side' },
      start: () => ({}),
      end: () => ({ vxSocks: 'vector' }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, 'api', 'pg'), 'COMMIT', 'tcp', { arrive: 'pg' });
        d.set({ vxSocks: 'null' });
        await d.show('#vx-pg-event');
        await d.caption({
          es: 'Un producto nuevo necesita un vector: la tienda lo apunta en el outbox, en la misma transacción',
          en: 'A new product needs a vector: the shop notes it in the outbox, in the same transaction',
        });
        await d.caption({
          es: 'Mientras tanto, su embedding es NULL, y el producto sale por el nombre',
          en: 'Meanwhile, its embedding is NULL, and the product comes up by name',
        });
        await d.fly(
          route(d, 'queue', 'pg', REQ),
          { es: '¿eventos sin enviar?', en: 'unsent events?' },
          'muted',
          { small: true, arrive: 'pg' },
        );
        await d.fly(route(d, 'pg', 'queue', RES), data(d).pg.event, 'tcp', {
          small: true,
          arrive: 'queue',
        });
        await d.setText('#vx-pg-sent', '✓');
        await d.show('#vx-job');
        await d.caption({
          es: 'El repartidor mira cada segundo, y la cola le pasa el trabajo al trabajador',
          en: 'The relayer checks every second, and the queue hands the job to the worker',
        });
        await d.fly(route(d, 'queue', 'worker'), data(d).queue.job, 'tcp', { arrive: 'worker' });
        await d.setText('#vx-worker-status', {
          es: 'calcula su vector',
          en: 'computes its vector',
        });
        await d.fly(route(d, 'worker', 'pg'), 'UPDATE', 'tcp', { arrive: 'pg' });
        d.set({ vxSocks: 'vector' });
        await d.caption({
          es: 'Lo guarda solo si el texto no ha cambiado mientras lo calculaba',
          en: 'It saves it only if the text hasn’t changed while it was computing',
        });
        await d.caption({
          es: 'El modelo ocupa memoria y tarda: quien cambia un producto no tiene por qué esperarlo',
          en: 'The model takes memory and time: whoever changes a product shouldn’t have to wait',
        });
      },
    },
    {
      id: 'memory',
      view: 'ram',
      kind: 'muted',
      chip: { es: 'memoria', en: 'memory' },
      title: { es: 'Viene apagada', en: 'Off by default' },
      start: () => ({ vxMemory: 0 }),
      end: () => ({ vxMemory: 2 }),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Medido con docker stats: la API y el trabajador, sin el modelo',
          en: 'Measured with docker stats: the API and the worker, without the model',
        });
        const memory = data(d).memory;
        await Promise.all(
          memory.rows.map(async ([, before, after], i) => {
            await animate(d, `#vx-bar-${i + 1}`, barLength(before), barLength(after), 1100);
            await d.setText(`#vx-mib-${i + 1}`, `${after} ${memory.unit}`);
          }),
        );
        d.set({ vxMemory: 1 });
        await d.caption({
          es: 'Con el modelo cargado: entre 300 y 400 MB más por proceso',
          en: 'With the model loaded: about 380 MiB more per process',
        });
        d.set({ vxMemory: 2 });
        d.glow('memory', 'http');
        await d.caption({
          es: 'Con los dos cargados y Docker en 2 GB, al arrancar otro proceso el sistema mató la API',
          en: 'With both loaded and Docker at 2 GB, one more process started and the system killed the API',
        });
        await d.caption({
          es: 'Por eso viene apagada: BUSQUEDA_SEMANTICA=no',
          en: 'That’s why it ships off: SEMANTIC_SEARCH=no',
        });
      },
    },
    {
      id: 'words',
      view: 'compare',
      kind: 'muted',
      chip: { es: 'palabras', en: 'words' },
      title: { es: '¿Bastan las palabras?', en: 'Are words enough?' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        const column = (c: number) => {
          d.qa('.vx-words__cell.is-lit').forEach((cell) => cell.classList.remove('is-lit'));
          d.qa(`.vx-words__cell[data-col='${c}']`).forEach((cell) => cell.classList.add('is-lit'));
          d.glow(`#vx-col-${c}`, 'dns');
        };
        column(1);
        await d.caption({
          es: 'ILIKE, el de la lección 3: el trozo exacto, en el nombre; falla con «tazas»',
          en: 'ILIKE, from lesson 3: the exact piece, in the name; it misses “mugs”',
        });
        column(2);
        await d.caption({
          es: 'El texto completo de PostgreSQL: las palabras con sus variantes, con un índice GIN',
          en: 'PostgreSQL’s full-text search: the words with their variants, with a GIN index',
        });
        column(3);
        await d.caption({
          es: 'Los embeddings: lo que significa, en otras palabras; con un modelo y su memoria',
          en: 'Embeddings: what it means, in other words; with a model and its memory',
        });
        await d.caption({
          es: 'Si la gente busca por el nombre de lo que quiere, bastan las palabras, y es más barato',
          en: 'If people search by the name of what they want, words are enough, and cheaper',
        });
        await d.caption({
          es: 'Los embeddings compensan cuando la gente describe lo que necesita',
          en: 'Embeddings pay off when people describe what they need',
        });
      },
    },
    {
      id: 'try',
      view: 'tryvec',
      kind: 'dns',
      chip: { es: 'por MCP', en: 'via MCP' },
      title: { es: 'Por el significado', en: 'By meaning' },
      start: () => ({ vxVectors: false }),
      end: () => ({ vxVectors: true, vxRanked: true, vxSocks: 'vector' }),
      async play(d) {
        await d.wait(300);
        const search = d.lang === 'es' ? 'buscar "…para el frío"' : 'search "…for the cold"';
        const ask = () =>
          d.fly(route(d, 'shell', 'vtable', REQ), 'tools/call', 'http', { arrive: 'vtable' });
        await d.type('#ai-cmd-1', search);
        await ask();
        await d.fly(route(d, 'vtable', 'shell', RES), '[]', 'muted', { arrive: 'shell' });
        mark(d, '#ai-run-1', false);
        await d.caption({
          es: 'Con la búsqueda semántica apagada, por el nombre: []',
          en: 'With semantic search off, by name: []',
        });
        await d.type('#ai-cmd-2', '…/embeddings.ts');
        await d.fly(route(d, 'shell', 'vtable', REQ), { es: 'vectores', en: 'vectors' }, 'dns', {
          arrive: 'vtable',
        });
        d.set({ vxVectors: true });
        mark(d, '#ai-run-2', true);
        await d.caption({
          es: 'Con BUSQUEDA_SEMANTICA=si, el trabajador calcula los vectores del catálogo',
          en: 'With SEMANTIC_SEARCH=yes, the worker computes the catalog’s vectors',
        });
        await d.type('#ai-cmd-3', search);
        await ask();
        d.set({ vxRanked: true });
        d.glow('vtable', 'dns');
        await d.fly(route(d, 'vtable', 'shell', RES), '5', 'dns', { arrive: 'shell' });
        mark(d, '#ai-run-3', true);
        await d.caption({
          es: 'Ahora sí: la ropa de abrigo, y el abanico, quinto',
          en: 'Now yes: the warm clothes, and the hand fan, fifth',
        });
        d.set({ vxSocks: 'null' });
        await d.show('#vx-added');
        await d.wait(700);
        d.set({ vxSocks: 'vector' });
        d.glow('#vx-added', 'tcp');
        await d.caption({
          es: 'Ana añade unos calcetines de lana, y el trabajador calcula su vector en segundos',
          en: 'Ana adds some wool socks, and the worker computes their vector in seconds',
        });
      },
    },
  ],
};

export default lesson;
