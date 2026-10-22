// La caché (Fase 9, lección 2): el catálogo, guardado un rato en otro Redis (CACHE_URL), para no
// preguntar a PostgreSQL lo mismo en cada petición. Los tests que necesitan Redis usan el de
// REDIS_URL_TESTS (test/.env), en la base 2 (la cola usa la 1): sin esa variable, se saltan. Cada
// uno vacía esa base al empezar.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  type AddressInfo,
  connect as conectarTcp,
  createServer as crearServidorTcp,
  type Socket,
} from 'node:net';
import { after, before, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { type ClienteRedis, conectarRedis } from '../src/almacen-redis.ts';
import { pool } from '../src/bd.ts';
import { type Cache, crearCache, duracion } from '../src/cache.ts';
import { usarBd } from './bd.ts';
import { ANA, CARMEN, comoUsuario } from './identidades.ts';

let ana: Record<string, string>;
let carmen: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
});

// El Redis de los tests, en la base 2: redis://servidor:6379/1 pasa a ser redis://servidor:6379/2.
const urlCache = (() => {
  if (!process.env.REDIS_URL_TESTS) return undefined;
  const url = new URL(process.env.REDIS_URL_TESTS);
  url.pathname = '/2';
  return url.toString();
})();
const sinRedis = urlCache
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// Un cliente para mirar dentro de la caché desde los tests: qué claves hay y cuánto les queda.
let redis: ClienteRedis;
before(() => {
  if (urlCache) redis = conectarRedis(urlCache);
});
after(async () => {
  await redis?.close();
});

/** Un puerto libre en 127.0.0.1: nadie escucha en él. */
async function puertoLibre(): Promise<number> {
  const libre = crearServidorTcp().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as AddressInfo).port;
  libre.close();
  await once(libre, 'close');
  return puerto;
}

/** Espera hasta que se cumpla la condición, o falla pasado el tiempo. */
async function esperar(condicion: () => boolean, ms: number, que: string) {
  const hasta = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > hasta) assert.fail(`pasados ${ms} ms, aún no: ${que}`);
    await dormir(50);
  }
}

/** Como esperar, con una condición que pregunta a otro proceso (Redis, la API). */
async function hastaQue(condicion: () => Promise<boolean>, ms: number, que: string) {
  const hasta = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > hasta) assert.fail(`pasados ${ms} ms, aún no: ${que}`);
    await dormir(20);
  }
}

/** Lo que tarda en ms una función asíncrona, y lo que devuelve. */
async function cronometrar<T>(hacer: () => Promise<T>): Promise<{ ms: number; valor: T }> {
  const desde = performance.now();
  const valor = await hacer();
  return { ms: performance.now() - desde, valor };
}

/** Una función de leer de mentira, que cuenta cuántas veces la llaman. */
function espia<T>(valor: T) {
  const leer = async () => {
    leer.veces++;
    return valor;
  };
  leer.veces = 0;
  return leer;
}

// #region sin-cache
test('sin CACHE_URL, lee siempre de la base de datos', async () => {
  const cache = crearCache(undefined);
  const leer = espia({ id: 1, nombre: 'Camiseta' });
  assert.deepEqual(await cache.deCache('productos:1', 60, leer), { id: 1, nombre: 'Camiseta' });
  assert.deepEqual(await cache.deCache('productos:1', 60, leer), { id: 1, nombre: 'Camiseta' });
  assert.equal(leer.veces, 2);
  // Olvidar no hace nada, y no falla.
  await cache.olvidar('productos:1', 'productos:lista:*');
  await cache.cerrar();
});
// #endregion sin-cache

test('la segunda lectura sale de la caché', { skip: sinRedis }, async () => {
  await redis.flushDb();
  const cache = crearCache(urlCache);
  await cache.conectar();
  try {
    const leer = espia([{ id: 1, nombre: 'Camiseta', precioCentimos: 2000 }]);
    const primera = await cache.deCache('productos:lista:{}', 60, leer);
    const segunda = await cache.deCache('productos:lista:{}', 60, leer);
    // La base de datos, una sola vez: la segunda, de Redis. Lo mismo, porque es una copia en JSON.
    assert.equal(leer.veces, 1);
    assert.deepEqual(segunda, primera);
    assert.equal(
      await redis.get('productos:lista:{}'),
      '[{"id":1,"nombre":"Camiseta","precioCentimos":2000}]',
    );
    // Lo que no existe (undefined, un 404) no se guarda: se pregunta cada vez.
    const nada = espia(undefined);
    assert.equal(await cache.deCache('productos:999', 60, nada), undefined);
    assert.equal(await cache.deCache('productos:999', 60, nada), undefined);
    assert.equal(nada.veces, 2);
    // Olvidar una clave, y todas las de un patrón (*).
    await redis.set('productos:lista:{"orden":"precio"}', '[]');
    await redis.set('productos:1', '{}');
    await redis.set('sesiones:otra-cosa', 'x');
    await cache.olvidar('productos:1', 'productos:lista:*');
    assert.deepEqual(await redis.keys('*'), ['sesiones:otra-cosa']);
  } finally {
    await cache.cerrar();
  }
});

// #region ttl
test('el TTL varía un poco para que no caduquen todas a la vez', () => {
  // 60 segundos, más hasta un 10 %: entre 60 000 y 66 000 ms.
  assert.equal(
    duracion(60, () => 0),
    60_000,
  );
  assert.equal(
    duracion(60, () => 0.5),
    63_000,
  );
  assert.ok(duracion(60, () => 0.9999) <= 66_000);
});

test('en Redis, las claves guardadas a la vez caducan repartidas', { skip: sinRedis }, async () => {
  await redis.flushDb();
  const cache = crearCache(urlCache);
  await cache.conectar();
  try {
    // Veinte claves guardadas a la vez, como después de borrar todas las listas.
    for (let i = 0; i < 20; i++) await cache.deCache(`productos:${i}`, 60, async () => ({ i }));
    // deCache guarda sin esperar: la última, en cuanto llegue.
    await hastaQue(async () => (await redis.exists('productos:19')) === 1, 2000, 'la última clave');
    const quedan = await Promise.all(
      Array.from({ length: 20 }, (_, i) => redis.pTTL(`productos:${i}`)),
    );
    for (const ms of quedan) assert.ok(ms > 59_000 && ms <= 66_000, `${ms} ms`);
    // No todas igual: caducan repartidas a lo largo de seis segundos, no en el mismo instante.
    assert.ok(new Set(quedan.map((ms) => Math.round(ms / 100))).size > 5, String(quedan));
  } finally {
    await cache.cerrar();
  }
});
// #endregion ttl

// #region cache-caida
test('con la caché caída, los productos salen de la base de datos', async () => {
  // Una caché que no está: nadie escucha en ese puerto.
  const caida = crearCache(`redis://127.0.0.1:${await puertoLibre()}`);
  try {
    // Abre la conexión y le da tiempo a intentarlo, como en una API que lleva un rato en marcha
    // (conectar no se cumple nunca: no hay nadie).
    void caida.conectar();
    await dormir(300);
    const leer = espia([{ id: 1 }]);
    for (let i = 0; i < 5; i++) {
      // Cada lectura, de la base de datos, y sin esperar a Redis: como mucho, un momento.
      const { ms, valor } = await cronometrar(() => caida.deCache('productos:lista:{}', 60, leer));
      assert.deepEqual(valor, [{ id: 1 }]);
      assert.ok(ms < 500, `${ms} ms`);
    }
    assert.equal(leer.veces, 5);
    // Olvidar falla por dentro, y no lanza: el cambio en la base de datos ya está hecho.
    const { ms } = await cronometrar(() => caida.olvidar('productos:1', 'productos:lista:*'));
    assert.ok(ms < 500, `${ms} ms`);
  } finally {
    await caida.cerrar();
  }

  // Y la API de verdad, con CACHE_URL apuntando a una caché caída: 200, y un aviso en el log.
  const api = await arrancarApi({ CACHE_URL: `redis://127.0.0.1:${await puertoLibre()}` });
  try {
    const { ms, valor: res } = await cronometrar(() => fetch(`${api.url}/v2/productos/1`));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).nombre, 'Camiseta');
    assert.ok(ms < 1000, `${ms} ms`);
    // La conexión se abre con la primera lectura, y el aviso llega en cuanto falla.
    await esperar(() => /"level":40.*caché/.test(api.salida()), 2000, 'el aviso en el log');
  } finally {
    await parar(api.proceso);
  }
});
// #endregion cache-caida

/**
 * Un Redis de mentira que se cuelga a medias, como un Redis parado (docker pause) o una red que
 * pierde lo que va de vuelta. Contesta a lo que el cliente manda al conectarse (+OK) y a SCAN (sin
 * claves, para que el cliente la dé por buena al volver). La primera orden con datos (GET, SET,
 * DEL) la recibe y no la contesta, y desde ahí ya no contesta nada más en esa conexión. Tiene que
 * ser así: el cliente empareja cada respuesta con la orden más antigua que espera, así que un +OK a
 * un PING posterior lo tomaría como la respuesta del GET colgado.
 */
async function redisColgado() {
  const conexiones = new Set<Socket>();
  const recibidas: string[] = [];
  const servidor = crearServidorTcp((conexion) => {
    conexiones.add(conexion);
    let resto = '';
    let muda = false;
    conexion.on('data', (trozo) => {
      // Cada orden llega en RESP, el formato de Redis: *2\r\n$3\r\nGET\r\n$11\r\nproductos:1\r\n
      resto += trozo.toString('latin1');
      for (;;) {
        const orden = leerOrden(resto);
        if (!orden) break;
        resto = resto.slice(orden.largo);
        recibidas.push(orden.nombre);
        if (['GET', 'SET', 'DEL'].includes(orden.nombre)) muda = true;
        if (muda) continue;
        // SCAN: el cursor 0 (no hay más) y ninguna clave.
        conexion.write(orden.nombre === 'SCAN' ? '*2\r\n$1\r\n0\r\n*0\r\n' : '+OK\r\n');
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

/** Espera a que la caché esté lista, o falla a los dos segundos. */
const listaEnDos = (cache: Cache) =>
  Promise.race([
    cache.conectar(),
    dormir(2000).then(() => assert.fail('la caché no llega a estar lista')),
  ]);

test('con la caché colgada, tampoco se espera: como mucho, un momento', async () => {
  const colgado = await redisColgado();
  const cache = crearCache(colgado.url);
  try {
    // El cliente se conecta y queda listo: para él, la caché está bien.
    await listaEnDos(cache);
    const leer = espia([{ id: 1 }]);
    for (let i = 0; i < 3; i++) {
      const { ms, valor } = await cronometrar(() => cache.deCache('productos:lista:{}', 60, leer));
      assert.deepEqual(valor, [{ id: 1 }]);
      assert.ok(ms < 500, `${ms} ms`);
    }
    assert.equal(leer.veces, 3);
    const { ms } = await cronometrar(() => cache.olvidar('productos:1', 'productos:lista:*'));
    assert.ok(ms < 500, `${ms} ms`);
    // Las órdenes llegaron a la caché: es ella la que no contesta.
    assert.ok(colgado.recibidas.includes('GET'), String(colgado.recibidas));
  } finally {
    await cache.cerrar();
    colgado.cerrar();
  }
});

test('olvidar tampoco espera a una caché colgada', async () => {
  const colgado = await redisColgado();
  const cache = crearCache(colgado.url);
  try {
    // Lista, y sin ninguna orden fallida todavía: olvidar le pregunta de verdad.
    await listaEnDos(cache);
    const { ms } = await cronometrar(() => cache.olvidar('productos:1', 'productos:lista:*'));
    assert.ok(ms < 500, `${ms} ms`);
    assert.ok(colgado.recibidas.includes('DEL'), String(colgado.recibidas));
  } finally {
    await cache.cerrar();
    colgado.cerrar();
  }
});

/**
 * Un intermediario entre el cliente y el Redis de los tests, para cortar la red un rato: cortar()
 * cierra las conexiones y deja de aceptar otras; abrir() vuelve a aceptarlas, en el mismo puerto.
 * Redis no se entera: lo que tenía, lo sigue teniendo.
 */
async function redisConCorte(destino: string) {
  const { hostname, port, pathname } = new URL(destino);
  const conexiones = new Set<Socket>();
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
  let puerto = 0;
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

// #region al-volver
test(
  'al volver, la caché borra todo lo de productos: no sabe qué se perdió',
  { skip: sinRedis },
  async () => {
    await redis.flushDb();
    const red = await redisConCorte(urlCache!);
    const cache = crearCache(red.url);
    try {
      await listaEnDos(cache);
      // La taza, guardada con el precio de antes.
      await cache.deCache('productos:2', 60, async () => ({ id: 2, precioCentimos: 850 }));
      await hastaQue(async () => (await redis.exists('productos:2')) === 1, 2000, 'la taza');
      await redis.set('sesiones:otra-cosa', 'x');
      // Se corta la red. Mientras, la admin cambia el precio: olvidar no puede borrarla.
      red.cortar();
      await hastaQue(
        async () => (await cache.deCache('productos:2', 60, async () => null)) === null,
        2000,
        'la caché se da por caída',
      );
      await cache.olvidar('productos:2', 'productos:lista:*');
      assert.equal(await redis.get('productos:2'), '{"id":2,"precioCentimos":850}');
      // La red vuelve: el cliente se conecta otra vez y, antes de usarla, borra lo de productos.
      await red.abrir();
      await hastaQue(async () => (await redis.exists('productos:2')) === 0, 5000, 'la taza, fuera');
      assert.deepEqual(await redis.keys('*'), ['sesiones:otra-cosa']);
      // Y se vuelve a usar: la siguiente lectura la guarda otra vez, ya con el precio nuevo.
      await hastaQue(
        async () => {
          await cache.deCache('productos:2', 60, async () => ({ id: 2, precioCentimos: 900 }));
          return (await redis.exists('productos:2')) === 1;
        },
        2000,
        'la caché, otra vez en uso',
      );
      assert.equal(await redis.get('productos:2'), '{"id":2,"precioCentimos":900}');
    } finally {
      await cache.cerrar();
      red.cortar();
    }
  },
);
// #endregion al-volver

/**
 * Arranca la API en un puerto libre, con el entorno de los tests más el que se le dé (sin
 * REDIS_URL, SMTP_URL ni CACHE_URL salvo que se pongan), y junta lo que escribe en el log.
 */
async function arrancarApi(entorno: Record<string, string>) {
  const puerto = await puertoLibre();
  const { REDIS_URL: _r, SMTP_URL: _s, CACHE_URL: _c, ...base } = process.env;
  const proceso: ChildProcessWithoutNullStreams = spawn('node', ['src/servidor.ts'], {
    env: { ...base, LOG_LEVEL: 'info', PORT: String(puerto), ...entorno },
  });
  let salida = '';
  proceso.stdout.on('data', (trozo) => (salida += trozo));
  proceso.stderr.on('data', (trozo) => (salida += trozo));
  await esperar(() => salida.includes('La tienda escucha'), 10_000, 'la API arranca');
  return { proceso, salida: () => salida, url: `http://127.0.0.1:${puerto}` };
}

async function parar(proceso: ChildProcessWithoutNullStreams) {
  if (proceso.exitCode !== null) return;
  proceso.kill();
  await once(proceso, 'exit');
}

// La API con la caché, para los tests que siguen: cambian productos y pedidos, y miran qué queda en
// Redis.
let api: Awaited<ReturnType<typeof arrancarApi>> | undefined;
const tienda = async () => {
  if (!api) {
    api = await arrancarApi({ CACHE_URL: urlCache! });
    // Su caché se conecta un momento después de arrancar, y hasta entonces no guarda nada: se
    // espera a que guarde el primer producto.
    const url = api.url;
    await hastaQue(
      async () => {
        await fetch(`${url}/v2/productos/1`);
        return (await redis.exists('productos:1')) === 1;
      },
      5000,
      'la API usa la caché',
    );
  }
  return api.url;
};
after(async () => {
  if (api) await parar(api.proceso);
});

/** Una petición a la API, con JSON si lleva cuerpo. */
async function pedir(
  metodo: string,
  ruta: string,
  quien: Record<string, string> = {},
  cuerpo?: unknown,
) {
  return fetch(`${await tienda()}${ruta}`, {
    method: metodo,
    headers: { ...quien, ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

/** El stock de un producto, como lo da la API (de la caché, si lo tiene). */
const stockEnLaApi = async (id: number) =>
  ((await (await pedir('GET', `/v2/productos/${id}`)).json()) as { stock: number }).stock;

/** La caché vacía, con la API ya arrancada y usándola. */
async function vaciarCache() {
  await tienda();
  await redis.flushDb();
}

type Precio = { precioCentimos: number };
const claves = async () => (await redis.keys('productos:*')).sort();

/** Espera a que las claves de productos de la caché sean esas: la API guarda sin esperar. */
async function clavesSon(esperadas: string[]) {
  const texto = JSON.stringify(esperadas);
  await hastaQue(async () => JSON.stringify(await claves()) === texto, 2000, `claves ${texto}`);
}

// #region invalidar
test('cambiar un producto lo borra de la caché', { skip: sinRedis }, async () => {
  await vaciarCache();
  // Leer la lista y un producto los deja en la caché.
  await pedir('GET', '/v2/productos');
  await pedir('GET', '/v2/productos?orden=-precio');
  assert.equal(
    ((await (await pedir('GET', '/v2/productos/2')).json()) as Precio).precioCentimos,
    850,
  );
  await clavesSon(['productos:2', 'productos:lista:{"orden":"-precio"}', 'productos:lista:{}']);
  // La admin cambia el precio de la taza: ella y las listas, fuera.
  const cambio = await pedir('PATCH', '/v2/productos/2', ana, { precioCentimos: 900 });
  assert.equal(cambio.status, 200);
  assert.deepEqual(await claves(), []);
  // La caché contesta ya con el nuevo: la lectura siguiente va a PostgreSQL y lo guarda.
  assert.equal(
    ((await (await pedir('GET', '/v2/productos/2')).json()) as Precio).precioCentimos,
    900,
  );
  await clavesSon(['productos:2']);
  assert.equal(
    ((await (await pedir('GET', '/v2/productos/2')).json()) as Precio).precioCentimos,
    900,
  );
  const lista = (await (await pedir('GET', '/v2/productos')).json()) as ({ id: number } & Precio)[];
  assert.equal(lista.find((producto) => producto.id === 2)!.precioCentimos, 900);
});

test('crear o borrar un producto también', { skip: sinRedis }, async () => {
  await vaciarCache();
  const antes = (await (await pedir('GET', '/v2/productos')).json()) as { id: number }[];
  await pedir('GET', '/v2/productos/1');
  await clavesSon(['productos:1', 'productos:lista:{}']);
  // La admin crea uno: las listas, fuera (ya no son la verdad). El producto 1 no ha cambiado.
  const creado = await pedir('POST', '/v2/productos', ana, {
    nombre: 'Bufanda',
    precioCentimos: 1800,
  });
  assert.equal(creado.status, 201);
  const { id } = (await creado.json()) as { id: number };
  assert.deepEqual(await claves(), ['productos:1']);
  const despues = (await (await pedir('GET', '/v2/productos')).json()) as { id: number }[];
  assert.equal(despues.length, antes.length + 1);
  // Lo lee alguien (queda en la caché) y la admin lo borra: fuera él y las listas.
  assert.equal((await pedir('GET', `/v2/productos/${id}`)).status, 200);
  await clavesSon(['productos:1', `productos:${id}`, 'productos:lista:{}']);
  assert.equal((await pedir('DELETE', `/v2/productos/${id}`, ana)).status, 204);
  assert.deepEqual(await claves(), ['productos:1']);
  assert.equal((await pedir('GET', `/v2/productos/${id}`)).status, 404);
  // La versión 1 lee la misma lista de la caché.
  assert.equal((await pedir('GET', '/v1/productos')).status, 200);
  await clavesSon(['productos:1', 'productos:lista:{}']);
});

test('un pedido cambia el stock y lo borra de la caché', { skip: sinRedis }, async () => {
  await vaciarCache();
  const antes = await stockEnLaApi(2);
  await pedir('GET', '/v2/productos');
  await clavesSon(['productos:2', 'productos:lista:{}']);
  const res = await pedir('POST', '/v2/pedidos', carmen, { productoId: 2, cantidad: 3 });
  assert.equal(res.status, 201);
  // El stock ha cambiado: el producto y las listas (que también lo llevan), fuera.
  assert.deepEqual(await claves(), []);
  assert.equal(await stockEnLaApi(2), antes - 3);
});

test('cancelar un pedido también', { skip: sinRedis }, async () => {
  await vaciarCache();
  const res = await pedir('POST', '/v2/pedidos', carmen, { productoId: 3, cantidad: 2 });
  assert.equal(res.status, 201);
  const { id } = (await res.json()) as { id: number };
  const antes = await stockEnLaApi(3);
  await pedir('GET', '/v2/productos');
  await clavesSon(['productos:3', 'productos:lista:{}']);
  assert.equal((await pedir('POST', `/v2/pedidos/${id}/cancelacion`, carmen)).status, 200);
  // Cancelar devuelve el stock: fuera de la caché.
  assert.deepEqual(await claves(), []);
  assert.equal(await stockEnLaApi(3), antes + 2);
});

test(
  'comprar comprueba el stock en la base de datos aunque la caché diga otra cosa',
  { skip: sinRedis },
  async () => {
    await vaciarCache();
    await pool.query('UPDATE productos SET stock = 2 WHERE id = 4');
    // Una caché equivocada: dice que de la gorra quedan 1000.
    const gorra = (await (await pedir('GET', '/v2/productos/4')).json()) as { stock: number };
    await clavesSon(['productos:4']);
    await redis.set('productos:4', JSON.stringify({ ...gorra, stock: 1000 }));
    assert.equal(await stockEnLaApi(4), 1000);
    // Comprar 5 no se fía de ella: lo comprueba PostgreSQL, en la transacción del pedido.
    const res = await pedir('POST', '/v2/pedidos', carmen, { productoId: 4, cantidad: 5 });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { detail: string }).detail, 'Pides 5 y quedan 2');
    const { rows } = await pool.query('SELECT stock FROM productos WHERE id = 4');
    assert.equal(rows[0].stock, 2);
  },
);
// #endregion invalidar
