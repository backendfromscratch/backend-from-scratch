/**
 * The scenes of «Qué es MCP y cómo exponer tu backend a agentes» / "What MCP is and how to expose
 * your backend to agents" (translationKey mcp), one per part of the text, in the order of its
 * <Scene id="…" /> cues: tools no agent can reach, chargers before and after USB-C, twelve
 * connectors against seven pieces, the host between the model and the server, a JSON-RPC message,
 * initialize, one POST per message, how a tool is registered, two kinds of error, an API key and not
 * a session, each role's tools, why MCP is not authorization, and the lesson's commands
 * (worlds/mcp/, worlds/assistant/, worlds/analogies/). Between two actors, requests take one lane
 * and answers the other; the handshake's five messages, one lane each.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { analogies, plugRoute } from '../worlds/analogies/analogies';
import { assistant, INITIAL, lose, mark, type AssistantState } from '../worlds/assistant/assistant';
import {
  KEY_ROLES,
  light,
  mcp,
  MCP_INITIAL,
  route,
  toolsFor,
  wire,
  type McpState,
} from '../worlds/mcp/mcp';
import { strings } from '../worlds/mcp/strings';

type State = AssistantState & McpState;
type D = Director<State>;

const REQ = -1;
const RES = 1;
const tools = (d: D) => strings[d.lang].tools;

/** The message card's three rows, each a name and a value (empty strings leave a row empty). */
async function card(d: D, rows: readonly (readonly [string, Text | string])[], lit: number[] = []) {
  for (const i of [1, 2, 3]) {
    const [name, value] = rows[i - 1] ?? ['', ''];
    await d.setText(`#mc-rpc-k-${i}`, name, false);
    await d.setText(`#mc-rpc-v-${i}`, value, false);
    d.q(`#mc-rpc-${i}`).classList.toggle('is-lit', lit.includes(i));
  }
  if (lit.length) d.glow('rpccard', 'http');
}

/** One POST to one of the API's copies: it builds its server and transport, answers, and drops them. */
async function post(d: D, copy: 'a' | 'b', label: string): Promise<void> {
  const target = `#mc-copy-${copy}`;
  await d.fly(route(d, 'mcpclient', target, REQ), label, 'http', { arrive: target });
  await d.show(`#mc-built-${copy}`);
  await d.wait(450);
  await d.fly(route(d, target, 'mcpclient', RES), '200', 'http', {
    small: true,
    arrive: 'mcpclient',
  });
  d.q(`#mc-built-${copy}`).classList.remove('is-on');
}

/** A request one of the API's copies turns down before MCP, with its status code. */
async function refuse(d: D, copy: 'a' | 'b', label: Text | string, status: string) {
  const target = `#mc-copy-${copy}`;
  await d.fly(route(d, 'mcpclient', target, REQ), label, 'muted', { arrive: target });
  await d.fly(route(d, target, 'mcpclient', RES), status, 'http', { small: true });
}

/** A row of the keys' table calls the shop, and the shop answers it. */
async function call(d: D, row: number, label: Text | string, kind: 'tls' | 'muted' = 'tls') {
  light(d, `#mc-key-${row}`, 'tls');
  await d.fly(route(d, `#mc-key-${row}`, 'mcpshop', REQ), label, kind, {
    icon: kind === 'tls' ? 'key' : undefined,
    arrive: 'mcpshop',
  });
}

const answer = (d: D, row: number, label: Text | string) =>
  d.fly(route(d, 'mcpshop', `#mc-key-${row}`, RES), label, 'http', { small: true });

/** A command in your terminal: typed, sent to the shop with a key, and its answer back. */
async function run(d: D, line: number, command: string, label: string): Promise<void> {
  await d.type(`#ai-cmd-${line}`, command);
  await d.fly(route(d, 'shell', 'mcpshop', REQ), label, 'tls', { icon: 'key', arrive: 'mcpshop' });
}

/** The friend's charger, as it flies: its plug. */
const charger: Text = { es: 'su cargador', en: 'their charger' };

const lesson: LessonModule<State> = {
  initial: { ...INITIAL, ...MCP_INITIAL },
  worlds: [mcp, assistant, analogies],
  scenes: [
    {
      id: 'problem',
      view: 'apart',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Herramientas encerradas', en: 'Tools locked in' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        light(d, '#mc-agent-2', 'muted');
        await d.caption({
          es: 'Reparto Rápido cambia su programa por un agente: un modelo decide qué herramientas usar',
          en: 'Fast Delivery swaps its program for an agent: a model decides which tools to use',
        });
        await Promise.all(
          [1, 2, 3].map(async (i) => {
            await d.wait((i - 1) * 380);
            await lose(d, route(d, `#mc-agent-${i}`, 'tools'), '');
          }),
        );
        await d.note(
          d.pt('tools', 'b'),
          { es: 'dentro de tu bucle', en: 'inside your loop' },
          { where: 'below', look: 'tag', kind: 'muted' },
        );
        await d.caption({
          es: 'Las herramientas de tu asistente viven dentro de tu bucle: esos agentes no pueden usarlas',
          en: 'Your assistant’s tools live inside your loop: those agents can’t use them',
        });
        for (const i of [1, 2, 3]) {
          await d.fly(route(d, `#mc-agent-${i}`, 'api'), '', 'muted', {
            small: true,
            trail: { dashed: true, badge: String(i) },
          });
        }
        await d.caption({
          es: 'Tendrías que escribir un conector para cada agente…',
          en: 'You’d have to write a connector for each agent…',
        });
        await d.caption({
          es: '…y cada agente, uno para cada servicio',
          en: '…and each agent, one for each service',
        });
        await d.caption({
          es: 'MCP es el acuerdo que lo evita: un agente que habla MCP usa cualquier servidor que lo hable',
          en: 'MCP is the agreement that avoids it: an agent that speaks MCP uses any server that speaks it',
        });
      },
    },
    {
      id: 'analogy',
      view: 'usbc',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Un cargador para todo', en: 'One charger for all' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Hace unos años, cada móvil tenía su cargador…',
          en: 'A few years ago, every phone had its own charger…',
        });
        await d.fly(plugRoute(d, 2, 1), charger, 'muted', { small: true });
        await d.note(d.pt('#an-port-1'), '✗', {
          where: 'center',
          look: 'tag',
          kind: 'http',
          ttl: 1400,
        });
        await d.caption({
          es: '…y el de un amigo no te servía',
          en: '…and a friend’s was no use to you',
        });
        d.q('#an-chargers').classList.add('is-usbc');
        d.glow('chargers', 'tcp');
        await d.caption({
          es: 'Con USB-C, cualquier cargador carga cualquier móvil y muchos portátiles',
          en: 'With USB-C, any charger charges any phone and many laptops',
        });
        await d.fly(plugRoute(d, 2, 1), charger, 'tcp', { small: true });
        await d.note(d.pt('#an-port-1', 't'), '✓', { where: 'above', look: 'tag', kind: 'tcp' });
        await d.fly(plugRoute(d, 1, 3), 'USB-C', 'tcp', { small: true });
        await d.note(d.pt('#an-port-3', 't'), '✓', { where: 'above', look: 'tag', kind: 'tcp' });
        await d.caption({
          es: 'Los fabricantes no se ponen de acuerdo pareja a pareja: todos siguen la misma norma',
          en: 'Manufacturers don’t agree pair by pair: they all follow the same standard',
        });
        await d.caption({
          es: 'MCP es esa norma para los agentes',
          en: 'MCP is that standard for agents',
        });
      },
    },
    {
      id: 'mesh',
      view: 'connectors',
      kind: 'http',
      chip: { es: '12 → 7', en: '12 → 7' },
      title: { es: 'De conectores a piezas', en: 'From connectors to pieces' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        const pairs = [1, 2, 3].flatMap((a) => [1, 2, 3, 4].map((s) => [a, s] as const));
        await Promise.all(
          pairs.map(async ([a, s], k) => {
            await d.wait(k * 90);
            await wire(
              d,
              [d.pt(`#mc-agent-${a}`, 'r'), d.pt(`#mc-service-${s}`, 'l')],
              'http',
              600,
            );
          }),
        );
        const twelve = await d.note(d.pt('mcpbus', 't'), '3 × 4 = 12', {
          where: 'above',
          look: 'tag',
          kind: 'http',
        });
        await d.caption({
          es: 'Sin un protocolo común, un conector por cada pareja de agente y servicio: 3 × 4 = 12',
          en: 'Without a common protocol, a connector for every pair of agent and service: 3 × 4 = 12',
        });
        d.stage.trails.replaceChildren();
        await d.vanish(twelve);
        await d.show('#mc-bus');
        const bus = d.box('mcpbus');
        const toBus = (row: string) => {
          const p = d.pt(row, 'r');
          return [p, { x: bus.x, y: p.y }];
        };
        const fromBus = (row: string) => {
          const p = d.pt(row, 'l');
          return [{ x: bus.x + bus.w, y: p.y }, p];
        };
        await Promise.all([
          ...[1, 2, 3].map(async (i) => {
            await d.show(`#mc-agent-chip-${i}`);
            await wire(d, toBus(`#mc-agent-${i}`), 'http', 500);
          }),
          ...[1, 2, 3, 4].map(async (i) => {
            await d.show(`#mc-service-chip-${i}`);
            await wire(d, fromBus(`#mc-service-${i}`), 'http', 500);
          }),
        ]);
        await d.note(d.pt('mcpbus', 't'), '3 + 4 = 7', {
          where: 'above',
          look: 'tag',
          kind: 'tcp',
        });
        await d.caption({
          es: 'Con MCP, un cliente por agente y un servidor por servicio: 3 + 4 = 7 piezas',
          en: 'With MCP, a client per agent and a server per service: 3 + 4 = 7 pieces',
        });
        await d.show('#mc-agent-4');
        await wire(d, toBus('#mc-agent-4'), 'http', 500);
        await d.caption({
          es: 'Llega un agente más: sin MCP, 4 conectores más; con MCP, 1 cliente más',
          en: 'One more agent arrives: without MCP, 4 more connectors; with MCP, 1 more client',
        });
        await d.caption({
          es: 'El agente del comparador no sabe nada de tu tienda: le basta hablar MCP',
          en: 'The comparison site’s agent knows nothing about your shop: speaking MCP is enough',
        });
      },
    },
    {
      id: 'who',
      view: 'hostview',
      kind: 'http',
      chip: { es: 'host', en: 'host' },
      title: { es: 'Quién es quién', en: 'Who is who' },
      start: () => ({}),
      end: () => ({ mcAsk: true, mcAnswer: true }),
      async play(d) {
        await d.wait(300);
        await d.fly(route(d, '#mc-host-client', 'mcpshop', REQ), 'tools/list', 'http', {
          arrive: 'mcpshop',
        });
        await d.fly(
          route(d, 'mcpshop', '#mc-host-client', RES),
          { es: '4 herramientas', en: '4 tools' },
          'http',
          { arrive: '#mc-host-client' },
        );
        await d.caption({
          es: 'El host pide a la tienda su lista: cuatro herramientas, con su descripción y su esquema',
          en: 'The host asks the shop for its list: four tools, with their description and schema',
        });
        await d.show('#mc-ask');
        d.set({ mcAsk: true });
        await d.caption({
          es: 'La persona pregunta en el host, con el modelo dentro',
          en: 'The person asks in the host, with the model inside',
        });
        await d.fly(
          route(d, 'host', 'model', REQ),
          { es: 'pregunta + herramientas', en: 'question + tools' },
          'http',
          { arrive: 'model' },
        );
        await d.setText('#ai-model-status', { es: 'elige una herramienta', en: 'picks a tool' });
        await d.fly(route(d, 'model', 'host', RES), `tool_use: ${tools(d)[2]}`, 'tcp', {
          arrive: 'host',
        });
        await d.caption({
          es: 'El modelo elige una herramienta y la pide con un tool_use, como en la lección 3',
          en: 'The model picks a tool and asks for it with a tool_use, as in lesson 3',
        });
        await d.fly(route(d, '#mc-host-client', 'mcpshop', REQ), 'tools/call', 'http', {
          arrive: 'mcpshop',
        });
        light(d, '#mc-tool-3', 'tcp');
        await d.wiggle('hammer', d.pt('#mc-tool-3', 'r', -8), 700);
        await d.fly(
          route(d, 'mcpshop', '#mc-host-client', RES),
          { es: 'pedidos, en JSON', en: 'orders, in JSON' },
          'http',
          { arrive: '#mc-host-client' },
        );
        await d.caption({
          es: 'La llama el cliente MCP del host: el modelo nunca habla con el servidor',
          en: 'The host’s MCP client calls it: the model never talks to the server',
        });
        await d.fly(route(d, 'host', 'model', REQ), 'tool_result', 'tcp', { arrive: 'model' });
        await d.fly(
          route(d, 'model', 'host', RES),
          { es: 'la respuesta', en: 'the answer' },
          'http',
          {
            arrive: 'host',
          },
        );
        await d.show('#mc-answer');
        d.set({ mcAnswer: true });
        await d.caption({
          es: 'En el centro, el tool_use y el tool_result; MCP es lo de los lados',
          en: 'In the middle, the tool_use and the tool_result; MCP is the two sides',
        });
        await d.caption({
          es: 'Un host conectado a tres servidores tiene tres clientes',
          en: 'A host connected to three servers has three clients',
        });
      },
    },
    {
      id: 'jsonrpc',
      view: 'wire',
      kind: 'http',
      chip: { es: 'JSON-RPC', en: 'JSON-RPC' },
      title: { es: 'Un mensaje', en: 'A message' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await card(
          d,
          [
            ['"id"', '3'],
            ['"method"', '"tools/call"'],
            [
              '"params"',
              { es: 'buscar_productos, consulta: "gorra"', en: 'search_products, query: "cap"' },
            ],
          ],
          [2, 3],
        );
        await d.caption({
          es: 'Cada mensaje de MCP es JSON-RPC: method es la función, y params, sus argumentos',
          en: 'Every MCP message is JSON-RPC: method is the function, and params, its arguments',
        });
        d.q('#mc-rpc-1').classList.add('is-lit');
        await d.fly(route(d, 'mcpclient', 'mcpshop', REQ), 'id 3', 'http', { arrive: 'mcpshop' });
        await d.caption({
          es: 'id es un número que elige el cliente',
          en: 'id is a number the client chooses',
        });
        light(d, '#mc-tool-1', 'tcp');
        await d.wiggle('hammer', d.pt('#mc-tool-1', 'r', -8), 700);
        await d.fly(route(d, 'mcpshop', 'mcpclient', RES), 'id 3', 'http', { arrive: 'mcpclient' });
        await card(
          d,
          [
            ['"id"', '3'],
            ['"result"', { es: '[{"id":4,"nombre":"Gorra",…}]', en: '[{"id":4,"name":"Cap",…}]' }],
          ],
          [1],
        );
        await d.caption({
          es: 'La respuesta lleva el mismo id: así sabe de qué pregunta es',
          en: 'The response carries the same id: that’s how it knows which question it answers',
        });
        await d.caption({
          es: 'Trae result o, si el mensaje no vale, error con un código y una frase',
          en: 'It brings result or, if the message isn’t valid, error with a code and a sentence',
        });
        await card(d, [['"method"', '"notifications/initialized"']], [1]);
        await d.fly(route(d, 'mcpclient', 'mcpshop', REQ), { es: 'sin id', en: 'no id' }, 'muted', {
          arrive: 'mcpshop',
        });
        await d.caption({
          es: 'Un mensaje sin id es una notificación: avisa de algo y no espera respuesta',
          en: 'A message without an id is a notification: it reports something and expects no response',
        });
      },
    },
    {
      id: 'init',
      view: 'wire',
      kind: 'http',
      chip: { es: 'initialize', en: 'initialize' },
      title: { es: 'El saludo', en: 'The greeting' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await card(
          d,
          [
            ['protocolVersion', '"2025-11-25"'],
            ['clientInfo', '{"name":"curl",…}'],
            ['capabilities', '{}'],
          ],
          [1, 2, 3],
        );
        await d.fly(route(d, 'mcpclient', 'mcpshop', -2), 'initialize', 'http', {
          arrive: 'mcpshop',
          trail: { badge: '1' },
        });
        await d.caption({
          es: 'Antes de pedir nada, el cliente se presenta: su versión, quién es y qué sabe hacer',
          en: 'Before asking for anything, the client introduces itself: its version, who it is, what it can do',
        });
        await d.fly(route(d, 'mcpshop', 'mcpclient', -1), 'result', 'http', {
          arrive: 'mcpclient',
          trail: { badge: '2' },
        });
        await card(
          d,
          [
            ['protocolVersion', '"2025-11-25"'],
            ['serverInfo', { es: '{"name":"tienda-api",…}', en: '{"name":"shop-api",…}' }],
            ['capabilities', '{"tools":…}'],
          ],
          [1, 2, 3],
        );
        await d.caption({
          es: 'La tienda contesta la versión que usarán, quién es y qué ofrece: herramientas',
          en: 'The shop answers with the version they’ll use, who it is and what it offers: tools',
        });
        await d.fly(route(d, 'mcpclient', 'mcpshop', 0), 'initialized', 'muted', {
          arrive: 'mcpshop',
          trail: { badge: '3' },
        });
        await d.fly(route(d, 'mcpshop', 'mcpclient', 1), '202', 'http', {
          arrive: 'mcpclient',
          trail: { badge: '4' },
        });
        await d.caption({
          es: 'notifications/initialized no lleva id, y recibe un 202 sin cuerpo',
          en: 'notifications/initialized has no id, and gets a 202 with no body',
        });
        await card(
          d,
          [
            ['"method"', '"tools/list"'],
            [{ es: 'cabecera', en: 'header' }[d.lang], 'MCP-Protocol-Version: 2025-11-25'],
          ],
          [2],
        );
        await d.fly(route(d, 'mcpclient', 'mcpshop', 2), 'tools/list', 'http', {
          arrive: 'mcpshop',
          trail: { badge: '5' },
        });
        await d.caption({
          es: 'Desde ahí, cada petición lleva la versión en MCP-Protocol-Version',
          en: 'From then on, every request carries the version in MCP-Protocol-Version',
        });
        await d.caption({
          es: 'La versión del protocolo es una fecha: la de la especificación que siguen los dos',
          en: 'The protocol version is a date: the one of the specification both follow',
        });
      },
    },
    {
      id: 'transport',
      view: 'stateless',
      kind: 'http',
      chip: { es: 'POST /mcp', en: 'POST /mcp' },
      title: { es: 'Un POST por mensaje', en: 'One POST per message' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Dos transportes: stdio, en tu ordenador, y Streamable HTTP, por la red',
          en: 'Two transports: stdio, on your computer, and Streamable HTTP, over the network',
        });
        await post(d, 'a', 'initialize');
        await d.caption({
          es: 'La tienda usa Streamable HTTP: cada mensaje es un POST a /mcp',
          en: 'The shop uses Streamable HTTP: each message is a POST to /mcp',
        });
        await post(d, 'b', 'tools/list');
        await d.caption({
          es: 'Cada POST crea su servidor y su transporte, y los tira al terminar',
          en: 'Each POST creates its own server and transport, and throws them away at the end',
        });
        await post(d, 'a', 'tools/call');
        await d.note(
          d.pt('mcpclient', 'b'),
          { es: 'sin Mcp-Session-Id', en: 'no Mcp-Session-Id' },
          { where: 'below', look: 'tag', kind: 'http' },
        );
        await d.caption({
          es: 'Sin estado: no hay Mcp-Session-Id, y da igual qué copia conteste',
          en: 'Stateless: there’s no Mcp-Session-Id, and it doesn’t matter which copy answers',
        });
        await refuse(d, 'b', 'GET', '405');
        await d.caption({
          es: 'GET y DELETE abrirían un flujo y cerrarían una sesión: sin sesiones, 405',
          en: 'GET and DELETE would open a stream and close a session: with no sessions, 405',
        });
        await refuse(d, 'a', { es: 'Accept: 1 tipo', en: 'Accept: 1 type' }, '406');
        await d.caption({
          es: 'El cliente tiene que aceptar JSON y eventos: con un tipo solo, 406',
          en: 'The client has to accept JSON and events: with only one type, 406',
        });
      },
    },
    {
      id: 'tool',
      view: 'doors',
      kind: 'tcp',
      chip: { es: 'esquema', en: 'schema' },
      title: { es: 'Una herramienta', en: 'A tool' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        light(d, '#mc-def-1', 'tcp');
        light(d, '#mc-def-2', 'tcp');
        await d.caption({
          es: 'Su description es para el modelo: la lee para decidir cuándo usarla',
          en: 'Its description is for the model: it reads it to decide when to use it',
        });
        light(d, '#mc-def-3', 'tcp');
        await d.fly(route(d, '#mc-def-3', '#mc-door-2'), 'JSON Schema', 'tcp', {
          arrive: '#mc-door-2',
        });
        await d.caption({
          es: 'El SDK convierte el esquema de Zod en el JSON Schema que el agente ve en tools/list',
          en: 'The SDK turns the Zod schema into the JSON Schema the agent sees in tools/list',
        });
        await d.fly(
          route(d, '#mc-door-2', '#mc-def-3'),
          { es: 'consulta: ""', en: 'query: ""' },
          'muted',
          { small: true },
        );
        await d.note(d.pt('#mc-def-3', 'r', -10), '✗', {
          where: 'center',
          look: 'tag',
          kind: 'http',
          ttl: 1400,
        });
        await d.caption({
          es: '…y comprueba con él cada llamada antes de ejecutar nada',
          en: '…and checks every call against it before running anything',
        });
        light(d, '#mc-def-4', 'tcp');
        await d.caption({
          es: 'annotations: una pista para el cliente, «solo lee»; nunca es seguridad',
          en: 'annotations: a hint for the client, “it only reads”; it’s never security',
        });
        light(d, '#mc-door-1', 'tcp');
        light(d, '#mc-door-2', 'tcp');
        await Promise.all(
          [1, 2].map((door) =>
            d.fly(route(d, `#mc-door-${door}`, '#mc-fn'), '', 'tcp', { arrive: '#mc-fn' }),
          ),
        );
        light(d, '#mc-fn', 'tcp');
        await d.caption({
          es: 'Detrás, la misma función que usa el asistente: una forma de buscar, dos puertas',
          en: 'Behind it, the same function the assistant uses: one way to search, two doors',
        });
        await d.note(
          d.pt('#mc-fn', 'b'),
          { es: '10 productos o 50 pedidos, como mucho', en: '10 products or 50 orders, at most' },
          { where: 'below', look: 'tag', kind: 'tcp' },
        );
        await d.caption({
          es: 'Todo resultado está acotado: entra en la conversación del modelo, y se paga',
          en: 'Every result is bounded: it goes into the model’s conversation, and it’s paid for',
        });
      },
    },
    {
      id: 'errors',
      view: 'hostview',
      kind: 'http',
      chip: { es: 'errores', en: 'errors' },
      title: { es: 'Dos clases de error', en: 'Two kinds of error' },
      start: () => ({ mcAsk: true }),
      end: () => ({ mcAsk: true }),
      async play(d) {
        await d.wait(300);
        await d.fly(
          route(d, '#mc-host-client', 'mcpshop', REQ),
          { es: 'otro método', en: 'unknown method' },
          'muted',
          { arrive: 'mcpshop' },
        );
        await d.fly(route(d, 'mcpshop', '#mc-host-client', RES), 'error -32601', 'http', {
          arrive: '#mc-host-client',
        });
        await d.caption({
          es: 'Un error del protocolo llega en error, con su código: -32601, ese método no existe',
          en: 'A protocol error comes in error, with its code: -32601, that method doesn’t exist',
        });
        await d.caption({ es: 'Lo lee el cliente', en: 'The client reads it' });
        await d.fly(route(d, '#mc-host-client', 'mcpshop', REQ), 'tools/call', 'http', {
          arrive: 'mcpshop',
        });
        await d.fly(route(d, 'mcpshop', '#mc-host-client', RES), 'isError: true', 'http', {
          arrive: '#mc-host-client',
        });
        await d.fly(route(d, 'host', 'model', REQ), 'tool_result', 'tcp', { arrive: 'model' });
        await d.setText('#ai-model-status', { es: 'decide', en: 'decides' });
        await d.caption({
          es: 'Uno de la herramienta llega en result, con isError y una frase: lo lee el modelo, que decide',
          en: 'A tool error comes in result, with isError and a sentence: the model reads it and decides',
        });
        await d.caption({
          es: 'Con el SDK, una entrada que no cumple el esquema también: MCP error -32602',
          en: 'With the SDK, an input that doesn’t match the schema is one too: MCP error -32602',
        });
        await d.fly(route(d, '#mc-host-client', 'mcpshop', REQ), 'tools/call', 'http', {
          arrive: 'mcpshop',
        });
        await d.note(
          d.pt('mcpshop', 'b'),
          { es: 'error entero → log', en: 'whole error → log' },
          { where: 'below', look: 'tag', kind: 'muted' },
        );
        await d.fly(
          route(d, 'mcpshop', '#mc-host-client', RES),
          { es: 'una frase corta', en: 'a short sentence' },
          'http',
          { arrive: '#mc-host-client' },
        );
        await d.caption({
          es: 'Si algo se rompe dentro, el agente recibe una frase corta, y el log, el error entero',
          en: 'If something breaks inside, the agent gets a short sentence, and the log, the whole error',
        });
      },
    },
    {
      id: 'auth',
      view: 'keyring',
      kind: 'tls',
      chip: { es: 'clave', en: 'API key' },
      title: { es: 'Quién entra', en: 'Who gets in' },
      start: () => ({}),
      end: () => ({ mcRole: 'reparto', mcRefused: 2 }),
      async play(d) {
        await d.wait(300);
        await call(d, 2, 'Bearer …');
        d.set({ mcRole: 'reparto' });
        d.glow('#mc-role', 'tls');
        await d.caption({
          es: 'Antes de MCP, la tienda mira la clave de API con el middleware de la Fase 6',
          en: 'Before MCP, the shop checks the API key with Phase 6’s middleware',
        });
        await d.caption({
          es: 'Un agente trabaja con un rol, como una empresa, no como un cliente',
          en: 'An agent works with a role, like a company, not as a customer',
        });
        await call(d, 4, 'cookie', 'muted');
        await answer(d, 4, '401');
        d.set({ mcRefused: 1 });
        await d.caption({
          es: 'La sesión de Carmen recibe un 401: solo entra una clave de API',
          en: 'Carmen’s session gets a 401: only an API key gets in',
        });
        await call(d, 5, 'tools/list', 'muted');
        await answer(d, 5, '401');
        d.set({ mcRefused: 2 });
        await d.note(d.pt('mcpshop', 'b'), 'WWW-Authenticate', {
          where: 'below',
          look: 'tag',
          kind: 'tls',
          ttl: 2400,
        });
        await d.caption({
          es: 'Sin clave, ni la lista de herramientas: el 401 llega antes de MCP',
          en: 'Without a key, not even the list of tools: the 401 comes before MCP',
        });
        await d.caption({
          es: 'Para servidores públicos, MCP propone OAuth 2.1; la tienda usa una cabecera fija',
          en: 'For public servers, MCP proposes OAuth 2.1; the shop uses a fixed header',
        });
      },
    },
    {
      id: 'roles',
      view: 'keyring',
      kind: 'tls',
      chip: { es: 'roles', en: 'roles' },
      title: { es: 'Cada rol, sus herramientas', en: 'Each role, its tools' },
      start: () => ({ mcRefused: 2 }),
      end: () => ({ mcRefused: 2, mcListed: 3, mcRole: 'catalogo' }),
      async play(d) {
        await d.wait(300);
        const captions: Text[] = [
          {
            es: 'El servidor de cada petición solo registra las herramientas que puede usar su rol',
            en: 'Each request’s server only registers the tools its role can use',
          },
          {
            es: 'El comparador ve dos; Reparto Rápido, cuatro, en la misma dirección',
            en: 'The comparison site sees two; Fast Delivery, four, at the same address',
          },
          {
            es: 'Una clave de Ana o Luis, admin, las cuatro',
            en: 'A key of Ana’s or Luis’s, admin, all four',
          },
        ];
        for (const [i, role] of KEY_ROLES.entries()) {
          await call(d, i + 1, 'tools/list');
          d.set({ mcRole: role });
          d.glow('mcpshop', 'tls');
          await answer(d, i + 1, String(toolsFor(role).length));
          d.set({ mcListed: (i + 1) as 1 | 2 | 3 });
          await d.caption(captions[i]!);
        }
        await call(d, 1, 'tools/call');
        d.set({ mcRole: 'catalogo' });
        await answer(d, 1, 'isError');
        await d.note(d.pt('mcpshop', 'b'), `Tool ${tools(d)[3]} not found`, {
          where: 'below',
          look: 'tag',
          kind: 'http',
        });
        await d.caption({
          es: 'Si la llama de todas formas, recibe un error: en su servidor, no existe',
          en: 'If it calls it anyway, it gets an error: in its server, it doesn’t exist',
        });
        await d.caption({
          es: `Y dentro, ${strings.es.tools[3]} solo envía un pedido pagado, la llame quien la llame`,
          en: `And inside, ${strings.en.tools[3]} only ships a paid order, whoever calls it`,
        });
      },
    },
    {
      id: 'notauth',
      view: 'keyring',
      kind: 'tls',
      chip: { es: 'poder', en: 'power' },
      title: { es: 'El poder de una clave', en: 'A key’s power' },
      start: () => ({ mcRefused: 2, mcListed: 3 }),
      end: () => ({ mcRefused: 2, mcListed: 3, mcRole: 'catalogo' }),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'MCP lleva la llamada, pero no sabe quién puede hacer qué: lo decide tu código',
          en: 'MCP carries the call, but it doesn’t know who can do what: your code decides',
        });
        light(d, '#mc-tool-4', 'muted');
        await d.note(
          d.pt('mcpshop', 't'),
          { es: '«Solo para la empresa de reparto»', en: '“Only for the delivery company”' },
          { where: 'above', look: 'tag', kind: 'muted', ttl: 2600 },
        );
        await d.caption({
          es: 'La descripción no protege nada: es texto para un modelo',
          en: 'The description protects nothing: it’s text for a model',
        });
        light(d, '#mc-tool-1', 'muted');
        await d.note(d.pt('mcpshop', 'b'), 'readOnlyHint', {
          where: 'below',
          look: 'tag',
          kind: 'muted',
          ttl: 2200,
        });
        await d.caption({
          es: 'Las annotations tampoco: son pistas para el cliente, y el cliente es de otro',
          en: 'Nor do the annotations: they’re hints for the client, and the client is someone else’s',
        });
        await d.caption({
          es: 'Ni las instrucciones del agente: a un modelo se le engaña con texto en los datos',
          en: 'Nor do the agent’s instructions: a model can be tricked with text in the data',
        });
        await call(d, 1, 'tools/list');
        d.set({ mcRole: 'catalogo' });
        d.glow('mcpshop', 'tls');
        await d.caption({
          es: 'El poder de un agente es el de su clave: al comparador, catalogo; nunca admin',
          en: 'An agent’s power is its key’s: for the comparison site, catalogue; never admin',
        });
        await d.caption({
          es: 'Si la clave se filtra, o engañan al agente, el daño se queda en lo que podía tocar',
          en: 'If the key leaks, or someone tricks the agent, the damage stays within what it could touch',
        });
      },
    },
    {
      id: 'try',
      view: 'trymcp',
      kind: 'tls',
      chip: { es: 'dos claves', en: 'two keys' },
      title: { es: 'Lo que ve cada clave', en: 'What each key sees' },
      start: () => ({}),
      end: () => ({ mcRole: 'reparto' }),
      async play(d) {
        await d.wait(300);
        const [catalogue, delivery, ship] =
          d.lang === 'es'
            ? ['$CATALOGO', '$REPARTO', '$ENVIAR']
            : ['$CATALOGUE', '$DELIVERY', '$SHIP'];
        const back = (label: Text | string, kind: 'http' | 'muted' = 'http') =>
          d.fly(route(d, 'mcpshop', 'shell', RES), label, kind, { arrive: 'shell' });
        await run(d, 1, `mcp ${catalogue} …`, 'tools/list');
        d.set({ mcRole: 'catalogo' });
        await back({ es: '2 herramientas', en: '2 tools' });
        mark(d, '#ai-run-1', true);
        await run(d, 2, `mcp ${delivery} …`, 'tools/list');
        d.set({ mcRole: 'reparto' });
        await back({ es: '4 herramientas', en: '4 tools' });
        mark(d, '#ai-run-2', true);
        await d.caption({
          es: 'tools/list con cada clave: dos herramientas para el comparador, cuatro para Reparto Rápido',
          en: 'tools/list with each key: two tools for the comparison site, four for Fast Delivery',
        });
        await run(d, 3, `mcp ${catalogue} ${ship}`, 'tools/call');
        d.set({ mcRole: 'catalogo' });
        await back('not found', 'muted');
        mark(d, '#ai-run-3', false);
        await d.caption({
          es: `El comparador intenta enviar el pedido: Tool ${strings.es.tools[3]} not found`,
          en: `The comparison site tries to ship the order: Tool ${strings.en.tools[3]} not found`,
        });
        const result = d.q('#ai-run-3');
        result.textContent = '';
        delete result.dataset.mark;
        await run(d, 3, `mcp ${delivery} ${ship}`, 'tools/call');
        d.set({ mcRole: 'reparto' });
        light(d, '#mc-tool-4', 'tcp');
        await back({ es: '"enviado"', en: '"shipped"' });
        mark(d, '#ai-run-3', true);
        await d.caption({
          es: 'Reparto Rápido lo envía: el pedido vuelve «enviado»',
          en: 'Fast Delivery ships it: the order comes back “shipped”',
        });
      },
    },
  ],
};

export default lesson;
