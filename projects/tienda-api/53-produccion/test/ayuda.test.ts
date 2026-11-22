// La ayuda de la tienda y RAG (Fase 11, lección 6): la migración 015, los trozos de las páginas de
// ayuda/ (npm run ayuda), la búsqueda por el significado y por palabras, la herramienta
// buscar_en_ayuda en el asistente (con sus bloques search_result y las fuentes de la respuesta) y
// en MCP. Siempre con el embebedor de mentira (embebedor-falso.ts), que acerca los textos que
// comparten palabras, y con el modelo falso (modelo-falso.ts).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, test } from 'node:test';
import { serve, type ServerType } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  buscarEnAyudaPorPalabras,
  buscarEnAyudaPorSignificado,
  consultarAyuda,
  DESCRIPCION_POR_SIGNIFICADO,
  FRAGMENTOS,
  MAX_TEXTO,
  SIN_RESULTADOS,
} from '../src/asistente/herramientas/buscar-en-ayuda.ts';
import { type Fuente, origenDe } from '../src/asistente/herramientas/herramienta.ts';
import {
  cargarAyuda,
  cargarAyudaSiFalta,
  leerAyuda,
  textoDelFragmento,
  trocearPagina,
} from '../src/ayuda.ts';
import { pool } from '../src/bd.ts';
import { config } from '../src/config.ts';
import { usarEmbebedor } from '../src/embeddings.ts';
import { ejecutar, usarBd } from './bd.ts';
import { crearEmbebedorFalso, vectorFalso } from './embebedor-falso.ts';
import { CARMEN, comoClave, comoUsuario } from './identidades.ts';
import {
  arrancarModeloFalso,
  bloqueCitado,
  bloqueHerramienta,
  bloqueTexto,
  mensaje,
  pideHerramientas,
  rechazo,
  texto,
} from './modelo-falso.ts';

// El modelo falso, antes de importar la tienda (el SDK lee ANTHROPIC_BASE_URL al crear el cliente).
const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());
const { app } = await import('../src/app.ts');
const { cumpleContrato } = await import('./contrato.ts');

// El embebedor de mentira, nuevo en cada test: así cada uno sabe qué le han pedido.
let embebedor: ReturnType<typeof crearEmbebedorFalso>;
beforeEach(() => {
  embebedor = crearEmbebedorFalso();
  usarEmbebedor(embebedor);
});

let carmen: Record<string, string>;
let catalogo: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
  catalogo = await comoClave('catalogo');
});

// Cada test empieza con la búsqueda semántica encendida (test/.env) y la ayuda cargada con sus
// vectores, aunque el anterior la cambiara.
beforeEach(async () => {
  config.BUSQUEDA_SEMANTICA = 'si';
  usarEmbebedor(crearEmbebedorFalso());
  await cargarAyuda();
  usarEmbebedor(embebedor);
});

/** Los trozos de la tabla, en orden: página, sección y si tienen vector. */
const enLaTabla = async () =>
  (
    await pool.query<{ pagina: string; seccion: string; con_vector: boolean }>(
      'SELECT pagina, seccion, embedding IS NOT NULL AS con_vector FROM fragmentos_ayuda ORDER BY id',
    )
  ).rows;

// Las secciones de las cuatro páginas de ayuda/, en el orden en que se cargan (los ficheros, por
// orden alfabético; las secciones, en el de la página).
const SECCIONES = [
  ['cuenta', 'Tu cuenta', 'Crear una cuenta'],
  ['cuenta', 'Tu cuenta', 'Entrar'],
  ['cuenta', 'Tu cuenta', 'Qué puedes hacer con tu cuenta'],
  ['cuenta', 'Tu cuenta', 'Tus datos'],
  ['devoluciones', 'Cancelaciones y devoluciones', 'Cancelar un pedido'],
  ['devoluciones', 'Cancelaciones y devoluciones', 'Devolver un producto'],
  ['devoluciones', 'Cancelaciones y devoluciones', 'Cuándo llega el reembolso'],
  ['devoluciones', 'Cancelaciones y devoluciones', 'Productos que no se pueden devolver'],
  ['envios', 'Envíos', 'Qué significa cada estado de tu pedido'],
  ['envios', 'Envíos', 'Cuánto tarda'],
  ['envios', 'Envíos', 'Cuánto cuesta'],
  ['envios', 'Envíos', 'Dónde está mi pedido'],
  ['pagos', 'Pagos', 'Cómo se paga'],
  ['pagos', 'Pagos', 'Cuándo se confirma'],
  ['pagos', 'Pagos', 'Si el pago falla'],
  ['pagos', 'Pagos', 'Facturas'],
];

const DEVOLVER = {
  pagina: 'devoluciones',
  titulo: 'Cancelaciones y devoluciones',
  seccion: 'Devolver un producto',
};

/** La distancia del coseno entre dos vectores de longitud 1, calculada en JavaScript. */
const distancia = (a: number[], b: number[]) => 1 - a.reduce((suma, x, i) => suma + x * b[i]!, 0);

// #region migracion
test('la migración 015: fragmentos_ayuda, con su vector de 384, su tsvector generado y sus dos índices', async () => {
  const columnas = await pool.query(
    `SELECT column_name, udt_name, is_nullable, is_generated FROM information_schema.columns
     WHERE table_name = 'fragmentos_ayuda' ORDER BY ordinal_position`,
  );
  assert.deepEqual(
    columnas.rows.map((c) => [c.column_name, c.udt_name, c.is_nullable, c.is_generated]),
    [
      ['id', 'int4', 'NO', 'NEVER'],
      ['pagina', 'text', 'NO', 'NEVER'],
      ['titulo', 'text', 'NO', 'NEVER'],
      ['seccion', 'text', 'NO', 'NEVER'],
      ['texto', 'text', 'NO', 'NEVER'],
      ['embedding', 'vector', 'YES', 'NEVER'],
      ['busqueda', 'tsvector', 'NO', 'ALWAYS'],
    ],
  );
  const indices = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'fragmentos_ayuda' ORDER BY 1`,
  );
  const definicion = (nombre: string) =>
    indices.rows.find((indice) => indice.indexname === nombre)?.indexdef;
  assert.match(
    definicion('fragmentos_ayuda_por_embedding'),
    /USING hnsw \(embedding vector_cosine_ops\)/,
  );
  assert.match(definicion('fragmentos_ayuda_por_palabras'), /USING gin \(busqueda\)/);
  // La columna generada la calcula PostgreSQL: las palabras de los dos títulos y del texto, en su
  // raíz y sin las que no dicen nada («un»).
  const { rows } = await pool.query(
    `SELECT busqueda::text AS busqueda FROM fragmentos_ayuda WHERE seccion = 'Devolver un producto'`,
  );
  assert.match(rows[0].busqueda, /'devolv':/);
  assert.match(rows[0].busqueda, /'product':/);
  assert.doesNotMatch(rows[0].busqueda, /'un':/);
  // Y nadie la puede escribir.
  await assert.rejects(
    pool.query(
      `INSERT INTO fragmentos_ayuda (pagina, titulo, seccion, texto, busqueda)
       VALUES ('a', 'b', 'c', 'd', to_tsvector('d'))`,
    ),
    /cannot insert a non-DEFAULT value into column "busqueda"/,
  );
});
// #endregion migracion

// #region trocear
test('trocearPagina: un trozo por sección, con el título de la página; sin negritas ni líneas de más', () => {
  const markdown = [
    '# Cómo funciona',
    '',
    'Lo que hay antes de la primera sección.',
    '',
    '## Primera parte',
    '',
    'Un texto con **negrita**.',
    '',
    '',
    '',
    'Y otro párrafo.',
    '## Segunda parte',
    '- Una lista',
    '- de dos',
    '## Vacía',
    '',
  ].join('\r\n');
  assert.deepEqual(trocearPagina('como', markdown), [
    {
      pagina: 'como',
      titulo: 'Cómo funciona',
      seccion: 'Cómo funciona',
      texto: 'Lo que hay antes de la primera sección.',
    },
    {
      pagina: 'como',
      titulo: 'Cómo funciona',
      seccion: 'Primera parte',
      texto: 'Un texto con negrita.\n\nY otro párrafo.',
    },
    {
      pagina: 'como',
      titulo: 'Cómo funciona',
      seccion: 'Segunda parte',
      texto: '- Una lista\n- de dos',
    },
  ]);
  // Sin título, el nombre del fichero; un ### no corta.
  assert.deepEqual(trocearPagina('notas', '## Una\nTexto\n### Dentro\nMás'), [
    { pagina: 'notas', titulo: 'notas', seccion: 'Una', texto: 'Texto\n### Dentro\nMás' },
  ]);
});
// #endregion trocear

// #region cargar
test('npm run ayuda (cargarAyuda): las cuatro páginas, en 16 trozos con sus vectores, y otra vez lo mismo', async () => {
  const fragmentos = await leerAyuda();
  assert.deepEqual(
    fragmentos.map(({ pagina, titulo, seccion }) => [pagina, titulo, seccion]),
    SECCIONES,
  );
  assert.ok(fragmentos.every(({ texto }) => texto.length > 50 && !texto.includes('**')));

  assert.deepEqual(await cargarAyuda(), { fragmentos: 16, conVectores: true });
  // Todos los textos, en una sola llamada al modelo (caben en un lote de 32), con sus dos títulos.
  assert.deepEqual(embebedor.pedidos, [fragmentos.map(textoDelFragmento)]);
  assert.match(embebedor.pedidos[0]![5]!, /^Cancelaciones y devoluciones: Devolver un producto\. /);
  const tabla = await enLaTabla();
  assert.deepEqual(
    tabla.map(({ pagina, seccion }) => [pagina, seccion]),
    SECCIONES.map(([pagina, , seccion]) => [pagina, seccion]),
  );
  assert.ok(tabla.every((fila) => fila.con_vector));
  const { rows } = await pool.query(
    `SELECT embedding::text AS embedding FROM fragmentos_ayuda WHERE seccion = 'Devolver un producto'`,
  );
  const guardado = JSON.parse(rows[0].embedding) as number[];
  const esperado = vectorFalso(textoDelFragmento(fragmentos[5]!));
  assert.ok(guardado.every((x, i) => Math.abs(x - esperado[i]!) < 1e-6));

  // Otra vez: la tabla queda igual, sin trozos repetidos.
  await cargarAyuda();
  assert.deepEqual(await enLaTabla(), tabla);
});

test('con BUSQUEDA_SEMANTICA=no, npm run ayuda guarda los trozos sin vector, sin el modelo', async () => {
  config.BUSQUEDA_SEMANTICA = 'no';
  assert.deepEqual(await cargarAyuda(), { fragmentos: 16, conVectores: false });
  assert.deepEqual(embebedor.pedidos, []);
  assert.ok((await enLaTabla()).every((fila) => !fila.con_vector));

  // El script de verdad, en otro proceso (sin el modelo: con la búsqueda apagada no lo carga).
  await pool.query('DELETE FROM fragmentos_ayuda');
  const { stdout } = await ejecutar('node', ['scripts/ayuda.ts'], {
    env: { ...process.env, BUSQUEDA_SEMANTICA: 'no' },
  });
  assert.match(stdout, /^Ayuda cargada: 16 fragmentos, sin vectores, en [\d.]+ s$/m);
  assert.match(stdout, /busca por palabras/);
  assert.equal((await enLaTabla()).length, 16);
});

test('una carpeta sin páginas no borra la ayuda que hay', async () => {
  const vacia = await mkdtemp(join(tmpdir(), 'ayuda-'));
  try {
    await assert.rejects(cargarAyuda(vacia), /No hay ninguna página de ayuda en/);
    assert.equal((await enLaTabla()).length, 16);
  } finally {
    await rm(vacia, { recursive: true });
  }
});

test('el trabajador al arrancar (cargarAyudaSiFalta): carga la ayuda si la tabla está vacía; si no, nada', async () => {
  assert.equal(await cargarAyudaSiFalta(), undefined);
  assert.deepEqual(embebedor.pedidos, []);
  await pool.query('DELETE FROM fragmentos_ayuda');
  assert.deepEqual(await cargarAyudaSiFalta(), { fragmentos: 16, conVectores: true });
  assert.equal((await enLaTabla()).length, 16);
});

const redis = process.env.REDIS_URL_TESTS;
test(
  'el trabajador de verdad (scripts/trabajador.ts) carga la ayuda al arrancar con la tabla vacía',
  { skip: redis ? false : 'sin Redis: pon REDIS_URL_TESTS en test/.env para probarlo' },
  async () => {
    await pool.query('DELETE FROM fragmentos_ayuda');
    // Con la búsqueda semántica apagada: así no carga el modelo de verdad, que los tests nunca
    // descargan.
    const trabajador = spawn('node', ['scripts/trabajador.ts'], {
      env: { ...process.env, REDIS_URL: redis, LOG_LEVEL: 'info', BUSQUEDA_SEMANTICA: 'no' },
    });
    let salida = '';
    trabajador.stdout.on('data', (trozo) => (salida += trozo));
    try {
      for (let i = 0; i < 100 && !salida.includes('ha cargado la ayuda'); i++) {
        await new Promise((listo) => setTimeout(listo, 100));
      }
      assert.match(salida, /"fragmentos":16,"conVectores":false.*ha cargado la ayuda/);
      assert.equal((await enLaTabla()).length, 16);
    } finally {
      trabajador.kill('SIGTERM');
      await once(trabajador, 'exit');
    }
  },
);
// #endregion cargar

// #region buscar
test('por el significado: los 3 trozos más cercanos, con su distancia; devolver un producto, la sección de devoluciones', async () => {
  const pregunta = '¿Puedo devolver un producto?';
  const encontrados = await buscarEnAyudaPorSignificado(pregunta);
  // La API solo calcula el vector de la pregunta.
  assert.deepEqual(embebedor.pedidos, [[pregunta]]);
  assert.equal(encontrados.length, FRAGMENTOS);
  const { distancia: primera, texto: textoPrimera, ...fuente } = encontrados[0]!;
  assert.deepEqual(fuente, DEVOLVER);
  assert.match(textoPrimera, /^Tienes 30 días desde que recibes el pedido/);
  // Las mismas distancias que da la cuenta en JavaScript, y en orden: las 3 más pequeñas.
  const todas = (await leerAyuda())
    .map(
      (fragmento) =>
        Math.round(
          distancia(vectorFalso(pregunta), vectorFalso(textoDelFragmento(fragmento))) * 1000,
        ) / 1000,
    )
    .toSorted((a, b) => a - b);
  assert.deepEqual(
    encontrados.map((fragmento) => fragmento.distancia),
    todas.slice(0, FRAGMENTOS),
  );
  assert.equal(primera, todas[0]);
  assert.deepEqual(Object.keys(encontrados[0]!), [
    'pagina',
    'titulo',
    'seccion',
    'texto',
    'distancia',
  ]);
});

test('por palabras (BUSQUEDA_SEMANTICA=no): websearch_to_tsquery y ts_rank, sin el modelo; sin las palabras, nada', async () => {
  config.BUSQUEDA_SEMANTICA = 'no';
  const encontrados = await consultarAyuda('devolver producto');
  assert.ok(encontrados.length >= 1 && encontrados.length <= FRAGMENTOS);
  const { texto: _texto, ...primera } = encontrados[0]!;
  assert.deepEqual(primera, { ...DEVOLVER, distancia: null });
  // Todas las palabras tienen que estar: ninguna sección habla de tazas.
  assert.deepEqual(await consultarAyuda('¿puedo devolver una taza?'), []);
  // Con or, basta una.
  assert.ok((await consultarAyuda('taza or reembolso')).length > 0);
  // Una pregunta solo con palabras que no dicen nada no encuentra nada (y no falla).
  assert.deepEqual(await consultarAyuda('¿y eso?'), []);
  assert.deepEqual(embebedor.pedidos, []);
});

test('con la búsqueda semántica encendida pero la ayuda cargada sin vectores, busca por palabras', async () => {
  config.BUSQUEDA_SEMANTICA = 'no';
  await cargarAyuda();
  config.BUSQUEDA_SEMANTICA = 'si';
  const encontrados = await consultarAyuda('devolver producto');
  assert.deepEqual(encontrados, await buscarEnAyudaPorPalabras('devolver producto'));
  assert.equal(encontrados[0]!.seccion, 'Devolver un producto');
});

test('el texto de un trozo larguísimo llega cortado, con … al final', async () => {
  const largo = 'Para devolver un producto, '.repeat(100);
  await pool.query(
    `INSERT INTO fragmentos_ayuda (pagina, titulo, seccion, texto) VALUES ('larga', 'Larga', 'Larga', $1)`,
    [largo],
  );
  config.BUSQUEDA_SEMANTICA = 'no';
  const larga = (await consultarAyuda('devolver producto')).find((f) => f.pagina === 'larga')!;
  assert.equal(larga.texto.length, MAX_TEXTO + 1);
  assert.equal(larga.texto, `${largo.slice(0, MAX_TEXTO)}…`);
});
// #endregion buscar

// #region asistente
const preguntar = (pregunta: string, accept = 'application/json') =>
  app.request('/v2/asistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: accept, ...carmen },
    body: JSON.stringify({ mensajes: [{ rol: 'usuario', texto: pregunta }] }),
  });

/** Los resultados de herramientas que la tienda mandó en la petición i (su último mensaje). */
const resultadosDe = (i: number) => modelo.peticiones[i]!.cuerpo.messages.at(-1).content;

// Lo que encuentra la búsqueda para una pregunta, como fuentes (sin el texto ni la distancia).
const fuentesDe = async (pregunta: string) =>
  (await consultarAyuda(pregunta)).map(({ pagina, titulo, seccion }) => ({
    pagina,
    titulo,
    seccion,
  }));

/** Un bloque de texto que cita esa sección: el resultado número indice de la petición. */
const citando = (text: string, fuente: Fuente, indice = 0) =>
  bloqueCitado(text, { indice, ...origenDe(fuente), texto: '…' });

test('el asistente busca en la ayuda: los trozos van al modelo como search_result, y fuentes son las secciones que cita', async () => {
  const pregunta = '¿Puedo devolver un producto?';
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta }, 'toolu_1')),
    // El modelo contesta citando el primer resultado (lo que hace la API con las citas encendidas).
    mensaje([
      bloqueTexto('Sí: según la ayuda de la tienda (Cancelaciones y devoluciones), '),
      bloqueCitado('tienes 30 días desde que lo recibes.', {
        indice: 0,
        source: 'ayuda/devoluciones.md',
        title: 'Cancelaciones y devoluciones: Devolver un producto',
        texto: 'Tienes 30 días…',
      }),
    ]),
  );
  const res = await preguntar('¿Puedo devolver un producto?');
  assert.equal(res.status, 200);
  const respuesta = await res.clone().json();
  // El texto, con los bloques juntos (las citas no cambian el texto).
  assert.equal(
    respuesta.texto,
    'Sí: según la ayuda de la tienda (Cancelaciones y devoluciones), tienes 30 días desde que lo recibes.',
  );
  // Las fuentes: la sección que cita la respuesta, y no las tres que devolvió la herramienta.
  assert.equal((await fuentesDe(pregunta)).length, FRAGMENTOS);
  assert.deepEqual(respuesta.fuentes, [DEVOLVER]);
  await cumpleContrato(res, 'post', '/asistente');

  // La definición que vio el modelo: la de la búsqueda por el significado.
  const definicion = modelo.peticiones[0]!.cuerpo.tools.find(
    (herramienta: { name: string }) => herramienta.name === 'buscar_en_ayuda',
  );
  assert.equal(definicion.description, DESCRIPCION_POR_SIGNIFICADO);
  assert.equal(definicion.strict, true);
  // Lo que recibió en la segunda vuelta: un tool_result con tres search_result, citas encendidas.
  const [resultado] = resultadosDe(1);
  assert.equal(resultado.tool_use_id, 'toolu_1');
  assert.equal(resultado.content.length, FRAGMENTOS);
  assert.deepEqual(resultado.content[0], {
    type: 'search_result',
    source: 'ayuda/devoluciones.md',
    title: 'Cancelaciones y devoluciones: Devolver un producto',
    content: [{ type: 'text', text: (await consultarAyuda(pregunta))[0]!.texto }],
    citations: { enabled: true },
  });
  // Y el mensaje del modelo con su cita vuelve tal cual en la conversación (si hubiera otra vuelta,
  // la API lo acepta: las citas en los mensajes del asistente sí valen).
});

test('dos búsquedas en una respuesta: las fuentes, las que cita, sin repetir y en el orden en que las cita', async () => {
  const primera = '¿Puedo devolver un producto?';
  const segunda = '¿Cuándo llega el reembolso de un producto?';
  const reembolso = (await fuentesDe(segunda)).find(
    (f) => f.seccion === 'Cuándo llega el reembolso',
  );
  assert.ok(reembolso, 'la segunda búsqueda encuentra la sección del reembolso');
  // Una cita de algo que la tienda no le ha dado al modelo: no cuenta.
  const inventada = { pagina: 'tienda', titulo: 'La tienda física', seccion: 'Dónde estamos' };
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta: primera }, 'toolu_1')),
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta: segunda }, 'toolu_2')),
    mensaje([
      citando('Tienes 30 días', DEVOLVER),
      bloqueTexto(', '),
      citando('y el reembolso tarda de 5 a 10 días laborables', reembolso, 3),
      bloqueTexto(' '),
      citando('(desde que lo recibes).', DEVOLVER),
      citando(' Y puedes ir a vernos.', inventada, 4),
    ]),
  );
  const res = await preguntar('¿Puedo devolver algo y cuándo me devolvéis el dinero?');
  const { fuentes } = await res.json();
  assert.deepEqual(fuentes, [DEVOLVER, reembolso]);
});

test('un «no lo sé» que no cita nada no tiene fuentes, aunque el modelo haya leído tres secciones', async () => {
  const pregunta = '¿Tenéis una tienda física donde ir a ver los productos?';
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta }, 'toolu_1')),
    texto('La ayuda de la tienda no dice nada de eso: escribe a soporte@tienda.example.'),
  );
  const respuesta = await (await preguntar(pregunta)).json();
  // Por el significado, la búsqueda siempre encuentra tres secciones, y el modelo las ha leído.
  const [resultado] = resultadosDe(1);
  assert.equal(resultado.content.length, FRAGMENTOS);
  // Pero la respuesta no sale de ninguna, y no cita ninguna.
  assert.deepEqual(respuesta.fuentes, []);
});

test('en streaming: el evento herramienta dice «Buscando en la ayuda…», y fin lleva las fuentes que cita', async () => {
  const pregunta = '¿Puedo devolver un producto?';
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta }, 'toolu_1')),
    mensaje([
      bloqueTexto('Sí, '),
      bloqueCitado('en 30 días.', {
        indice: 0,
        source: 'ayuda/devoluciones.md',
        title: 'Cancelaciones y devoluciones: Devolver un producto',
        texto: 'Tienes 30 días…',
      }),
    ]),
  );
  const res = await preguntar(pregunta, 'text/event-stream');
  assert.match(res.headers.get('content-type')!, /^text\/event-stream/);
  const eventos = (await res.text())
    .split('\n\n')
    .filter((bloque) => bloque !== '')
    .map((bloque) => ({
      evento: bloque.match(/^event: (.*)$/m)![1]!,
      datos: JSON.parse(bloque.match(/^data: (.*)$/m)![1]!),
    }));
  assert.deepEqual(eventos[0], {
    evento: 'herramienta',
    datos: { nombre: 'buscar_en_ayuda', etiqueta: 'Buscando en la ayuda…' },
  });
  const trozos = eventos.filter(({ evento }) => evento === 'texto').map(({ datos }) => datos.texto);
  assert.equal(trozos.join(''), 'Sí, en 30 días.');
  const fin = eventos.at(-1)!;
  assert.equal(fin.evento, 'fin');
  assert.equal(fin.datos.texto, 'Sí, en 30 días.');
  // Las citas llegan en el flujo (citations_delta), y el SDK las junta en su bloque: la que cita.
  assert.deepEqual(fin.datos.fuentes, [DEVOLVER]);
  // Los datos de fin son una RespuestaAsistente: la misma forma que el 200 en JSON.
  await cumpleContrato(Response.json(fin.datos), 'post', '/asistente');
});

test('sin nada que encontrar (por palabras), el modelo recibe la frase que lo dice, y no hay fuentes', async () => {
  config.BUSQUEDA_SEMANTICA = 'no';
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta: 'tienda física' })),
    texto('La ayuda de la tienda no dice nada de eso: escribe a soporte@tienda.example.'),
  );
  const res = await preguntar('¿Tenéis tienda física?');
  assert.deepEqual((await res.json()).fuentes, []);
  const [resultado] = resultadosDe(1);
  assert.equal(resultado.content, SIN_RESULTADOS);
  assert.equal(resultado.is_error, undefined);
});

test('si el modelo se niega después de buscar, ni su texto ni fuentes', async () => {
  modelo.guion(
    pideHerramientas(
      bloqueHerramienta('buscar_en_ayuda', { pregunta: '¿Puedo devolver un producto?' }),
    ),
    rechazo('cyber'),
  );
  const respuesta = await (await preguntar('¿Puedo devolver un producto?')).json();
  assert.equal(respuesta.rechazada, true);
  assert.deepEqual(respuesta.fuentes, []);
});

test('una pregunta vacía no llega a buscar: is_error con el motivo, para que el modelo la corrija', async () => {
  modelo.guion(
    pideHerramientas(bloqueHerramienta('buscar_en_ayuda', { pregunta: '   ' })),
    texto('¿Qué quieres saber?'),
  );
  const respuesta = await (await preguntar('Ayuda')).json();
  assert.deepEqual(respuesta.fuentes, []);
  const [resultado] = resultadosDe(1);
  assert.equal(resultado.is_error, true);
  assert.match(resultado.content, /pregunta: No puede estar vacía/);
  assert.deepEqual(embebedor.pedidos, []);
});
// #endregion asistente

// #region mcp
test('MCP: buscar_en_ayuda, para cualquier clave, con la misma función; los trozos en JSON', async () => {
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
    const ayuda = tools.find((herramienta) => herramienta.name === 'buscar_en_ayuda')!;
    assert.equal(ayuda.description, DESCRIPCION_POR_SIGNIFICADO);
    assert.deepEqual(ayuda.inputSchema.required, ['pregunta']);
    assert.equal(ayuda.annotations?.readOnlyHint, true);
    const pregunta = '¿Puedo devolver un producto?';
    const resultado = (await mcp.callTool({
      name: 'buscar_en_ayuda',
      arguments: { pregunta },
    })) as CallToolResult;
    assert.notEqual(resultado.isError, true);
    const encontrados = JSON.parse((resultado.content[0] as { text: string }).text);
    assert.deepEqual(encontrados, await consultarAyuda(pregunta));
    assert.equal(encontrados[0].seccion, 'Devolver un producto');
  } finally {
    await mcp.close();
    await new Promise((cerrado) => servidor!.close(cerrado));
  }
});
// #endregion mcp
