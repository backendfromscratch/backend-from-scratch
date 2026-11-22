// El asistente en streaming (Fase 11, lección 2): POST /v2/asistente con Accept: text/event-stream,
// contra el modelo falso (modelo-falso.ts). Como en asistente.test.ts, primero se arranca el modelo
// falso y después se importa la tienda: el SDK lee ANTHROPIC_BASE_URL al crear el cliente.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { TEXTO_RECHAZO } from '../src/asistente/conversacion.ts';
import { ESPERA_POR_DEFECTO, falloDelModelo, noDisponible } from '../src/asistente/errores.ts';
import { comoSSE, eventoDeLaTienda } from '../src/asistente/eventos.ts';
import { usarBd } from './bd.ts';
import { CARMEN, comoUsuario } from './identidades.ts';
import {
  arrancarModeloFalso,
  demasiadasPeticiones,
  errorDeLaApi,
  errorEnElFlujo,
  rechazo,
  silencio,
  texto,
} from './modelo-falso.ts';

const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());
const { app } = await import('../src/app.ts');
const { log } = await import('../src/log.ts');
const { cumpleContrato } = await import('./contrato.ts');
const { almacen, crearAlmacenEnMemoria } = await import('../src/limites.ts');

// Cada test empieza sin preguntas apuntadas en los límites (limites.ts), como en asistente.test.ts.
beforeEach(() => Object.assign(almacen, crearAlmacenEnMemoria()));

let carmen: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
});

const hola = { mensajes: [{ rol: 'usuario', texto: 'Hola, ¿me ayudas con una compra?' }] };

// La pregunta, pidiendo la respuesta en streaming (o con el Accept que se diga).
const preguntar = (
  cuerpo: unknown = hola,
  accept = 'text/event-stream',
  cabeceras: Record<string, string> = carmen,
) =>
  app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...cabeceras },
    body: JSON.stringify(cuerpo),
  });

type Evento = { evento: string; datos: any };

// Un flujo entero, leído hasta que se cierra: sus eventos, en orden, con los datos ya leídos.
function leerEventos(texto: string): Evento[] {
  return texto
    .split('\n\n')
    .filter((bloque) => bloque !== '')
    .map((bloque) => ({
      evento: bloque.match(/^event: (.*)$/m)![1]!,
      datos: JSON.parse(bloque.match(/^data: (.*)$/m)![1]!),
    }));
}

type Lector = ReadableStreamDefaultReader<string>;

// El siguiente evento de un flujo que aún no ha acabado (como en tiempo-real.test.ts).
async function siguienteEvento(lector: Lector): Promise<Evento> {
  let leido = '';
  while (!leido.includes('\n\n')) {
    const { value, done } = await lector.read();
    if (done) throw new Error('El flujo se ha cerrado');
    leido += value;
  }
  return leerEventos(leido)[0]!;
}

// Lo que un test mira del log: las llamadas con ese mensaje (registro también escribe una línea
// info por cada petición).
const conMensaje = (espia: ReturnType<typeof mock.method>, mensaje: string) =>
  espia.mock.calls.filter((llamada) => llamada.arguments[1] === mensaje);

// Espera a que pase algo en otro sitio (en el modelo falso, en el log), como mucho un segundo.
async function hastaQue(condicion: () => boolean) {
  for (let ms = 0; !condicion(); ms += 10) {
    if (ms >= 1000) throw new Error('No se ha cumplido en un segundo');
    await dormir(10);
  }
}

// #region puras
// Un evento del modelo, como lo da el SDK, con lo que hace falta para eventoDeLaTienda.
const delModelo = (evento: object) => evento as Anthropic.MessageStreamEvent;

test('eventoDeLaTienda: un trozo de texto del modelo es un evento texto de la tienda', () => {
  const trozo = delModelo({
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: '¡Hola! ' },
  });
  assert.deepEqual(eventoDeLaTienda(trozo), { evento: 'texto', datos: { texto: '¡Hola! ' } });
});

test('eventoDeLaTienda: los demás eventos del modelo se quedan en la tienda (undefined)', () => {
  const otros = [
    { type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 9 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    // Lo que piensa el modelo antes de contestar, y su firma: no es para el cliente.
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Mmm' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'f' } },
    // Lo que pasa a una herramienta (lección 3), a trozos.
    {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{' },
    },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  for (const evento of otros) assert.equal(eventoDeLaTienda(delModelo(evento)), undefined);
});

test('comoSSE: el nombre del evento y sus datos en JSON, en una sola línea aunque el texto tenga varias', () => {
  assert.deepEqual(comoSSE({ evento: 'texto', datos: { texto: 'Hola,\nCarmen' } }), {
    event: 'texto',
    data: '{"texto":"Hola,\\nCarmen"}',
  });
  const fin = { texto: 'Hola', rechazada: false, uso: { entrada: 10, salida: 2 } };
  assert.deepEqual(comoSSE({ evento: 'fin', datos: fin }), {
    event: 'fin',
    data: JSON.stringify(fin),
  });
});

test('falloDelModelo: un evento error en mitad del flujo (sin código de estado) se lee por su tipo', () => {
  // Como los lanza el SDK al leer un evento error: status undefined y, en type, el tipo del error.
  const enElFlujo = (tipoError: string) =>
    new Anthropic.APIError(
      undefined,
      { type: 'error', error: { type: tipoError, message: '…' } },
      undefined,
      new Headers(),
    );
  assert.deepEqual(falloDelModelo(enElFlujo('overloaded_error')), {
    estado: 503,
    reintentarEn: ESPERA_POR_DEFECTO,
    detalle: 'El modelo está sobrecargado',
  });
  assert.deepEqual(falloDelModelo(enElFlujo('api_error')), {
    estado: 503,
    reintentarEn: ESPERA_POR_DEFECTO,
    detalle: 'El modelo está sobrecargado',
  });
  assert.match(
    (falloDelModelo(enElFlujo('rate_limit_error')) as { detalle: string }).detalle,
    /demasiadas peticiones/,
  );
  // Cualquier otro tipo es un fallo de la tienda, como un 400.
  assert.deepEqual(falloDelModelo(enElFlujo('invalid_request_error')), { estado: 500 });
});

test('falloDelModelo: un corte de la red en mitad del flujo (AnthropicError con cause) es pasajero', () => {
  // Como lo lanza el SDK: el error de la red (undici dice «terminated») dentro, en cause.
  const corte = new Anthropic.AnthropicError('terminated', { cause: new TypeError('terminated') });
  assert.deepEqual(falloDelModelo(corte), {
    estado: 503,
    reintentarEn: ESPERA_POR_DEFECTO,
    detalle: 'El modelo no contesta',
  });
  // Un AnthropicError sin causa no se sabe qué es: sigue su camino, como un fallo de la tienda.
  assert.equal(falloDelModelo(new Anthropic.AnthropicError('otra cosa')), undefined);
});

test('noDisponible: el problema de un fallo pasajero, el mismo con y sin streaming', () => {
  assert.deepEqual(
    noDisponible({ estado: 503, reintentarEn: 17, detalle: 'El modelo no contesta' }),
    {
      type: 'https://tienda.example/problemas/asistente-no-disponible',
      title: 'El asistente no está disponible ahora',
      status: 503,
      detail: 'El modelo no contesta: vuelve a intentarlo en 17 segundos',
    },
  );
});
// #endregion puras

// #region flujo
test('con Accept: text/event-stream, eventos texto en orden y un fin con la respuesta entera y los tokens', async () => {
  const respuesta = 'Claro, Carmen. Tenemos tazas, camisetas, sudaderas y gorras: ¿qué buscas?';
  modelo.guion(texto(respuesta, { uso: { entrada: 412, salida: 38 } }));
  const res = await preguntar();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const eventos = leerEventos(await res.text());

  // Primero, los trozos de texto (más de uno), y lo último, fin. Nada más: ni un evento del modelo.
  const nombres = eventos.map(({ evento }) => evento);
  assert.equal(nombres.at(-1), 'fin');
  assert.ok(nombres.slice(0, -1).every((nombre) => nombre === 'texto'));
  assert.ok(nombres.length > 2);
  // Los trozos, juntos, son la respuesta; y fin la trae entera, con los tokens.
  const trozos = eventos.slice(0, -1).map(({ datos }) => datos.texto);
  assert.equal(trozos.join(''), respuesta);
  const fin = eventos.at(-1)!.datos;
  assert.deepEqual(fin, { texto: respuesta, rechazada: false, uso: { entrada: 412, salida: 38 } });
  // Los datos de fin son una RespuestaAsistente: la misma forma que el 200 en JSON, en el contrato.
  await cumpleContrato(Response.json(fin), 'post', '/asistente');
});

test('la petición en streaming: la misma que sin él (modelo, instrucciones, esfuerzo, tope), con stream: true', async () => {
  modelo.guion(texto('Sí, puedes devolverla.'));
  await (
    await preguntar({ mensajes: [{ rol: 'usuario', texto: '¿Puedo devolver una taza?' }] })
  ).text();
  assert.equal(modelo.peticiones.length, 1);
  assert.deepEqual(modelo.peticiones[0]!.cuerpo, {
    model: 'claude-haiku-5-5',
    max_tokens: 2048,
    system: await readFile('src/asistente/instrucciones.md', 'utf8'),
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: '¿Puedo devolver una taza?' }],
    stream: true,
  });
});

test('sin pedir el flujo (application/json, */* como curl), la respuesta entera en JSON, como en la lección 1', async () => {
  for (const accept of ['application/json', '*/*', 'text/event-stream;q=0, application/json']) {
    modelo.guion(texto('¡Hola, Carmen!', { uso: { entrada: 300, salida: 6 } }));
    const res = await preguntar(hola, accept);
    assert.equal(res.status, 200, accept);
    assert.match(res.headers.get('content-type')!, /^application\/json/);
    assert.deepEqual(await res.clone().json(), {
      texto: '¡Hola, Carmen!',
      rechazada: false,
      uso: { entrada: 300, salida: 6 },
    });
    await cumpleContrato(res, 'post', '/asistente');
    // Sin stream en la petición al modelo.
    assert.ok(!('stream' in modelo.peticiones.at(-1)!.cuerpo));
  }
});

test('el cliente se va a medias: la tienda cancela la llamada, el modelo falso ve la conexión cortada, y una línea en el log', async () => {
  const info = mock.method(log, 'info', () => {});
  try {
    const larga =
      'Te cuento todo lo que tenemos para el frío, prenda por prenda, sin dejarme nada.';
    modelo.guion(texto(larga, { pausa: 30 }));
    const res = await preguntar();
    const lector = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const primero = await siguienteEvento(lector);
    assert.equal(primero.evento, 'texto');
    // El cliente cierra la pestaña.
    await lector.cancel();
    // La cancelación llega hasta la llamada al modelo: el modelo falso no termina de mandarlo todo.
    assert.equal(await modelo.peticiones[0]!.acabada, 'cortada');
    const avisos = conMensaje(info, 'el cliente se ha ido: se cancela la llamada al modelo');
    assert.equal(avisos.length, 1);
    assert.ok((avisos[0]!.arguments[0] as { requestId: string }).requestId);
  } finally {
    info.mock.restore();
  }
});

// Con la tienda escuchando de verdad, en un puerto libre, como en asistente.test.ts: antes del
// primer evento la tienda aún no ha empezado el flujo, y quien ve que el cliente se va es
// @hono/node-server.
test('el cliente se va antes del primer evento: la tienda cancela la llamada al modelo al momento', async () => {
  const info = mock.method(log, 'info', () => {});
  const servidor = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  try {
    await once(servidor, 'listening');
    const { port } = servidor.address() as AddressInfo;
    modelo.guion(silencio());
    const irse = new AbortController();
    const peticion = fetch(`http://127.0.0.1:${port}/v2/asistente`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...carmen },
      body: JSON.stringify(hola),
      signal: irse.signal,
    });
    await hastaQue(() => modelo.peticiones.length === 1);
    const antes = performance.now();
    irse.abort();
    await assert.rejects(peticion, { name: 'AbortError' });
    // Mucho antes de los 2 s de MODELO_TIEMPO_MAXIMO_MS en los tests.
    assert.equal(await modelo.peticiones[0]!.acabada, 'cortada');
    assert.ok(performance.now() - antes < 1000, `${performance.now() - antes} ms`);
    const mensaje = 'el cliente se ha ido: se cancela la llamada al modelo';
    await hastaQue(() => conMensaje(info, mensaje).length === 1);
  } finally {
    info.mock.restore();
    servidor.close();
  }
});

test('el tiempo máximo del asistente (3 s en los tests) se cumple a medias: un evento error con el 503, no un cliente que se va', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  const info = mock.method(log, 'info', () => {});
  try {
    // Unos 30 trozos, uno cada 150 ms: más de 4 segundos.
    modelo.guion(texto('Te lo cuento despacio, palabra por palabra. '.repeat(6), { pausa: 150 }));
    const res = await preguntar();
    assert.equal(res.status, 200);
    const eventos = leerEventos(await res.text());
    const nombres = eventos.map(({ evento }) => evento);
    assert.ok(nombres.filter((nombre) => nombre === 'texto').length > 3);
    assert.equal(nombres.at(-1), 'error');
    assert.ok(!nombres.includes('fin'));
    assert.equal(eventos.at(-1)!.datos.status, 503);
    assert.match(eventos.at(-1)!.datos.detail, /no contesta/);
    // La llamada al modelo se ha cancelado, como cuando el cliente se va; pero el cliente sigue ahí,
    // y lo que sale en el log es que el modelo no está disponible.
    assert.equal(await modelo.peticiones[0]!.acabada, 'cortada');
    assert.equal(
      conMensaje(info, 'el cliente se ha ido: se cancela la llamada al modelo').length,
      0,
    );
    assert.equal(conMensaje(aviso, 'el modelo no está disponible').length, 1);
  } finally {
    aviso.mock.restore();
    info.mock.restore();
  }
});

test('el modelo se niega en streaming: fin con rechazada y la frase fija, y un aviso en el log', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(rechazo('cyber'));
    const eventos = leerEventos(await (await preguntar()).text());
    const fin = eventos.at(-1)!;
    assert.equal(fin.evento, 'fin');
    assert.equal(fin.datos.rechazada, true);
    assert.equal(fin.datos.texto, TEXTO_RECHAZO);
    const avisos = conMensaje(aviso, 'el modelo se ha negado a contestar');
    assert.equal(avisos.length, 1);
    assert.equal((avisos[0]!.arguments[0] as { categoria: string }).categoria, 'cyber');
  } finally {
    aviso.mock.restore();
  }
});
// #endregion flujo

// #region errores
test('un 429 antes de empezar: un 503 normal, en JSON y con Retry-After, no un flujo', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(demasiadasPeticiones(17));
    const res = await preguntar();
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '17');
    assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
    const problema = await res.clone().json();
    assert.equal(problema.type, 'https://tienda.example/problemas/asistente-no-disponible');
    assert.match(problema.detail, /demasiadas peticiones.*17 segundos/);
    await cumpleContrato(res, 'post', '/asistente');
    assert.equal(conMensaje(aviso, 'el modelo no está disponible').length, 1);
  } finally {
    aviso.mock.restore();
  }
});

test('la API rechaza la petición antes de empezar (400): el 500 de siempre, en el log', async () => {
  const errores = mock.method(log, 'error', () => {});
  try {
    modelo.guion(errorDeLaApi(400, 'invalid_request_error', 'max_tokens: too large'));
    const res = await preguntar();
    assert.equal(res.status, 500);
    assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
    assert.doesNotMatch(await res.text(), /max_tokens/);
    const rechazos = conMensaje(errores, 'la API del modelo ha rechazado la petición de la tienda');
    assert.equal(rechazos.length, 1);
  } finally {
    errores.mock.restore();
  }
});

test('un error a medias (la API se sobrecarga): el texto que ya llegó, un evento error con el problema y el flujo cerrado', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(errorEnElFlujo('Claro, te cuento lo que tenemos'));
    const res = await preguntar();
    // La respuesta ya había empezado: su código es 200, y el error llega como un evento.
    assert.equal(res.status, 200);
    const eventos = leerEventos(await res.text());
    const nombres = eventos.map(({ evento }) => evento);
    assert.equal(nombres.at(-1), 'error');
    assert.ok(!nombres.includes('fin'));
    assert.equal(
      eventos
        .filter(({ evento }) => evento === 'texto')
        .map(({ datos }) => datos.texto)
        .join(''),
      'Claro, te cuento lo que tenemos',
    );
    const problema = eventos.at(-1)!.datos;
    assert.deepEqual(problema, {
      type: 'https://tienda.example/problemas/asistente-no-disponible',
      title: 'El asistente no está disponible ahora',
      status: 503,
      detail: `El modelo está sobrecargado: vuelve a intentarlo en ${ESPERA_POR_DEFECTO} segundos`,
    });
    // Los datos del evento error son un Problema del contrato, como el cuerpo del 503.
    await cumpleContrato(
      Response.json(problema, {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      }),
      'post',
      '/asistente',
    );
    assert.equal(conMensaje(aviso, 'el modelo no está disponible').length, 1);
  } finally {
    aviso.mock.restore();
  }
});

test('la conexión con el modelo se corta a medias: un evento error con el 503 de «no contesta»', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(errorEnElFlujo('Claro, te cuento', 'corte'));
    const eventos = leerEventos(await (await preguntar()).text());
    assert.deepEqual(
      eventos.map(({ evento }) => evento),
      [...eventos.slice(0, -1).map(() => 'texto'), 'error'],
    );
    assert.equal(eventos.at(-1)!.datos.status, 503);
    assert.match(eventos.at(-1)!.datos.detail, /no contesta/);
    assert.equal(conMensaje(aviso, 'el modelo no está disponible').length, 1);
  } finally {
    aviso.mock.restore();
  }
});

test('con Accept: text/event-stream, lo que falla antes de preguntar al modelo es la respuesta de error de siempre', async () => {
  // Una conversación que no vale: 422, sin preguntar al modelo.
  const noVale = await preguntar({ mensajes: [] });
  assert.equal(noVale.status, 422);
  await cumpleContrato(noVale, 'post', '/asistente');
  // Sin sesión: 401.
  const sinSesion = await preguntar(hola, 'text/event-stream', {});
  assert.equal(sinSesion.status, 401);
  await cumpleContrato(sinSesion, 'post', '/asistente');
  assert.equal(modelo.peticiones.length, 0);
});
// #endregion errores
