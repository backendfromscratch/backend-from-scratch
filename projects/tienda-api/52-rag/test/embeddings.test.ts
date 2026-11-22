// La búsqueda por el significado (Fase 11, lección 5): la migración 014, los vectores que calcula el
// trabajador desde los eventos salientes, npm run embeddings y buscar_productos por el significado,
// en el asistente y en MCP. Siempre con el embebedor de mentira (embebedor-falso.ts): el modelo de
// verdad lo prueba npm run probar-embeddings, que no es parte de npm test.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { serve, type ServerType } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { type ClienteRedis, conectarRedis } from '../src/almacen-redis.ts';
import {
  buscarEnCatalogo,
  buscarProductosPorSignificado,
  CERCANOS,
  DESCRIPCION_POR_SIGNIFICADO,
} from '../src/asistente/herramientas/buscar-productos.ts';
import { bd, pool } from '../src/bd.ts';
import {
  crearTrabajador,
  encolar,
  NOMBRE_COLA,
  OPCIONES_TRABAJOS,
  procesar,
  type Trabajo,
} from '../src/cola.ts';
import { config } from '../src/config.ts';
import {
  DIMENSIONES,
  type Embebedor,
  guardarVectores,
  LOTE,
  rellenarVectores,
  textoDelProducto,
  usarEmbebedor,
} from '../src/embeddings.ts';
import { productos } from '../src/esquema.ts';
import { repartir } from '../src/salientes.ts';
import { ejecutar, usarBd } from './bd.ts';
import { crearEmbebedorFalso, vectorFalso } from './embebedor-falso.ts';
import { ANA, CARMEN, comoClave, comoUsuario } from './identidades.ts';
import { arrancarModeloFalso, bloqueHerramienta, pideHerramientas, texto } from './modelo-falso.ts';

// El modelo falso de la API de Claude, antes de importar la tienda (el SDK lee
// ANTHROPIC_BASE_URL al crear el cliente), como en asistente-herramientas.test.ts.
const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());
const { app } = await import('../src/app.ts');

// El embebedor de mentira, nuevo en cada test: así cada uno sabe qué le han pedido.
let embebedor: ReturnType<typeof crearEmbebedorFalso>;
beforeEach(() => {
  embebedor = crearEmbebedorFalso();
  usarEmbebedor(embebedor);
});

let ana: Record<string, string>;
let carmen: Record<string, string>;
let catalogo: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
  catalogo = await comoClave('catalogo');
});

// Cada test empieza con el catálogo de práctica sin vectores y sin eventos salientes, y con la
// búsqueda semántica encendida (test/.env), aunque el anterior la apagara.
beforeEach(async () => {
  await pool.query('UPDATE productos SET embedding = NULL');
  await pool.query('DELETE FROM eventos_salientes');
  config.BUSQUEDA_SEMANTICA = 'si';
});

const pedir = (metodo: string, ruta: string, cuerpo: unknown) =>
  app.request(ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...ana },
    body: JSON.stringify(cuerpo),
  });

/** El vector de un producto, tal y como está en PostgreSQL (null si no tiene). */
async function vectorDe(id: number): Promise<number[] | null> {
  const [fila] = await bd
    .select({ embedding: productos.embedding })
    .from(productos)
    .where(eq(productos.id, id));
  return fila!.embedding;
}

/** Los eventos salientes, en orden. */
const salientes = async () =>
  (
    await pool.query<{ tipo: string; datos: Trabajo }>(
      'SELECT tipo, datos FROM eventos_salientes ORDER BY id',
    )
  ).rows;

/** Dos vectores casi iguales: PostgreSQL guarda cada número con 32 bits (float4), JavaScript con 64. */
function casiIguales(a: number[], b: number[]) {
  assert.equal(a.length, b.length);
  for (const [i, x] of a.entries()) assert.ok(Math.abs(x - b[i]!) < 1e-6, `posición ${i}`);
}

/** La distancia del coseno entre dos vectores de longitud 1, calculada en JavaScript. */
const distancia = (a: number[], b: number[]) => 1 - a.reduce((suma, x, i) => suma + x * b[i]!, 0);

// #region migracion
test('la migración 014: la extensión vector, la descripción, el vector de 384 y el índice HNSW', async () => {
  const extension = await pool.query(
    `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
  );
  assert.equal(extension.rowCount, 1);
  const columnas = await pool.query(
    `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
     WHERE table_name = 'productos' AND column_name IN ('descripcion', 'embedding') ORDER BY 1`,
  );
  assert.deepEqual(columnas.rows, [
    { column_name: 'descripcion', udt_name: 'text', is_nullable: 'YES' },
    { column_name: 'embedding', udt_name: 'vector', is_nullable: 'YES' },
  ]);
  const indice = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'productos_por_embedding'`,
  );
  assert.match(indice.rows[0].indexdef, /USING hnsw \(embedding vector_cosine_ops\)/);
  // Un vector con otro número de dimensiones no entra.
  await assert.rejects(
    pool.query(`UPDATE productos SET embedding = $1 WHERE id = 1`, [
      JSON.stringify(new Array(DIMENSIONES - 1).fill(0.1)),
    ]),
    /expected 384 dimensions/,
  );
});

test('la consulta de la búsqueda puede usar el índice HNSW (con 20 filas, PostgreSQL prefiere leer la tabla)', async () => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    // Sin esta prohibición, con tan pocas filas, leer la tabla entera es más barato que el índice.
    await cliente.query('SET LOCAL enable_seqscan = off');
    const { rows } = await cliente.query(
      `EXPLAIN SELECT id FROM productos WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1 LIMIT 5`,
      [JSON.stringify(vectorFalso('algo para el frío'))],
    );
    await cliente.query('ROLLBACK');
    assert.match(rows.map((fila) => fila['QUERY PLAN']).join('\n'), /productos_por_embedding/);
  } finally {
    cliente.release();
  }
});

test('el catálogo de práctica: 20 productos con descripción y sin vector; los cuatro de siempre, igual', async () => {
  const { rows } = await pool.query(
    'SELECT id, nombre, precio_centimos, descripcion, embedding FROM productos ORDER BY id',
  );
  assert.equal(rows.length, 20);
  assert.ok(rows.every((fila) => fila.descripcion && fila.embedding === null));
  assert.deepEqual(
    rows.slice(0, 4).map(({ id, nombre, precio_centimos }) => [id, nombre, precio_centimos]),
    [
      [1, 'Camiseta', 2000],
      [2, 'Taza', 850],
      [3, 'Sudadera', 3500],
      [4, 'Gorra', 1500],
    ],
  );
});
// #endregion migracion

// #region buscar
test('buscarProductosPorSignificado: los más cercanos, ordenados por la distancia del coseno, con ella', async () => {
  await rellenarVectores();
  embebedor.pedidos.length = 0;
  const consulta = 'una bufanda de lana para el invierno';
  const encontrados = await buscarProductosPorSignificado(consulta);
  // La API solo calcula el vector de la consulta.
  assert.deepEqual(embebedor.pedidos, [[consulta]]);
  assert.equal(encontrados.length, CERCANOS);
  assert.equal(encontrados[0]!.nombre, 'Bufanda');
  // Las mismas distancias que da la cuenta en JavaScript, y en orden: las CERCANOS más pequeñas.
  const { rows } = await pool.query('SELECT nombre, descripcion FROM productos');
  const todas = rows
    .map(
      (fila) =>
        Math.round(distancia(vectorFalso(consulta), vectorFalso(textoDelProducto(fila))) * 1000) /
        1000,
    )
    .toSorted((a, b) => a - b);
  assert.deepEqual(
    encontrados.map((producto) => producto.distancia),
    todas.slice(0, CERCANOS),
  );
  assert.deepEqual(Object.keys(encontrados[0]!), [
    'id',
    'nombre',
    'descripcion',
    'precioCentimos',
    'stock',
    'distancia',
  ]);
});

test('búsqueda híbrida: primero los que tienen la consulta en el nombre (también sin vector), después los más cercanos', async () => {
  await rellenarVectores();
  // Un producto nuevo: su vector aún no está (lo calcularía el trabajador).
  const res = await pedir('POST', '/v2/productos', {
    nombre: 'Bufanda de seda',
    precioCentimos: 3000,
  });
  assert.equal(res.status, 201);
  const nueva = await res.json();
  const encontrados = await buscarProductosPorSignificado('bufanda');
  assert.equal(encontrados.length, 2 + CERCANOS);
  // Los dos con «bufanda» en el nombre, por su id: la Bufanda, con su distancia, y la nueva, que
  // no se pierde aunque no tenga vector (distancia null).
  assert.equal(encontrados[0]!.nombre, 'Bufanda');
  assert.equal(typeof encontrados[0]!.distancia, 'number');
  assert.deepEqual(encontrados[1], {
    id: nueva.id,
    nombre: 'Bufanda de seda',
    descripcion: null,
    precioCentimos: 3000,
    stock: 0,
    distancia: null,
  });
  // Después, los más cercanos, sin repetir ninguno y del más al menos parecido.
  const cercanos = encontrados.slice(2);
  assert.ok(cercanos.every((producto) => !producto.nombre.startsWith('Bufanda')));
  const distancias = cercanos.map((producto) => producto.distancia!);
  assert.deepEqual(
    distancias,
    distancias.toSorted((a, b) => a - b),
  );
  // Sin ningún vector en la tabla, es la búsqueda por el nombre.
  await pool.query('UPDATE productos SET embedding = NULL');
  assert.deepEqual(
    (await buscarProductosPorSignificado('bufanda')).map(({ nombre, distancia }) => [
      nombre,
      distancia,
    ]),
    [
      ['Bufanda', null],
      ['Bufanda de seda', null],
    ],
  );
});

test('con BUSQUEDA_SEMANTICA=no, buscarEnCatalogo busca por el nombre y no calcula ningún vector', async () => {
  await rellenarVectores();
  embebedor.pedidos.length = 0;
  config.BUSQUEDA_SEMANTICA = 'no';
  assert.deepEqual(await buscarEnCatalogo('algo para el frío'), []);
  assert.deepEqual(
    (await buscarEnCatalogo('taza')).map(({ nombre, distancia }) => ({ nombre, distancia })),
    [{ nombre: 'Taza', distancia: null }],
  );
  assert.deepEqual(embebedor.pedidos, []);
  // Encendida, por el significado.
  config.BUSQUEDA_SEMANTICA = 'si';
  assert.equal((await buscarEnCatalogo('taza de cerámica')).length, CERCANOS);
});
// #endregion buscar

// #region eventos
test('crear un producto, o cambiarle el nombre o la descripción, apunta un evento vector-de-producto; el precio, no', async () => {
  const creado = await pedir('POST', '/v2/productos', {
    nombre: 'Calcetines de lana',
    descripcion: 'Calcetines gordos de lana para dormir sin frío en los pies.',
    precioCentimos: 900,
  });
  assert.equal(creado.status, 201);
  const producto = await creado.json();
  assert.equal(producto.descripcion, 'Calcetines gordos de lana para dormir sin frío en los pies.');
  assert.equal('embedding' in producto, false, 'el vector no sale en las respuestas');
  let eventos = await salientes();
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0]!.tipo, 'vector-de-producto');
  assert.deepEqual(Object.keys(eventos[0]!.datos).sort(), ['idCambio', 'productoId', 'tipo']);
  assert.equal((eventos[0]!.datos as { productoId: number }).productoId, producto.id);

  // Con su vector ya calculado, un cambio de precio no lo toca ni apunta nada.
  await guardarVectores([producto.id]);
  assert.equal(
    (await pedir('PATCH', `/v2/productos/${producto.id}`, { precioCentimos: 950 })).status,
    200,
  );
  assert.notEqual(await vectorDe(producto.id), null);
  assert.equal((await salientes()).length, 1);

  // Otra descripción: el vector viejo se borra en el mismo UPDATE, y se apunta otro evento, con
  // otro idCambio.
  const cambio = await pedir('PATCH', `/v2/productos/${producto.id}`, {
    descripcion: 'Calcetines térmicos de lana merina.',
  });
  assert.equal(cambio.status, 200);
  assert.equal((await cambio.json()).descripcion, 'Calcetines térmicos de lana merina.');
  assert.equal(await vectorDe(producto.id), null);
  eventos = await salientes();
  assert.equal(eventos.length, 2);
  const [primero, segundo] = eventos.map((evento) => evento.datos as { idCambio: string });
  assert.notEqual(primero!.idCambio, segundo!.idCambio);
});

test('el trabajador calcula el vector: del evento saliente al trabajo y a la columna', async () => {
  const res = await pedir('POST', '/v2/productos', {
    nombre: 'Termo',
    descripcion: 'Termo de acero para llevar el café caliente.',
    precioCentimos: 1700,
  });
  const { id } = await res.json();
  assert.equal(await vectorDe(id), null);
  // El repartidor pasa el evento a la «cola»: aquí, procesar, lo que haría el trabajador con él.
  assert.equal(await repartir(50, (trabajo) => procesar(trabajo)), 1);
  assert.deepEqual(embebedor.pedidos, [['Termo. Termo de acero para llevar el café caliente.']]);
  casiIguales(
    (await vectorDe(id))!,
    vectorFalso('Termo. Termo de acero para llevar el café caliente.'),
  );
});

test('con BUSQUEDA_SEMANTICA=no, el trabajador no calcula el vector', async () => {
  config.BUSQUEDA_SEMANTICA = 'no';
  await procesar({ tipo: 'vector-de-producto', productoId: 2, idCambio: 'prueba' });
  assert.equal(await vectorDe(2), null);
  assert.deepEqual(embebedor.pedidos, []);
});

test('si el producto cambia mientras se calcula su vector, el vector viejo no se guarda', async () => {
  // Un embebedor que, mientras «calcula», ve cómo alguien cambia el nombre del producto.
  const lento: Embebedor = {
    async vectores(textos) {
      await pool.query(`UPDATE productos SET nombre = 'Taza grande' WHERE id = 2`);
      return textos.map(vectorFalso);
    },
  };
  usarEmbebedor(lento);
  try {
    assert.equal(await guardarVectores([2]), 0);
    assert.equal(await vectorDe(2), null);
  } finally {
    await pool.query(`UPDATE productos SET nombre = 'Taza' WHERE id = 2`);
  }
});

const url = process.env.REDIS_URL_TESTS;
const sinRedis = url
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// Con Redis, el camino entero: el repartidor encola en BullMQ y un trabajador de verdad (en este
// proceso, con el embebedor de mentira) coge el trabajo y guarda el vector.
let cliente: ClienteRedis;
let cola: Queue<Trabajo>;
before(async () => {
  if (!url) return;
  cliente = conectarRedis(url);
  cola = new Queue<Trabajo>(NOMBRE_COLA, {
    connection: cliente,
    defaultJobOptions: OPCIONES_TRABAJOS,
  });
  await cola.obliterate({ force: true });
});
after(async () => {
  await cola?.close();
  await cliente?.close();
});

test(
  'con Redis: el evento llega a la cola y el trabajador guarda el vector',
  { skip: sinRedis },
  async () => {
    const trabajador = crearTrabajador({ url: url! });
    try {
      const res = await pedir('POST', '/v2/productos', {
        nombre: 'Bufanda de cuadros',
        precioCentimos: 2400,
      });
      const { id } = await res.json();
      assert.equal(await repartir(50, (trabajo) => encolar(trabajo, cola)), 1);
      for (let intento = 0; intento < 50 && (await vectorDe(id)) === null; intento++) {
        await new Promise((listo) => setTimeout(listo, 100));
      }
      casiIguales((await vectorDe(id))!, vectorFalso('Bufanda de cuadros'));
    } finally {
      await trabajador.cerrar();
      await cola.obliterate({ force: true });
    }
  },
);
// #endregion eventos

// #region rellenar
test('npm run embeddings (rellenarVectores): los que faltan, de 32 en 32; con todos, también los demás', async () => {
  await pool.query(
    `INSERT INTO productos (nombre, precio_centimos)
     SELECT 'Pegatina ' || n, 200 FROM generate_series(1, 40) AS n`,
  );
  // Los 20 de práctica, las 40 pegatinas y los que hayan creado los tests de arriba.
  const total = (await pool.query('SELECT count(*)::int AS n FROM productos')).rows[0].n;
  assert.ok(total > LOTE && total <= 2 * LOTE);
  assert.equal(await rellenarVectores(), total);
  assert.deepEqual(
    embebedor.pedidos.map((textos) => textos.length),
    [LOTE, total - LOTE],
  );
  casiIguales(
    (await vectorDe(5))!,
    vectorFalso(
      textoDelProducto({
        nombre: 'Bufanda',
        descripcion: 'Bufanda larga de lana gruesa, suave y calentita, para los días de invierno.',
      }),
    ),
  );
  // Ya no falta ninguno.
  assert.equal(await rellenarVectores(), 0);
  // Uno que cambia (su vector vuelve a NULL): solo ese.
  await pool.query(`UPDATE productos SET embedding = NULL WHERE id = 3`);
  embebedor.pedidos.length = 0;
  assert.equal(await rellenarVectores(), 1);
  assert.equal(
    embebedor.pedidos[0]![0],
    textoDelProducto({
      nombre: 'Sudadera',
      descripcion:
        'Sudadera de algodón grueso con capucha y bolsillo delantero, para abrigarte cuando refresca.',
    }),
  );
  // Con todos, todos otra vez.
  assert.equal(await rellenarVectores(true), total);
  await pool.query(`DELETE FROM productos WHERE nombre LIKE 'Pegatina %'`);
});

test('npm run embeddings con BUSQUEDA_SEMANTICA=no, o sin ella: no carga el modelo, y sale con 1', async () => {
  const resultado = await ejecutar('node', ['scripts/embeddings.ts'], {
    env: { ...process.env, BUSQUEDA_SEMANTICA: 'no' },
  }).catch((error) => error);
  assert.equal(resultado.code, 1);
  assert.match(resultado.stderr, /BUSQUEDA_SEMANTICA=no: la tienda no usa los vectores/);
  // Sin la variable, lo mismo: si no se dice otra cosa, está apagada (config.ts).
  const sinElla = { ...process.env };
  delete sinElla.BUSQUEDA_SEMANTICA;
  const porDefecto = await ejecutar('node', ['scripts/embeddings.ts'], { env: sinElla }).catch(
    (error) => error,
  );
  assert.equal(porDefecto.code, 1);
  assert.match(porDefecto.stderr, /BUSQUEDA_SEMANTICA=no: la tienda no usa los vectores/);
  const otro = await ejecutar('node', ['scripts/embeddings.ts', '--todo']).catch((error) => error);
  assert.equal(otro.code, 1);
  assert.match(otro.stderr, /Argumento no válido/);
});
// #endregion rellenar

// #region puertas
test('el asistente: buscar_productos le devuelve al modelo los más cercanos, con su distancia', async () => {
  await rellenarVectores();
  modelo.guion(
    pideHerramientas(
      bloqueHerramienta(
        'buscar_productos',
        { consulta: 'una bufanda de lana para el invierno' },
        'toolu_1',
      ),
    ),
    texto('Te recomiendo la Bufanda.'),
  );
  const res = await app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: JSON.stringify({ mensajes: [{ rol: 'usuario', texto: '¿Qué me llevo para el frío?' }] }),
  });
  assert.equal(res.status, 200);
  // La definición que vio el modelo: la de la búsqueda por el significado.
  const herramienta = modelo.peticiones[0]!.cuerpo.tools.find(
    (definicion: { name: string }) => definicion.name === 'buscar_productos',
  );
  assert.equal(herramienta.description, DESCRIPCION_POR_SIGNIFICADO);
  // Lo que recibió en la segunda vuelta: los CERCANOS productos, la Bufanda la primera.
  const [resultado] = modelo.peticiones[1]!.cuerpo.messages.at(-1).content;
  const encontrados = JSON.parse(resultado.content);
  assert.equal(encontrados.length, CERCANOS);
  assert.equal(encontrados[0].nombre, 'Bufanda');
  assert.equal(typeof encontrados[0].distancia, 'number');
});

test('MCP: buscar_productos busca por el significado, con la misma función', async () => {
  await rellenarVectores();
  let servidor: ServerType;
  await new Promise<void>((listo) => {
    servidor = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => listo());
  });
  const direccion = `http://127.0.0.1:${(servidor!.address() as AddressInfo).port}/mcp`;
  const mcp = new Client({ name: 'tests-de-la-tienda', version: '1.0.0' });
  try {
    await mcp.connect(
      new StreamableHTTPClientTransport(new URL(direccion), { requestInit: { headers: catalogo } }),
    );
    const { tools } = await mcp.listTools();
    assert.equal(
      tools.find((t) => t.name === 'buscar_productos')!.description,
      DESCRIPCION_POR_SIGNIFICADO,
    );
    const resultado = (await mcp.callTool({
      name: 'buscar_productos',
      arguments: { consulta: 'una bufanda de lana para el invierno' },
    })) as CallToolResult;
    const encontrados = JSON.parse((resultado.content[0] as { text: string }).text);
    assert.deepEqual(encontrados, await buscarEnCatalogo('una bufanda de lana para el invierno'));
    assert.equal(encontrados[0].nombre, 'Bufanda');
  } finally {
    await mcp.close();
    await new Promise((cerrado) => servidor!.close(cerrado));
  }
});
// #endregion puertas
