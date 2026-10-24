// Varias copias de la API (Fase 9, lección 3). Cada copia es un proceso con su memoria: lo que
// guarda una, la otra no lo ve. Lo único de la tienda que vivía en la memoria de un proceso eran
// los avisos de los cambios de los pedidos (eventos-pedidos.ts), y con REDIS_URL van por Redis.
// Los tests que necesitan Redis usan el de REDIS_URL_TESTS (test/.env): sin esa variable, se saltan.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  type AddressInfo,
  connect as conectarTcp,
  createServer as crearServidorTcp,
  type Socket,
} from 'node:net';
import { test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { conectarRedis } from '../src/almacen-redis.ts';
import type { EstadoPedido, Pedido } from '../src/datos.ts';
import { type CambiosDePedidos, crearCambiosDePedidos } from '../src/eventos-pedidos.ts';
import { usarBd } from './bd.ts';
import { ANA, comoUsuario } from './identidades.ts';

let ana: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
});

const url = process.env.REDIS_URL_TESTS;
const sinRedis = url
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// Un canal para esta pasada de los tests, no tienda:pedidos. Los canales de Redis no son de una
// base (la /1 de la URL): son de todo el servidor. Así, unos tests que se pasan a la vez en otra
// carpeta, contra el mismo Redis, no mandan sus avisos a estos.
const canal = `tienda:pedidos:tests:${randomUUID()}`;

const unPedido = (estado: EstadoPedido, id = 7): Pedido => ({
  id,
  productoId: 1,
  cantidad: 2,
  estado,
  creadoEn: '2026-10-21T09:00:00.000Z',
  clienteId: 3,
});

/** Se apunta a los cambios y junta los que llegan. */
function apuntarse(cambios: CambiosDePedidos) {
  const recibidos: Pedido[] = [];
  const dejar = cambios.escuchar((pedido) => recibidos.push(pedido));
  return { recibidos, dejar };
}

/** Espera hasta que se cumpla la condición, o falla pasado el tiempo. */
async function esperar(condicion: () => boolean, ms: number, que: string) {
  const hasta = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > hasta) assert.fail(`pasados ${ms} ms, aún no: ${que}`);
    await dormir(20);
  }
}

/** Dos copias de la API, cada una con su conexión a Redis, como dos procesos. */
async function dosCopias(urlDeCadaUna: [string, string] = [url!, url!]) {
  const copias = urlDeCadaUna.map((u) => crearCambiosDePedidos(u, canal));
  await Promise.all(copias.map((copia) => copia.listo()));
  return {
    a: copias[0]!,
    b: copias[1]!,
    cerrar: () => Promise.all(copias.map((copia) => copia.cerrar())),
  };
}

// #region en-memoria
test('sin REDIS_URL, los cambios llegan en el mismo proceso', async () => {
  const cambios = crearCambiosDePedidos(undefined, canal);
  const { recibidos } = apuntarse(cambios);
  cambios.emitir(unPedido('pagado'));
  // Enseguida, sin esperar a nada: es un EventEmitter, como hasta la lección 2.
  assert.deepEqual(recibidos, [unPedido('pagado')]);
  assert.equal(cambios.oyentes(), 1);
  await cambios.cerrar();
});
// #endregion en-memoria

// #region de-una-copia-a-otra
test('con REDIS_URL, un cambio emitido en una copia llega a otra', { skip: sinRedis }, async () => {
  const { a, b, cerrar } = await dosCopias();
  try {
    const enB = apuntarse(b);
    a.emitir(unPedido('cancelado'));
    await esperar(() => enB.recibidos.length === 1, 2000, 'el cambio llega a la otra copia');
    // El mismo pedido, con la misma forma: viaja en JSON, y todos sus campos son texto o números.
    assert.deepEqual(enB.recibidos, [unPedido('cancelado')]);
  } finally {
    await cerrar();
  }
});
// #endregion de-una-copia-a-otra

test('dejar de escuchar no recibe más cambios', async (t) => {
  for (const [modo, urlDelModo] of [
    ['en memoria', undefined],
    ['con Redis', url],
  ] as const) {
    await t.test(modo, { skip: modo === 'con Redis' && sinRedis }, async () => {
      const cambios = crearCambiosDePedidos(urlDelModo, canal);
      await cambios.listo();
      try {
        const sigue = apuntarse(cambios);
        const seVa = apuntarse(cambios);
        assert.equal(cambios.oyentes(), 2);
        seVa.dejar();
        assert.equal(cambios.oyentes(), 1);
        cambios.emitir(unPedido('pagado'));
        // Cuando le llega al que sigue, ya le habría llegado al otro.
        await esperar(() => sigue.recibidos.length === 1, 2000, 'el cambio llega al que sigue');
        assert.deepEqual(seVa.recibidos, []);
      } finally {
        await cambios.cerrar();
      }
    });
  }
});

// #region una-sola-vez
test('la copia que hace el cambio lo recibe una sola vez', { skip: sinRedis }, async () => {
  const { a, b, cerrar } = await dosCopias();
  try {
    const enA = apuntarse(a);
    const enB = apuntarse(b);
    a.emitir(unPedido('pagado'));
    a.emitir(unPedido('cancelado'));
    await esperar(() => enA.recibidos.length >= 2 && enB.recibidos.length >= 2, 2000, 'llegan');
    // Un rato más, por si llegara repetido.
    await dormir(200);
    // Por Redis, como a las otras: una vez cada uno, y en el orden en que se emitieron.
    assert.deepEqual(enA.recibidos, [unPedido('pagado'), unPedido('cancelado')]);
    assert.deepEqual(enB.recibidos, enA.recibidos);
  } finally {
    await cerrar();
  }
});
// #endregion una-sola-vez

// #region no-es-un-pedido
test('un mensaje del canal que no es un pedido se ignora', { skip: sinRedis }, async () => {
  const { a, b, cerrar } = await dosCopias();
  const otro = conectarRedis(url!);
  try {
    const enB = apuntarse(b);
    // Como la ruta de los eventos (v2.ts): una función async que lee el id. Si le llegara null, el
    // error de leer null.id, sin nadie que lo recoja, pararía Node.
    const ids: number[] = [];
    b.escuchar(async (pedido) => {
      ids.push(pedido.id);
    });
    // Cualquiera con acceso a ese Redis puede publicar en el canal: texto, JSON que no es un objeto,
    // un objeto vacío, o uno con id pero sin el resto.
    for (const mensaje of ['esto no es JSON', 'null', '{}', '{"id":7,"estado":5}']) {
      await otro.publish(canal, mensaje);
    }
    a.emitir(unPedido('pagado'));
    await esperar(() => enB.recibidos.length === 1, 2000, 'el pedido llega');
    assert.deepEqual(enB.recibidos, [unPedido('pagado')]);
    assert.deepEqual(ids, [7]);
  } finally {
    await otro.close();
    await cerrar();
  }
});
// #endregion no-es-un-pedido

/**
 * Un intermediario entre el cliente y el Redis de los tests, para cortar la red un rato: cortar()
 * cierra las conexiones y deja de aceptar otras; abrir() vuelve a aceptarlas, en el mismo puerto.
 */
async function redisConCorte(destino: string) {
  const { hostname, port, pathname } = new URL(destino);
  const conexiones = new Set<Socket>();
  let puerto = 0;
  const abrirServidor = () =>
    crearServidorTcp((entrada) => {
      const salida = conectarTcp(Number(port || 6379), hostname);
      for (const conexion of [entrada, salida]) {
        conexiones.add(conexion);
        conexion.on('error', () => {});
        conexion.on('close', () => {
          entrada.destroy();
          salida.destroy();
        });
      }
      entrada.pipe(salida).pipe(entrada);
    }).listen(puerto, '127.0.0.1');
  let servidor = abrirServidor();
  await once(servidor, 'listening');
  puerto = (servidor.address() as AddressInfo).port;
  return {
    url: `redis://127.0.0.1:${puerto}${pathname}`,
    cortar() {
      servidor.close();
      for (const conexion of conexiones) conexion.destroy();
      conexiones.clear();
    },
    async abrir() {
      servidor = abrirServidor();
      await once(servidor, 'listening');
    },
  };
}

// #region corte
test('después de un corte con Redis, la copia vuelve a recibir', { skip: sinRedis }, async () => {
  const red = await redisConCorte(url!);
  // b escucha a través del intermediario; a publica directamente.
  const { a, b, cerrar } = await dosCopias([url!, red.url]);
  try {
    const enB = apuntarse(b);
    // Lo que pasa mientras está cortado no le llega: al volver, avisa a quien escucha de que ha
    // podido perder cambios.
    let avisosDePerdidos = 0;
    b.escuchar(
      () => {},
      () => avisosDePerdidos++,
    );
    a.emitir(unPedido('pagado'));
    await esperar(() => enB.recibidos.length === 1, 2000, 'antes del corte');
    red.cortar();
    await dormir(200);
    await red.abrir();
    // El cliente se conecta otra vez solo, y se suscribe otra vez al canal solo. Hasta que lo hace,
    // lo que se publica no le llega (Redis no guarda los mensajes de un canal): se repite hasta
    // que llega uno.
    await esperar(
      () => {
        a.emitir(unPedido('cancelado'));
        return enB.recibidos.length > 1;
      },
      5000,
      'después del corte',
    );
    assert.deepEqual(enB.recibidos.at(-1), unPedido('cancelado'));
    await esperar(() => avisosDePerdidos === 1, 2000, 'el aviso de cambios perdidos');
  } finally {
    await cerrar();
    red.cortar();
  }
});
// #endregion corte

// #region corte-publicar
test(
  'con la conexión cortada, emitir falla al momento: nada sale tarde',
  { skip: sinRedis },
  async () => {
    const red = await redisConCorte(url!);
    // a publica a través del intermediario; b escucha directamente.
    const { a, b, cerrar } = await dosCopias([red.url, url!]);
    const avisos: string[] = [];
    const alAvisar = (aviso: Error) => avisos.push(aviso.name);
    process.on('warning', alAvisar);
    try {
      const enB = apuntarse(b);
      a.emitir(unPedido('pendiente', 8));
      await esperar(() => enB.recibidos.length === 1, 2000, 'antes del corte');
      // Se corta la conexión de a, y mientras está cortada, a avisa veinte veces de un cambio. Si esos
      // avisos esperaran a que volviera la conexión, saldrían tarde, quizá después de uno más nuevo
      // de otra copia, y cada uno dejaría dos oyentes esperando en el cliente.
      red.cortar();
      await dormir(100);
      for (let i = 0; i < 20; i++) a.emitir(unPedido('pagado', 8));
      await red.abrir();
      // La conexión vuelve: lo que se avisa ahora sí llega (se repite hasta que llega uno).
      await esperar(
        () => {
          a.emitir(unPedido('cancelado', 9));
          return enB.recibidos.some((pedido) => pedido.id === 9);
        },
        5000,
        'después del corte',
      );
      await dormir(200);
      // Ninguno de los veinte ha salido, ni antes ni después de volver.
      assert.deepEqual(
        enB.recibidos.filter((pedido) => pedido.id === 8),
        [unPedido('pendiente', 8)],
      );
      assert.deepEqual(avisos, []);
    } finally {
      process.off('warning', alAvisar);
      await cerrar();
      red.cortar();
    }
  },
);
// #endregion corte-publicar

/** Un puerto libre en 127.0.0.1: nadie escucha en él. */
async function puertoLibre(): Promise<number> {
  const libre = crearServidorTcp().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as AddressInfo).port;
  libre.close();
  await once(libre, 'close');
  return puerto;
}

/**
 * Arranca una copia de la API en un puerto libre, con el entorno de los tests más el que se le dé
 * (sin REDIS_URL, SMTP_URL ni CACHE_URL salvo que se pongan), y junta lo que escribe en el log.
 * esperarA: el texto del log que dice que está lista.
 */
async function arrancarApi(entorno: Record<string, string>, esperarA = 'La tienda escucha') {
  const puerto = await puertoLibre();
  const { REDIS_URL: _r, SMTP_URL: _s, CACHE_URL: _c, ...base } = process.env;
  const proceso: ChildProcessWithoutNullStreams = spawn('node', ['src/servidor.ts'], {
    env: { ...base, LOG_LEVEL: 'info', PORT: String(puerto), CANAL_PEDIDOS: canal, ...entorno },
  });
  let salida = '';
  proceso.stdout.on('data', (trozo) => (salida += trozo));
  proceso.stderr.on('data', (trozo) => (salida += trozo));
  try {
    await esperar(() => salida.includes(esperarA), 10_000, `la API arranca (${esperarA})`);
  } catch (error) {
    proceso.kill();
    throw error;
  }
  return { proceso, salida: () => salida, url: `http://127.0.0.1:${puerto}` };
}

async function parar(proceso: ChildProcessWithoutNullStreams) {
  if (proceso.exitCode !== null) return;
  proceso.kill();
  await once(proceso, 'exit');
}

type Lector = ReadableStreamDefaultReader<string>;

/** Abre el flujo de eventos de un pedido en esa copia. */
async function seguir(api: string, id: number): Promise<Lector> {
  const res = await fetch(`${api}/v2/pedidos/${id}/eventos`, { headers: ana });
  assert.equal(res.status, 200);
  return res.body!.pipeThrough(new TextDecoderStream()).getReader();
}

/** El siguiente evento del flujo (hasta una línea en blanco), o falla si no llega a tiempo. */
async function siguienteEvento(lector: Lector, ms = 3000): Promise<Pedido> {
  let texto = '';
  const hasta = Date.now() + ms;
  while (!texto.includes('\n\n')) {
    const leido = await Promise.race([lector.read(), dormir(hasta - Date.now(), 'tarde' as const)]);
    if (leido === 'tarde') assert.fail(`pasados ${ms} ms, no llega ningún evento`);
    if (leido.done) throw new Error('El flujo se ha cerrado');
    texto += leido.value;
  }
  return JSON.parse(texto.match(/^data: (.*)$/m)![1]!) as Pedido;
}

const cancelar = (api: string, id: number) =>
  // Con un límite: si la respuesta esperara a un Redis colgado, el test falla en vez de quedarse
  // esperando.
  fetch(`${api}/v2/pedidos/${id}/cancelacion`, {
    method: 'POST',
    headers: ana,
    signal: AbortSignal.timeout(3000),
  });

// #region flujo-otra-copia
test('el flujo de eventos recibe un cambio hecho por otra copia', { skip: sinRedis }, async () => {
  // Dos copias de la API, dos procesos, con el mismo Redis: como docker compose up --scale api=2.
  const [a, b] = await Promise.all([
    arrancarApi({ REDIS_URL: url! }),
    arrancarApi({ REDIS_URL: url! }),
  ]);
  try {
    // Ana sigue el pedido 22 en la copia a, y lo cancela a través de la copia b. La copia a se
    // suscribe al canal con el primero que escucha, y lo dice en el log.
    const lector = await seguir(a.url, 22);
    assert.equal((await siguienteEvento(lector)).estado, 'pendiente');
    await esperar(() => a.salida().includes('escucha el canal'), 2000, 'la copia a escucha');
    assert.equal((await cancelar(b.url, 22)).status, 200);
    const cambio = await siguienteEvento(lector);
    assert.equal(cambio.id, 22);
    assert.equal(cambio.estado, 'cancelado');
    await lector.cancel();

    // Y un cambio hecho en la misma copia llega una vez, no dos.
    const mismo = await seguir(a.url, 21);
    await siguienteEvento(mismo);
    assert.equal((await cancelar(a.url, 21)).status, 200);
    assert.equal((await siguienteEvento(mismo)).estado, 'cancelado');
    await assert.rejects(siguienteEvento(mismo, 300), /no llega ningún evento/);
    await mismo.cancel();
  } finally {
    await Promise.all([parar(a.proceso), parar(b.proceso)]);
  }
});
// #endregion flujo-otra-copia

// #region flujo-se-cierra
test(
  'si Redis se corta y vuelve, el flujo de eventos se cierra para que el cliente se conecte otra vez',
  { skip: sinRedis },
  async () => {
    const red = await redisConCorte(url!);
    const api = await arrancarApi({ REDIS_URL: red.url });
    try {
      const lector = await seguir(api.url, 20);
      assert.equal((await siguienteEvento(lector)).estado, 'pagado');
      await esperar(() => api.salida().includes('escucha el canal'), 2000, 'la API escucha');
      // Mientras está cortado, los cambios no llegan. Al volver, la API no sabe qué se ha perdido:
      // cierra la respuesta, y EventSource se conecta otra vez solo y recibe el estado de ahora.
      red.cortar();
      await dormir(200);
      await red.abrir();
      await assert.rejects(siguienteEvento(lector, 5000), /El flujo se ha cerrado/);
      assert.match(api.salida(), /Redis contesta otra vez/);
    } finally {
      await parar(api.proceso);
      red.cortar();
    }
  },
);
// #endregion flujo-se-cierra

// #region redis-caido
test('con Redis caído, cancelar contesta igual, y el log lo dice una vez', async () => {
  // Nadie escucha en ese puerto: Redis no está.
  const api = await arrancarApi({ REDIS_URL: `redis://127.0.0.1:${await puertoLibre()}` });
  try {
    for (const id of [23, 24]) {
      const desde = performance.now();
      const res = await cancelar(api.url, id);
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as Pedido).estado, 'cancelado');
      assert.ok(performance.now() - desde < 1000, `${performance.now() - desde} ms`);
    }
    // El cliente lo intenta otra vez cada poco, y falla cada vez: el aviso sale una sola vez.
    await dormir(1000);
    const avisos = api.salida().match(/avisos de los pedidos no pueden ir por Redis/g) ?? [];
    assert.equal(avisos.length, 1, api.salida());
  } finally {
    await parar(api.proceso);
  }
});
// #endregion redis-caido

/** La primera orden RESP completa del texto: su nombre y cuántos caracteres ocupa. */
function leerOrden(texto: string): { nombre: string; largo: number } | undefined {
  const cabecera = /^\*(\d+)\r\n/.exec(texto);
  if (!cabecera) return undefined;
  let posicion = cabecera[0].length;
  const partes: string[] = [];
  for (let i = 0; i < Number(cabecera[1]); i++) {
    const tamano = /^\$(\d+)\r\n/.exec(texto.slice(posicion));
    if (!tamano) return undefined;
    const desde = posicion + tamano[0].length;
    const hasta = desde + Number(tamano[1]);
    if (texto.length < hasta + 2) return undefined;
    partes.push(texto.slice(desde, hasta));
    posicion = hasta + 2;
  }
  return { nombre: partes[0]!.toUpperCase(), largo: posicion };
}

/**
 * Un Redis de mentira que se cuelga a medias, como un Redis parado (docker pause): contesta +OK a
 * lo que el cliente manda al conectarse, y la primera orden de los avisos (SUBSCRIBE o PUBLISH) la
 * recibe y no la contesta, ni nada más en esa conexión. Para el cliente, la conexión está bien.
 */
async function redisColgado() {
  const conexiones = new Set<Socket>();
  const recibidas: string[] = [];
  const servidor = crearServidorTcp((conexion) => {
    conexiones.add(conexion);
    let resto = '';
    let muda = false;
    conexion.on('data', (trozo) => {
      resto += trozo.toString('latin1');
      for (;;) {
        const orden = leerOrden(resto);
        if (!orden) break;
        resto = resto.slice(orden.largo);
        recibidas.push(orden.nombre);
        if (['SUBSCRIBE', 'PUBLISH'].includes(orden.nombre)) muda = true;
        if (!muda) conexion.write('+OK\r\n');
      }
    });
  }).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  return {
    url: `redis://127.0.0.1:${(servidor.address() as AddressInfo).port}`,
    recibidas,
    cerrar() {
      for (const conexion of conexiones) conexion.destroy();
      servidor.close();
    },
  };
}

// #region redis-colgado
test('con Redis colgado, cancelar tampoco espera', async () => {
  const colgado = await redisColgado();
  const api = await arrancarApi({ REDIS_URL: colgado.url });
  try {
    const desde = performance.now();
    const res = await cancelar(api.url, 25);
    assert.equal(res.status, 200);
    assert.ok(performance.now() - desde < 1000, `${performance.now() - desde} ms`);
    // El aviso salió hacia Redis: es Redis quien no contesta, y la respuesta no lo espera.
    await esperar(() => colgado.recibidas.includes('PUBLISH'), 2000, 'PUBLISH llega a Redis');
  } finally {
    await parar(api.proceso);
    colgado.cerrar();
  }
});
// #endregion redis-colgado
