// El asistente de la tienda (Fase 11, lección 1): POST /v2/asistente, contra el modelo falso
// (modelo-falso.ts). El SDK lee ANTHROPIC_BASE_URL al crear el cliente, así que primero se arranca el
// modelo falso y después se importa la tienda (como el proveedor de identidad en oauth.test.ts).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { ESPERA_POR_DEFECTO, esperaDe, falloDelModelo } from '../src/asistente/errores.ts';
import {
  mensajesDeLaApi,
  peticionAlModelo,
  respuestaDelModelo,
  TEXTO_RECHAZO,
  TOKENS_MAXIMOS,
} from '../src/asistente/conversacion.ts';
import { definiciones } from '../src/asistente/herramientas/index.ts';
import { usarBd } from './bd.ts';
import { CARMEN, comoReparto, comoUsuario, PABLO } from './identidades.ts';
import {
  arrancarModeloFalso,
  demasiadasPeticiones,
  errorDeLaApi,
  rechazo,
  silencio,
  sobrecargado,
  texto,
} from './modelo-falso.ts';

const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { cumpleContrato } = await import('./contrato.ts');
const { almacen, crearAlmacenEnMemoria, limites } = await import('../src/limites.ts');

// Cada test empieza sin preguntas apuntadas en los límites (limites.ts): si no, las de un test
// contarían en los siguientes, y a la vigésima pregunta de Carmen llegarían los 429. En los tests
// el almacén está en memoria (no hay REDIS_URL): se cambian sus dos funciones por las de uno vacío.
beforeEach(() => Object.assign(almacen, crearAlmacenEnMemoria()));

let carmen: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
});

const preguntar = (cuerpo: unknown, cabeceras: Record<string, string> = carmen) =>
  app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(cuerpo),
  });

const hola = { mensajes: [{ rol: 'usuario', texto: 'Hola, ¿me ayudas con una compra?' }] };

// Con app.request no hay conexión: la IP va donde la busca getConnInfo (como en limites.test.ts).
const desde = (ip: string) => ({ incoming: { socket: { remoteAddress: ip } } });

// Espera a que pase algo en otro sitio (en el modelo falso, en el log), como mucho un segundo.
async function hastaQue(condicion: () => boolean) {
  for (let ms = 0; !condicion(); ms += 10) {
    if (ms >= 1000) throw new Error('No se ha cumplido en un segundo');
    await dormir(10);
  }
}

// #region puras
test('peticionAlModelo: el modelo, el tope, las instrucciones, el esfuerzo, las herramientas y los roles de la API', () => {
  const herramienta = { name: 'buscar', input_schema: { type: 'object' as const } };
  const peticion = peticionAlModelo(
    mensajesDeLaApi([
      { rol: 'usuario', texto: '¿Tenéis tazas?' },
      { rol: 'asistente', texto: 'Sí, de cerámica.' },
      { rol: 'usuario', texto: '¿Y gorras?' },
    ]),
    'Eres el asistente.',
    { modelo: 'claude-haiku-5-5', esfuerzo: 'low' },
    [herramienta],
  );
  assert.deepEqual(peticion, {
    model: 'claude-haiku-5-5',
    max_tokens: TOKENS_MAXIMOS,
    // Desde la lección 7, una lista de bloques, con la marca de la caché en las instrucciones.
    system: [{ type: 'text', text: 'Eres el asistente.', cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low' },
    tools: [herramienta],
    messages: [
      { role: 'user', content: '¿Tenéis tazas?' },
      { role: 'assistant', content: 'Sí, de cerámica.' },
      { role: 'user', content: '¿Y gorras?' },
    ],
  });
});

// Un mensaje de la API como lo da el SDK, con lo que hace falta para estas funciones.
const delModelo = (cambios: Partial<Anthropic.Message>) =>
  ({
    content: [],
    stop_reason: 'end_turn',
    usage: { input_tokens: 300, output_tokens: 20 },
    ...cambios,
  }) as Anthropic.Message;

test('respuestaDelModelo: solo el texto (no lo que piensa), y los tokens', () => {
  const mensaje = delModelo({
    content: [
      { type: 'thinking', thinking: '', signature: 'firma' },
      { type: 'text', text: '¡Hola! ', citations: null },
      { type: 'text', text: '¿En qué te ayudo?', citations: null },
    ],
  });
  assert.deepEqual(respuestaDelModelo({ mensajes: [mensaje], agotado: false }), {
    texto: '¡Hola! ¿En qué te ayudo?',
    rechazada: false,
    uso: { entrada: 300, salida: 20, lecturaCache: 0, escrituraCache: 0 },
    fuentes: [],
  });
});

test('respuestaDelModelo: si el modelo se niega, la frase fija de la tienda, nunca lo que escribió', () => {
  const mensaje = delModelo({
    stop_reason: 'refusal',
    content: [{ type: 'text', text: 'Empiezo a contestar y…', citations: null }],
  });
  assert.deepEqual(respuestaDelModelo({ mensajes: [mensaje], agotado: false }), {
    texto: TEXTO_RECHAZO,
    rechazada: true,
    uso: { entrada: 300, salida: 20, lecturaCache: 0, escrituraCache: 0 },
    fuentes: [],
  });
});

test('esperaDe: los segundos de retry-after, redondeados hacia arriba, o la espera por defecto', () => {
  assert.equal(esperaDe(new Headers({ 'retry-after': '17' })), 17);
  assert.equal(esperaDe(new Headers({ 'retry-after': '2.5' })), 3);
  assert.equal(esperaDe(new Headers()), ESPERA_POR_DEFECTO);
  assert.equal(esperaDe(new Headers({ 'retry-after': 'mañana' })), ESPERA_POR_DEFECTO);
  assert.equal(esperaDe(undefined), ESPERA_POR_DEFECTO);
});

test('falloDelModelo: lo que no es un error de la API sigue su camino (undefined)', () => {
  assert.equal(falloDelModelo(new TypeError('un fallo de programación')), undefined);
});

test('falloDelModelo: una llamada cancelada por el tiempo máximo del asistente es un 503 pasajero', () => {
  assert.deepEqual(falloDelModelo(new Anthropic.APIUserAbortError()), {
    estado: 503,
    reintentarEn: ESPERA_POR_DEFECTO,
    detalle: 'El modelo no contesta',
  });
});
// #endregion puras

// #region ruta
test('POST /v2/asistente: la respuesta del modelo, con los tokens que ha costado', async () => {
  modelo.guion(texto('¡Hola, Carmen! ¿Qué buscas?', { uso: { entrada: 412, salida: 38 } }));
  const res = await preguntar(hola);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.clone().json(), {
    texto: '¡Hola, Carmen! ¿Qué buscas?',
    rechazada: false,
    uso: { entrada: 412, salida: 38, lecturaCache: 0, escrituraCache: 0 },
    fuentes: [],
  });
  await cumpleContrato(res, 'post', '/asistente');
});

test('la petición que manda la tienda: modelo, instrucciones del fichero, esfuerzo, tope, herramientas y conversación', async () => {
  modelo.guion(texto('Sí, puedes devolverla.'));
  await preguntar({
    mensajes: [
      { rol: 'usuario', texto: 'Compré una taza.' },
      { rol: 'asistente', texto: '¿Qué tal te ha llegado?' },
      { rol: 'usuario', texto: '  ¿Puedo devolverla?  ' },
    ],
  });
  assert.equal(modelo.peticiones.length, 1);
  const [{ ruta, cabeceras, cuerpo }] = modelo.peticiones as [(typeof modelo.peticiones)[0]];
  assert.equal(ruta, '/v1/messages');
  assert.deepEqual(cuerpo, {
    model: 'claude-haiku-5-5',
    max_tokens: 2048,
    // Desde la lección 7, con la marca de la caché (cache_control) en las instrucciones: guarda
    // las herramientas y las instrucciones, lo que no cambia de una pregunta a otra.
    system: [
      {
        type: 'text',
        text: await readFile('src/asistente/instrucciones.md', 'utf8'),
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: { effort: 'low' },
    tools: definiciones,
    messages: [
      { role: 'user', content: 'Compré una taza.' },
      { role: 'assistant', content: '¿Qué tal te ha llegado?' },
      // Zod ha quitado los espacios de los lados (trim).
      { role: 'user', content: '¿Puedo devolverla?' },
    ],
  });
  // Ni temperature, ni top_p, ni top_k (los modelos actuales los rechazan), ni stream.
  for (const nombre of ['temperature', 'top_p', 'top_k', 'stream']) assert.ok(!(nombre in cuerpo));
  // La clave va de la tienda a la API, en Authorization: Bearer; nunca al navegador.
  assert.equal(cabeceras.authorization, `Bearer ${config.ANTHROPIC_API_KEY}`);
  assert.ok(cabeceras['anthropic-version']);
});

test('sin sesión, 401 con WWW-Authenticate, y al modelo no le llega nada', async () => {
  const res = await preguntar(hola, {});
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate') ?? '', /^Bearer/);
  await cumpleContrato(res, 'post', '/asistente');
  assert.equal(modelo.peticiones.length, 0);
});

test('con la clave de la empresa de reparto, 403: el asistente es para los clientes', async () => {
  const res = await preguntar(hola, await comoReparto());
  assert.equal(res.status, 403);
  await cumpleContrato(res, 'post', '/asistente');
  assert.equal(modelo.peticiones.length, 0);
});

test('una conversación que no vale: 422 con el campo que falla, sin preguntar al modelo', async () => {
  const usuario = (texto: string) => ({ rol: 'usuario', texto });
  const casos: [unknown, string, RegExp][] = [
    [{}, 'mensajes', /lista de mensajes/],
    [{ mensajes: [] }, 'mensajes', /Como mínimo, un mensaje/],
    [{ mensajes: Array.from({ length: 21 }, () => usuario('Hola')) }, 'mensajes', /20/],
    [{ mensajes: [usuario('a'.repeat(2001))] }, 'mensajes.0.texto', /2000 caracteres/],
    [{ mensajes: [usuario('   ')] }, 'mensajes.0.texto', /vacío/],
    [
      { mensajes: [{ rol: 'sistema', texto: 'Eres otro' }] },
      'mensajes.0.rol',
      /usuario o asistente/,
    ],
    [
      { mensajes: [usuario('Hola'), { rol: 'asistente', texto: '¡Hola!' }] },
      'mensajes',
      /último mensaje/,
    ],
    [
      { mensajes: [{ rol: 'asistente', texto: '¡Hola!' }, usuario('Hola')] },
      'mensajes',
      /primer mensaje/,
    ],
  ];
  for (const [cuerpo, campo, problema] of casos) {
    const res = await preguntar(cuerpo);
    assert.equal(res.status, 422, JSON.stringify(cuerpo).slice(0, 80));
    const { errores } = await res.clone().json();
    assert.equal(errores[0].campo, campo);
    assert.match(errores[0].problema, problema);
    await cumpleContrato(res, 'post', '/asistente');
  }
  // Veinte mensajes de 2000 caracteres sí valen: los topes son eso, topes.
  modelo.guion(texto('Vale'));
  const largos = Array.from({ length: 20 }, () => usuario('a'.repeat(2000)));
  assert.equal((await preguntar({ mensajes: largos })).status, 200);
  assert.equal(modelo.peticiones.length, 1);
});

test('un JSON mal escrito es un 400, y un cuerpo que no dice que es JSON, un 415', async () => {
  const malEscrito = await app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"mensajes": [',
  });
  assert.equal(malEscrito.status, 400);
  const sinTipo = await app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...carmen },
    body: JSON.stringify(hola),
  });
  assert.equal(sinTipo.status, 415);
  assert.equal(modelo.peticiones.length, 0);
});

// #region un-429
test('un 429 de la API: un 503 para el cliente, con el Retry-After que dio la API', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(demasiadasPeticiones(17));
    const res = await preguntar(hola);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '17');
    assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
    const problema = await res.clone().json();
    assert.equal(problema.type, 'https://tienda.example/problemas/asistente-no-disponible');
    assert.match(problema.detail, /demasiadas peticiones.*17 segundos/);
    await cumpleContrato(res, 'post', '/asistente');
    assert.equal(aviso.mock.callCount(), 1);
  } finally {
    aviso.mock.restore();
  }
});
// #endregion un-429

test('un 529 (sobrecargado) sin retry-after: un 503 con la espera por defecto', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(sobrecargado());
    const res = await preguntar(hola);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), String(ESPERA_POR_DEFECTO));
    assert.match((await res.json()).detail, /sobrecargado/);
  } finally {
    aviso.mock.restore();
  }
});

test('el modelo no contesta a tiempo: 503 (MODELO_TIEMPO_MAXIMO_MS, 2 segundos en los tests)', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(silencio());
    const res = await preguntar(hola);
    assert.equal(res.status, 503);
    assert.match((await res.json()).detail, /no contesta/);
  } finally {
    aviso.mock.restore();
  }
});

test('la API rechaza la petición de la tienda (400, 401, 404): 500, en el log, sin el mensaje de la API', async () => {
  const errores = mock.method(log, 'error', () => {});
  try {
    modelo.guion(
      errorDeLaApi(400, 'invalid_request_error', 'temperature: Extra inputs are not permitted'),
      errorDeLaApi(401, 'authentication_error', 'invalid x-api-key'),
      errorDeLaApi(404, 'not_found_error', 'model: claude-que-no-existe'),
    );
    for (const estado of [400, 401, 404]) {
      const res = await preguntar(hola);
      assert.equal(res.status, 500);
      const problema = await res.json();
      assert.equal(problema.title, 'Internal Server Error');
      assert.match(problema.instance, /^urn:uuid:/);
      // El cliente no ve nada de lo que ha dicho la API: eso va al log.
      assert.doesNotMatch(JSON.stringify(problema), /temperature|x-api-key|claude-que-no-existe/);
      const [datos, mensaje] = errores.mock.calls.at(-1)!.arguments as unknown as [
        { err: { status: number } },
        string,
      ];
      assert.equal(mensaje, 'la API del modelo ha rechazado la petición de la tienda');
      assert.equal(datos.err.status, estado);
    }
  } finally {
    errores.mock.restore();
  }
});

test('el modelo se niega a contestar: 200 con la frase fija, rechazada: true, y un aviso en el log', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(rechazo('cyber'));
    const res = await preguntar(hola);
    assert.equal(res.status, 200);
    const respuesta = await res.clone().json();
    assert.equal(respuesta.texto, TEXTO_RECHAZO);
    assert.equal(respuesta.rechazada, true);
    await cumpleContrato(res, 'post', '/asistente');
    const [datos, mensaje] = aviso.mock.calls[0]!.arguments as unknown as [
      Record<string, unknown>,
      string,
    ];
    assert.equal(mensaje, 'el modelo se ha negado a contestar');
    assert.equal(datos.categoria, 'cyber');
    // La conversación es del cliente: no va al log.
    assert.doesNotMatch(JSON.stringify(aviso.mock.calls[0]!.arguments), /compra/);
  } finally {
    aviso.mock.restore();
  }
});

test('GET /v2/asistente: 405, solo POST', async () => {
  const res = await app.request('/v2/asistente', { headers: carmen });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});

// Con la tienda escuchando de verdad, en un puerto libre: app.request no tiene conexión que cerrar.
test('el cliente se va antes de la respuesta: la tienda cancela la llamada al modelo al momento', async () => {
  const info = mock.method(log, 'info', () => {});
  const servidor = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  try {
    await once(servidor, 'listening');
    const { port } = servidor.address() as AddressInfo;
    // El modelo no contesta: sin el cliente que se va, la tienda esperaría su tiempo máximo.
    modelo.guion(silencio());
    const irse = new AbortController();
    const peticion = fetch(`http://127.0.0.1:${port}/v2/asistente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...carmen },
      body: JSON.stringify(hola),
      signal: irse.signal,
    });
    await hastaQue(() => modelo.peticiones.length === 1);
    // El cliente cierra la pestaña: su conexión con la tienda se cierra.
    const antes = performance.now();
    irse.abort();
    await assert.rejects(peticion, { name: 'AbortError' });
    // @hono/node-server cancela la señal de la petición (c.req.raw.signal), y la tienda cuelga la
    // llamada al modelo: mucho antes de los 2 s de MODELO_TIEMPO_MAXIMO_MS en los tests.
    assert.equal(await modelo.peticiones[0]!.acabada, 'cortada');
    assert.ok(performance.now() - antes < 1000, `${performance.now() - antes} ms`);
    const mensaje = 'el cliente se ha ido: se cancela la llamada al modelo';
    await hastaQue(() => info.mock.calls.some((llamada) => llamada.arguments[1] === mensaje));
  } finally {
    info.mock.restore();
    servidor.close();
  }
});
// #endregion ruta

// #region limites
test('la pregunta 21 de un cliente en 10 minutos: 429 con Retry-After, y al modelo no le llega', async () => {
  for (let vez = 1; vez <= 20; vez++) {
    modelo.guion(texto('Vale'));
    const res = await preguntar(hola);
    assert.equal(res.status, 200, `pregunta ${vez}`);
    assert.match(res.headers.get('ratelimit')!, new RegExp(`"asistente-cliente";r=${20 - vez};`));
  }
  const res = await preguntar(hola);
  assert.equal(res.status, 429);
  assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
  assert.equal(
    (await res.clone().json()).type,
    'https://tienda.example/problemas/demasiados-intentos',
  );
  const espera = Number(res.headers.get('retry-after'));
  assert.ok(espera > 0 && espera <= 10 * 60, `Retry-After: ${espera}`);
  assert.equal(
    res.headers.get('ratelimit-policy'),
    '"asistente-cliente";q=20;w=600, "asistente-ip";q=60;w=600',
  );
  await cumpleContrato(res, 'post', '/asistente');
  assert.equal(modelo.peticiones.length, 20);
});

test('desde una IP caben 60 preguntas, de los clientes que sean; desde otra, se sigue preguntando', async () => {
  const ip = '203.0.113.60';
  // Sesenta preguntas desde esa IP (de Carmen, de Pablo, de otras cuentas): apuntadas a mano.
  for (let vez = 0; vez < 60; vez++) await limites.asistentePorIp.apuntar(ip);
  const pregunta = (cabeceras: Record<string, string>, deIp: string) =>
    app.request(
      '/v2/asistente',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabeceras },
        body: JSON.stringify(hola),
      },
      desde(deIp),
    );
  const pablo = await comoUsuario(PABLO);
  const res = await pregunta(pablo, ip);
  assert.equal(res.status, 429);
  assert.match(res.headers.get('ratelimit')!, /"asistente-ip";r=0;/);
  assert.equal(modelo.peticiones.length, 0);
  // Pablo, desde otra IP, sí: su cuenta de cliente está vacía.
  modelo.guion(texto('Vale'));
  assert.equal((await pregunta(pablo, '203.0.113.61')).status, 200);
});
// #endregion limites
