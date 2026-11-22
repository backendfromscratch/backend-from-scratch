// El servidor MCP (Fase 11, lección 4), src/mcp.ts: la tienda escuchando de verdad en un puerto
// libre, y el cliente del propio SDK de MCP (el que usan los agentes) hablándole por HTTP, con una
// clave de cada rol. El último test habla el protocolo a mano, con fetch, como curl en la lección.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { serve, type ServerType } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { app } from '../src/app.ts';
import { buscarProductosPorNombre } from '../src/asistente/herramientas/buscar-productos.ts';
import { pool } from '../src/bd.ts';
import { usarBd } from './bd.ts';
import { CARMEN, comoClave, comoReparto, comoUsuario } from './identidades.ts';

// Una clave de cada rol que puede tener una clave, y la sesión de Carmen, una clienta.
const quien: Record<string, Record<string, string>> = {};
usarBd(async () => {
  quien.reparto = await comoReparto();
  quien.admin = await comoClave('admin');
  quien.catalogo = await comoClave('catalogo');
  quien.carmen = await comoUsuario(CARMEN);
});

// La tienda, en un puerto libre de 127.0.0.1 (port: 0: lo elige el sistema).
let servidor: ServerType;
let url: URL;
before(async () => {
  await new Promise<void>((listo) => {
    servidor = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => listo());
  });
  url = new URL(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/mcp`);
});

// Cada cliente conectado, para cerrarlos todos al final, antes que la tienda.
const clientes: Client[] = [];
after(async () => {
  for (const cliente of clientes) await cliente.close();
  await new Promise((cerrado) => servidor.close(cerrado));
});

/** Un cliente de MCP conectado a la tienda con esas cabeceras: initialize, y listo para usar. */
async function conectar(cabeceras: Record<string, string>): Promise<Client> {
  const cliente = new Client({ name: 'tests-de-la-tienda', version: '1.0.0' });
  await cliente.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: cabeceras } }),
  );
  clientes.push(cliente);
  return cliente;
}

const nombres = async (cliente: Client) =>
  (await cliente.listTools()).tools.map((herramienta) => herramienta.name);

/** El texto del único bloque de un resultado, y si es un error. */
function leer(resultado: unknown): { texto: string; error: boolean } {
  const { content, isError } = resultado as CallToolResult;
  assert.equal(content.length, 1);
  assert.equal(content[0]!.type, 'text');
  return { texto: (content[0] as { text: string }).text, error: isError === true };
}

/** El JSON de un resultado que no es un error. */
function json(resultado: unknown) {
  const { texto, error } = leer(resultado);
  assert.equal(error, false, texto);
  return JSON.parse(texto);
}

const estadoDe = async (id: number) =>
  (await pool.query('SELECT estado FROM pedidos WHERE id = $1', [id])).rows[0].estado;

test('tools/list con la clave de reparto: las cuatro, con su descripción y el JSON Schema de su entrada', async () => {
  const { tools } = await (await conectar(quien.reparto!)).listTools();
  assert.deepEqual(
    tools.map((herramienta) => herramienta.name),
    ['buscar_productos', 'ver_producto', 'pedidos_para_enviar', 'marcar_enviado'],
  );
  for (const herramienta of tools) assert.ok(herramienta.description!.length > 100);

  // El esquema de Zod, convertido por el SDK en el JSON Schema que lee el agente.
  const [buscar, , pedidos, marcar] = tools;
  assert.deepEqual(buscar!.inputSchema.required, ['consulta']);
  assert.equal(buscar!.inputSchema.additionalProperties, false);
  assert.deepEqual(buscar!.inputSchema.properties!.consulta, {
    type: 'string',
    minLength: 1,
    maxLength: 100,
    description: 'Una palabra del nombre del producto, en singular: taza, camiseta, sudadera.',
  });
  // limite tiene un valor por defecto y cursor es opcional: ninguno es obligatorio. Del cursor, el
  // agente ve que es un texto: lo que hay dentro lo lee la tienda.
  assert.equal(pedidos!.inputSchema.required, undefined);
  assert.equal((pedidos!.inputSchema.properties!.cursor as { type: string }).type, 'string');
  assert.equal((pedidos!.inputSchema.properties!.limite as { default: number }).default, 10);
  // Las pistas para el cliente: las que leen, solo leen; marcar_enviado cambia algo.
  assert.equal(buscar!.annotations?.readOnlyHint, true);
  assert.equal(marcar!.annotations?.readOnlyHint, undefined);
  assert.equal(marcar!.annotations?.idempotentHint, true);
});

test('tools/list con otras claves: admin, las cuatro (permisos.ts le deja enviar); catalogo, solo las del catálogo', async () => {
  assert.deepEqual(await nombres(await conectar(quien.admin!)), [
    'buscar_productos',
    'ver_producto',
    'pedidos_para_enviar',
    'marcar_enviado',
  ]);
  assert.deepEqual(await nombres(await conectar(quien.catalogo!)), [
    'buscar_productos',
    'ver_producto',
  ]);
});

test('buscar_productos y ver_producto: el resultado en JSON, con las funciones de la tienda; lo que no vale, isError', async () => {
  const cliente = await conectar(quien.catalogo!);
  const tazas = json(
    await cliente.callTool({ name: 'buscar_productos', arguments: { consulta: 'taza' } }),
  );
  assert.deepEqual(tazas, [{ id: 2, nombre: 'Taza', precioCentimos: 850, stock: 60 }]);
  // Lo mismo que le llega al asistente: la misma función.
  assert.deepEqual(tazas, await buscarProductosPorNombre('taza'));

  assert.deepEqual(json(await cliente.callTool({ name: 'ver_producto', arguments: { id: 2 } })), {
    id: 2,
    nombre: 'Taza',
    precioCentimos: 850,
    stock: 60,
    categorias: ['Hogar', 'Regalos'],
  });
  assert.deepEqual(leer(await cliente.callTool({ name: 'ver_producto', arguments: { id: 999 } })), {
    texto: 'No hay ningún producto con ese id.',
    error: true,
  });

  // Una entrada que no cumple el esquema no llega a la herramienta: el SDK dice qué falla, con el
  // código de JSON-RPC de los parámetros que no valen (-32602).
  for (const entrada of [{ consulta: '' }, { consulta: 'taza', otra: 1 }, {}]) {
    const { texto, error } = leer(
      await cliente.callTool({ name: 'buscar_productos', arguments: entrada }),
    );
    assert.equal(error, true);
    assert.match(
      texto,
      /^MCP error -32602: Input validation error: Invalid arguments for tool buscar_productos/,
    );
  }
});

test('pedidos_para_enviar: los pagados, del más nuevo al más antiguo, por páginas, como GET /v2/pedidos?estado=pagado', async () => {
  const cliente = await conectar(quien.reparto!);
  const primera = json(
    await cliente.callTool({ name: 'pedidos_para_enviar', arguments: { limite: 3 } }),
  );
  assert.deepEqual(
    primera.pedidos.map((pedido: { id: number }) => pedido.id),
    [20, 19, 18],
  );
  assert.ok(primera.pedidos.every((pedido: { estado: string }) => pedido.estado === 'pagado'));
  assert.equal(typeof primera.siguiente, 'string');

  const segunda = json(
    await cliente.callTool({
      name: 'pedidos_para_enviar',
      arguments: { limite: 50, cursor: primera.siguiente },
    }),
  );
  assert.deepEqual(
    segunda.pedidos.map((pedido: { id: number }) => pedido.id),
    [17, 16, 15, 14, 13],
  );
  assert.equal(segunda.siguiente, null);

  // Sin limite, 10; un cursor inventado, isError con el mensaje del esquema de /v2.
  const todos = json(await cliente.callTool({ name: 'pedidos_para_enviar', arguments: {} }));
  assert.equal(todos.pedidos.length, 8);
  const { texto, error } = leer(
    await cliente.callTool({ name: 'pedidos_para_enviar', arguments: { cursor: 'inventado' } }),
  );
  assert.equal(error, true);
  assert.match(texto, /El cursor no es válido/);
});

test('marcar_enviado con la clave de reparto: el pedido pasa a enviado; uno que no está pagado, isError con su estado', async () => {
  const cliente = await conectar(quien.reparto!);
  assert.equal(await estadoDe(13), 'pagado');
  const enviado = json(await cliente.callTool({ name: 'marcar_enviado', arguments: { id: 13 } }));
  assert.equal(enviado.id, 13);
  assert.equal(enviado.estado, 'enviado');
  assert.equal(await estadoDe(13), 'enviado');

  // Otra vez, uno pendiente (el 21) y uno que no existe: nada cambia, y el agente sabe por qué.
  const intentos = [
    [13, 'El pedido está enviado: solo se envía uno pagado.'],
    [21, 'El pedido está pendiente: solo se envía uno pagado.'],
    [999, 'No hay ningún pedido con ese número.'],
  ] as const;
  for (const [id, texto] of intentos) {
    const resultado = await cliente.callTool({ name: 'marcar_enviado', arguments: { id } });
    assert.deepEqual(leer(resultado), { texto, error: true });
  }
  assert.equal(await estadoDe(21), 'pendiente');
});

test('marcar_enviado con la clave de catalogo: isError, y el pedido sigue pagado', async () => {
  const cliente = await conectar(quien.catalogo!);
  // Aunque no está en su lista, un agente puede llamarla: su servidor no la tiene.
  for (const [name, args] of [
    ['marcar_enviado', { id: 14 }],
    ['pedidos_para_enviar', {}],
  ] as const) {
    const { texto, error } = leer(await cliente.callTool({ name, arguments: args }));
    assert.equal(error, true);
    assert.equal(texto, `MCP error -32602: Tool ${name} not found`);
  }
  assert.equal(await estadoDe(14), 'pagado');
});

test('sin clave, con una que no existe o con la sesión de una clienta: 401 antes de MCP, con WWW-Authenticate', async () => {
  const inventada = { Authorization: 'Bearer tienda_inventada' };
  for (const cabeceras of [{}, inventada, quien.carmen!]) {
    // El cliente del SDK ni llega a conectarse: el initialize ya recibe el 401.
    await assert.rejects(
      conectar(cabeceras),
      (error) => error instanceof StreamableHTTPError && error.code === 401,
    );
    // Y la respuesta, vista a mano: un Problem Details, como los 401 del resto de la tienda.
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...cabeceras, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="tienda-api"');
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
  }
});

test('GET y DELETE en /mcp: 405 con Allow: POST; y /mcp no está en el contrato de v2', async () => {
  for (const method of ['GET', 'DELETE']) {
    const res = await fetch(url, {
      method,
      headers: { ...quien.reparto, Accept: 'text/event-stream' },
    });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
  }
  const { paths } = await (await app.request('/v2/openapi.json')).json();
  assert.ok(Object.keys(paths).every((ruta) => !ruta.includes('mcp')));
});

test('el protocolo a mano, con fetch: initialize, notifications/initialized, tools/list y tools/call, en JSON-RPC', async () => {
  // Lo que manda cualquier cliente: la clave, el cuerpo en JSON y un Accept con los dos tipos que
  // admite Streamable HTTP. Esta tienda siempre contesta en JSON.
  const cabeceras = {
    ...quien.reparto,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const enviar = (mensaje: object, version?: string) =>
    fetch(url, {
      method: 'POST',
      // Después de initialize, cada petición dice la versión del protocolo que se acordó.
      headers: version ? { ...cabeceras, 'MCP-Protocol-Version': version } : cabeceras,
      body: JSON.stringify({ jsonrpc: '2.0', ...mensaje }),
    });

  // 1. initialize: el cliente dice qué versión del protocolo habla y quién es; el servidor contesta
  // con la versión que usarán, qué sabe hacer (tools) y quién es él.
  const inicio = await enviar({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'curl', version: '8.14.1' },
    },
  });
  assert.equal(inicio.status, 200);
  assert.equal(inicio.headers.get('content-type'), 'application/json');
  // Sin estado: ninguna sesión que recordar.
  assert.equal(inicio.headers.get('mcp-session-id'), null);
  assert.deepEqual(await inicio.json(), {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'tienda-api', version: '1.0.0' },
    },
  });

  // 2. Una notificación (sin id): no espera respuesta, y el servidor contesta 202 sin cuerpo.
  const listo = await enviar({ method: 'notifications/initialized' }, '2025-11-25');
  assert.equal(listo.status, 202);
  assert.equal(await listo.text(), '');

  // 3. tools/list: la respuesta lleva el mismo id que la pregunta.
  const lista = await (await enviar({ id: 2, method: 'tools/list' }, '2025-11-25')).json();
  assert.equal(lista.id, 2);
  assert.deepEqual(
    lista.result.tools.map((herramienta: { name: string }) => herramienta.name),
    ['buscar_productos', 'ver_producto', 'pedidos_para_enviar', 'marcar_enviado'],
  );

  // 4. tools/call: el nombre y los argumentos; el resultado, bloques de contenido.
  const llamada = await enviar(
    {
      id: 3,
      method: 'tools/call',
      params: { name: 'buscar_productos', arguments: { consulta: 'gorra' } },
    },
    '2025-11-25',
  );
  assert.deepEqual(await llamada.json(), {
    jsonrpc: '2.0',
    id: 3,
    result: {
      content: [
        { type: 'text', text: '[{"id":4,"nombre":"Gorra","precioCentimos":1500,"stock":15}]' },
      ],
    },
  });
});

test('las respuestas de MCP llevan X-Request-Id, como las de toda la tienda: el del cliente o uno nuevo', async () => {
  const enviar = (cabeceras: Record<string, string>, mensaje: object) =>
    fetch(url, {
      method: 'POST',
      headers: {
        ...quien.reparto,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...cabeceras,
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...mensaje }),
    });
  // Sin X-Request-Id en la petición, uno nuevo, que es el que va al log (requestId() en app.ts).
  const nueva = await enviar({}, { id: 1, method: 'tools/list' });
  assert.equal(nueva.status, 200);
  assert.match(nueva.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  // Con uno, el mismo: así un agente puede seguir su llamada en el log de la tienda.
  const suya = await enviar({ 'X-Request-Id': 'agente-0001' }, { id: 2, method: 'tools/list' });
  assert.equal(suya.headers.get('x-request-id'), 'agente-0001');
  // También en el 202 sin cuerpo de una notificación.
  const aviso = await enviar(
    { 'X-Request-Id': 'agente-0002' },
    { method: 'notifications/initialized' },
  );
  assert.equal(aviso.status, 202);
  assert.equal(aviso.headers.get('x-request-id'), 'agente-0002');
});
