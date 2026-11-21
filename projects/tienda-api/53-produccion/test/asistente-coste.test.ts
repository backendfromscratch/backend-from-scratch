// Lo que cuesta el asistente (Fase 11, lección 7): el coste de cada llamada al modelo en el log, los
// tokens de la caché en la respuesta, la marca de la caché en la petición y el presupuesto diario
// de cada cliente. Contra el modelo falso (modelo-falso.ts): primero se arranca, y después se
// importa la tienda, que crea el cliente del SDK con ANTHROPIC_BASE_URL.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { promisify } from 'node:util';
import type Anthropic from '@anthropic-ai/sdk';
import {
  costeEnDolares,
  precioDe,
  SIN_USO,
  sumarUso,
  tokensDe,
  usoDe,
} from '../src/asistente/coste.ts';
import { peticionAlModelo } from '../src/asistente/conversacion.ts';
import {
  crearAlmacenPresupuestoEnMemoria,
  crearPresupuesto,
  diaUtc,
  PresupuestoSinAlmacen,
} from '../src/asistente/presupuesto.ts';
import { PRECIOS } from '../src/config.ts';
import { usarEmbebedor } from '../src/embeddings.ts';
import { usarBd } from './bd.ts';
import { crearEmbebedorFalso } from './embebedor-falso.ts';
import { CARMEN, comoUsuario, PABLO } from './identidades.ts';
import {
  arrancarModeloFalso,
  bloqueHerramienta,
  demasiadasPeticiones,
  mensaje,
  pideHerramientas,
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
const { almacen, crearAlmacenEnMemoria } = await import('../src/limites.ts');
const { almacenPresupuesto, presupuesto } = await import('../src/asistente/presupuesto.ts');
const { crearAlmacenPresupuestoRedis, conectarRedis } = await import('../src/almacen-redis.ts');

// buscar_productos busca por el significado (test/.env): con el embebedor de mentira, nunca el
// modelo de verdad.
usarEmbebedor(crearEmbebedorFalso());

// Cada test, sin preguntas apuntadas en los límites ni tokens en los presupuestos: los dos almacenes
// están en memoria en los tests (no hay REDIS_URL), y se cambian sus funciones por las de unos
// vacíos.
beforeEach(() => {
  Object.assign(almacen, crearAlmacenEnMemoria());
  Object.assign(almacenPresupuesto, crearAlmacenPresupuestoEnMemoria());
});

let carmen: Record<string, string>;
let pablo: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
  pablo = await comoUsuario(PABLO);
});

const preguntar = (
  cabeceras: Record<string, string> = carmen,
  accept = 'application/json',
  textoPregunta = '¿Tenéis tazas?',
) =>
  app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...cabeceras },
    body: JSON.stringify({ mensajes: [{ rol: 'usuario', texto: textoPregunta }] }),
  });

// Los tokens que lleva hoy un cliente en su presupuesto, mirando el almacén.
const gastadosHoy = (clienteId: number) =>
  almacenPresupuesto.gastados(`${clienteId}:${diaUtc(Date.now()).dia}`);

const lineasDe = (espia: ReturnType<typeof mock.method>, mensaje: string) =>
  espia.mock.calls
    .filter((llamada) => llamada.arguments[1] === mensaje)
    .map((llamada) => llamada.arguments[0] as Record<string, any>);

// #region coste
test('usoDe: los cuatro tipos de token de usage, con 0 si los de la caché no vienen', () => {
  const usage = {
    input_tokens: 112,
    output_tokens: 38,
    cache_read_input_tokens: 1650,
    cache_creation_input_tokens: null,
  } as Anthropic.Usage;
  assert.deepEqual(usoDe(usage), {
    entrada: 112,
    salida: 38,
    lecturaCache: 1650,
    escrituraCache: 0,
  });
});

test('costeEnDolares: cada tipo de token a su precio por millón (Haiku 5.5)', () => {
  const haiku = PRECIOS['claude-haiku-5-5']!;
  // Los precios de la página de precios (2026-11-21): la caché, 1,25 y 0,1 veces la entrada.
  assert.deepEqual(haiku, { entrada: 0.1, salida: 0.5, escrituraCache: 0.125, lecturaCache: 0.01 });
  // (1000 × 0,10 + 500 × 0,125 + 2000 × 0,01 + 200 × 0,50) / 1 000 000 = 0,0002825 $
  const uso = { entrada: 1000, salida: 200, lecturaCache: 2000, escrituraCache: 500 };
  assert.equal(costeEnDolares(uso, haiku), 0.0002825);
  // Un millón de tokens de salida, 0,50 $; sin tokens, nada.
  assert.equal(costeEnDolares({ ...SIN_USO, salida: 1_000_000 }, haiku), 0.5);
  assert.equal(costeEnDolares(SIN_USO, haiku), 0);
  // Sin el ruido de los decimales: 3 llamadas de 0,1 $ son 0,3 $, no 0,30000000000000004.
  const unDecimo = { ...SIN_USO, entrada: 1_000_000 };
  const tres = sumarUso(sumarUso(unDecimo, unDecimo), unDecimo);
  assert.equal(costeEnDolares(tres, haiku), 0.3);
});

test('tokensDe: el presupuesto cuenta todo lo que el modelo lee y escribe, con caché o sin ella', () => {
  assert.equal(
    tokensDe({ entrada: 112, salida: 38, lecturaCache: 1650, escrituraCache: 10 }),
    1810,
  );
});

test('precioDe: el del modelo que ha contestado; si no está en PRECIOS, el de MODELO', () => {
  assert.equal(precioDe('claude-sonnet-5-5').entrada, 2);
  assert.equal(precioDe('un-modelo-que-no-existe'), PRECIOS[config.MODELO]);
});

test('un MODELO sin precio en PRECIOS: la tienda no arranca, y dice qué falta', async () => {
  const resultado = await promisify(execFile)(
    'node',
    ['--input-type=module', '-e', "await import('./src/config.ts')"],
    { env: { ...process.env, MODELO: 'claude-otro' } },
  ).catch((error) => error);
  assert.equal(resultado.code, 1);
  assert.match(resultado.stderr, /MODELO: claude-otro no tiene precio/);
});
// #endregion coste

// #region log
test('cada llamada al modelo deja una línea en el log: el requestId, el modelo, el uso y el coste', async () => {
  const info = mock.method(log, 'info', () => {});
  try {
    modelo.guion(
      texto('Sí, la Taza.', {
        uso: { entrada: 1000, salida: 200, lecturaCache: 2000, escrituraCache: 500 },
      }),
    );
    const res = await preguntar();
    assert.equal(res.status, 200);
    const [linea, ...otras] = lineasDe(info, 'llamada al modelo');
    assert.equal(otras.length, 0);
    assert.deepEqual(linea, {
      requestId: res.headers.get('x-request-id'),
      modelo: 'claude-haiku-5-5',
      mensaje: 'msg_falso_1',
      uso: { entrada: 1000, salida: 200, lecturaCache: 2000, escrituraCache: 500 },
      costeUsd: 0.0002825,
    });
    // La conversación no: es del cliente.
    assert.ok(!JSON.stringify(linea).includes('tazas'));
  } finally {
    info.mock.restore();
  }
});

test('con herramientas, una línea por vuelta, y uso suma las dos, también la caché', async () => {
  const info = mock.method(log, 'info', () => {});
  try {
    modelo.guion(
      // La primera vez, las instrucciones y las herramientas se guardan en la caché
      // (escrituraCache); en la segunda vuelta, se leen de ella (lecturaCache).
      mensaje([bloqueHerramienta('buscar_productos', { consulta: 'taza' })], {
        parada: 'tool_use',
        uso: { entrada: 112, salida: 30, escrituraCache: 1650 },
      }),
      texto('Sí, la Taza.', { uso: { entrada: 300, salida: 20, lecturaCache: 1650 } }),
    );
    const res = await preguntar();
    const { uso } = await res.json();
    assert.deepEqual(uso, { entrada: 412, salida: 50, lecturaCache: 1650, escrituraCache: 1650 });
    const lineas = lineasDe(info, 'llamada al modelo');
    assert.deepEqual(
      lineas.map((linea) => linea.mensaje),
      ['msg_falso_1', 'msg_falso_2'],
    );
  } finally {
    info.mock.restore();
  }
});
// #endregion log

// #region cache
test('la marca de la caché: una sola, en las instrucciones (guarda las herramientas y las instrucciones)', () => {
  const peticion = peticionAlModelo(
    [{ role: 'user', content: 'Hola' }],
    'Eres el asistente.',
    { modelo: 'claude-haiku-5-5', esfuerzo: 'low' },
    [{ name: 'buscar', input_schema: { type: 'object' } }],
  );
  assert.deepEqual(peticion.system, [
    { type: 'text', text: 'Eres el asistente.', cache_control: { type: 'ephemeral' } },
  ]);
  // Ni en las herramientas ni en la conversación, que cambia en cada pregunta.
  assert.equal(JSON.stringify(peticion).match(/cache_control/g)!.length, 1);
});

test('en las dos vueltas de una pregunta con herramientas, lo que va antes de la marca es idéntico', async () => {
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_productos', { consulta: 'taza' })),
    texto('Sí, la Taza.'),
  );
  await (await preguntar()).arrayBuffer();
  const [primera, segunda] = modelo.peticiones.map((peticion) => peticion.cuerpo);
  // Lo que la caché guarda: las herramientas y las instrucciones, byte a byte iguales.
  const prefijo = (cuerpo: { tools: unknown; system: unknown }) =>
    JSON.stringify({ tools: cuerpo.tools, system: cuerpo.system });
  assert.equal(prefijo(primera), prefijo(segunda));
  assert.deepEqual(primera.system[0].cache_control, { type: 'ephemeral' });
  // La marca, solo ahí: ni en las herramientas ni en los mensajes.
  for (const cuerpo of [primera, segunda]) {
    assert.ok(!JSON.stringify(cuerpo.tools).includes('cache_control'));
    assert.ok(!JSON.stringify(cuerpo.messages).includes('cache_control'));
  }
});
// #endregion cache

// #region presupuesto-puro
test('diaUtc: el día y su medianoche en UTC, también a fin de mes y de año', () => {
  assert.deepEqual(diaUtc(Date.UTC(2026, 10, 21, 23, 59, 30)), {
    dia: '2026-11-21',
    medianoche: Date.UTC(2026, 10, 22),
  });
  assert.deepEqual(diaUtc(Date.UTC(2026, 11, 31, 12)), {
    dia: '2026-12-31',
    medianoche: Date.UTC(2027, 0, 1),
  });
});

test('el presupuesto: deja pasar hasta llegar al máximo, y entonces dice cuánto falta para medianoche', async () => {
  let ahora = Date.UTC(2026, 10, 21, 23, 59, 0);
  const almacenPrueba = crearAlmacenPresupuestoEnMemoria(() => ahora);
  const p = crearPresupuesto({ maximo: 1000, almacen: almacenPrueba, reloj: () => ahora });
  assert.deepEqual(await p.comprobar(7), {
    permitido: true,
    gastados: 0,
    maximo: 1000,
    reintentarEn: 0,
  });
  await p.cobrar(7, 600);
  assert.equal((await p.comprobar(7)).permitido, true);
  // La última pregunta puede pasarse: se mira antes y se cobra después.
  await p.cobrar(7, 600);
  assert.deepEqual(await p.comprobar(7), {
    permitido: false,
    gastados: 1200,
    maximo: 1000,
    reintentarEn: 60,
  });
  // Otro cliente, su propia cuenta.
  assert.equal((await p.comprobar(8)).permitido, true);
  // A medianoche, día nuevo: cuenta nueva.
  ahora = Date.UTC(2026, 10, 22, 0, 0, 1);
  assert.equal((await p.comprobar(7)).gastados, 0);
});

test('el presupuesto, sin almacén que conteste a tiempo: se cierra (lanza), y cobrar solo avisa', async () => {
  const congelado = {
    gastados: () => new Promise<number>(() => {}),
    sumar: () => new Promise<void>(() => {}),
  };
  const p = crearPresupuesto({ maximo: 1000, almacen: congelado, espera: 50 });
  const antes = performance.now();
  await assert.rejects(p.comprobar(7), PresupuestoSinAlmacen);
  assert.ok(performance.now() - antes < 500);
  const aviso = mock.method(log, 'warn', () => {});
  try {
    await p.cobrar(7, 100, { requestId: 'r1' });
    assert.equal(
      lineasDe(aviso, 'no se ha podido apuntar lo gastado en el presupuesto del cliente').length,
      1,
    );
  } finally {
    aviso.mock.restore();
  }
});
// #endregion presupuesto-puro

// #region presupuesto-ruta
test('cada llamada se cobra en el presupuesto del cliente: todos sus tokens, también los de la caché', async () => {
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_productos', { consulta: 'taza' })),
    texto('Sí, la Taza.', { uso: { entrada: 300, salida: 20, lecturaCache: 1650 } }),
  );
  await (await preguntar()).arrayBuffer();
  // 120 + 30 de la primera vuelta (lo que da el modelo falso si no se le dice), y 300 + 20 + 1650.
  assert.equal(await gastadosHoy(CARMEN), 150 + 1970);
  assert.equal(await gastadosHoy(PABLO), 0);
});

test('con el presupuesto de hoy gastado: 429 presupuesto-agotado, Retry-After hasta medianoche, y el modelo ni se entera', async () => {
  await presupuesto.cobrar(CARMEN, config.PRESUPUESTO_TOKENS_DIARIO);
  const res = await preguntar();
  assert.equal(res.status, 429);
  const cuerpo = await res.clone().json();
  assert.equal(cuerpo.type, 'https://tienda.example/problemas/presupuesto-agotado');
  assert.match(cuerpo.detail, /100000 tokens/);
  const { medianoche } = diaUtc(Date.now());
  const segundos = Number(res.headers.get('retry-after'));
  assert.ok(Math.abs(segundos - (medianoche - Date.now()) / 1000) < 5, `${segundos} s`);
  assert.equal(modelo.peticiones.length, 0);
  await cumpleContrato(res, 'post', '/asistente');
  // En streaming, igual: un 429 normal, antes de empezar ningún flujo.
  assert.equal((await preguntar(carmen, 'text/event-stream')).status, 429);
  // Pablo sigue teniendo el suyo.
  modelo.guion(texto('¡Hola, Pablo!'));
  assert.equal((await preguntar(pablo)).status, 200);
});

test('con Redis congelado, el presupuesto se cierra: 503 presupuesto-sin-comprobar, sin llamar al modelo', async () => {
  Object.assign(almacenPresupuesto, { gastados: () => new Promise<number>(() => {}) });
  const aviso = mock.method(log, 'warn', () => {});
  try {
    const antes = performance.now();
    const res = await preguntar();
    assert.ok(performance.now() - antes < 1000);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '5');
    const cuerpo = await res.clone().json();
    assert.equal(cuerpo.type, 'https://tienda.example/problemas/presupuesto-sin-comprobar');
    assert.equal(modelo.peticiones.length, 0);
    await cumpleContrato(res, 'post', '/asistente');
  } finally {
    aviso.mock.restore();
  }
});

test('si cobrar falla, la respuesta llega igual (ya está pagada), y queda un aviso en el log', async () => {
  Object.assign(almacenPresupuesto, { sumar: () => Promise.reject(new Error('Redis caído')) });
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(texto('Sí, la Taza.'));
    const res = await preguntar();
    assert.equal(res.status, 200);
    const [linea] = lineasDe(
      aviso,
      'no se ha podido apuntar lo gastado en el presupuesto del cliente',
    );
    assert.equal(linea!.requestId, res.headers.get('x-request-id'));
    assert.equal(linea!.tokens, 150);
  } finally {
    aviso.mock.restore();
  }
});

test('un flujo que el cliente corta a medias se cobra igual: la entrada, desde el primer evento', async () => {
  modelo.guion(
    texto('Te cuento todo lo que tenemos para el frío, una cosa detrás de otra.', { pausa: 30 }),
  );
  const res = await preguntar(carmen, 'text/event-stream');
  const lector = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let leido = '';
  while (!leido.includes('event: texto')) leido += (await lector.read()).value;
  await lector.cancel();
  assert.equal(await modelo.peticiones[0]!.acabada, 'cortada');
  // Lo que se sabía al cortarse: los 120 de entrada (y el 1 de salida que message_start trae de
  // relleno, hasta que llega el de verdad).
  for (let ms = 0; (await gastadosHoy(CARMEN)) === 0 && ms < 1000; ms += 10) await dormir(10);
  assert.ok((await gastadosHoy(CARMEN)) >= 120, `${await gastadosHoy(CARMEN)} tokens`);
});

test('una llamada que falla antes de contestar (un 429 de la API) no se cobra: la API no la cobra', async () => {
  modelo.guion(demasiadasPeticiones(10));
  assert.equal((await preguntar()).status, 503);
  assert.equal(await gastadosHoy(CARMEN), 0);
});
// #endregion presupuesto-ruta

// #region presupuesto-redis
const url = process.env.REDIS_URL_TESTS;
test(
  'el almacén del presupuesto en Redis: INCRBY suma y PEXPIREAT pone la caducidad',
  { skip: url ? false : 'sin Redis: pon REDIS_URL_TESTS en test/.env para probarlo' },
  async () => {
    const cliente = conectarRedis(url!);
    const prefijo = `prueba-presupuesto-${process.pid}:`;
    try {
      const enRedis = crearAlmacenPresupuestoRedis(cliente, prefijo);
      const caducaEn = Date.now() + 60_000;
      assert.equal(await enRedis.gastados('7:2026-11-21'), 0);
      await enRedis.sumar('7:2026-11-21', 1200, caducaEn);
      await enRedis.sumar('7:2026-11-21', 300, caducaEn);
      assert.equal(await enRedis.gastados('7:2026-11-21'), 1500);
      const quedan = await cliente.pTTL(`${prefijo}7:2026-11-21`);
      assert.ok(quedan > 50_000 && quedan <= 60_000, `${quedan} ms`);
    } finally {
      await cliente.del(`${prefijo}7:2026-11-21`);
      cliente.destroy();
    }
  },
);
// #endregion presupuesto-redis
