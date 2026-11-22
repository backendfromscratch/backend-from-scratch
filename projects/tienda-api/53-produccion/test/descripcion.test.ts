// La descripción de un producto escrita por el modelo (Fase 11, lección 7): la ruta que la encarga
// (POST /v2/productos/{id}/descripcion) y el trabajo que la escribe (asistente/descripcion.ts),
// contra el modelo falso. Con Redis (REDIS_URL_TESTS), también por la cola de verdad, con un
// trabajador y sus reintentos.
import assert from 'node:assert/strict';
import { after, beforeEach, mock, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { usarBd } from './bd.ts';
import { ANA, CARMEN, comoUsuario } from './identidades.ts';
import { arrancarModeloFalso, rechazo, sobrecargado, texto } from './modelo-falso.ts';

const modelo = await arrancarModeloFalso();
process.env.ANTHROPIC_BASE_URL = modelo.url;
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());
const { app } = await import('../src/app.ts');
const { pool } = await import('../src/bd.ts');
const { log } = await import('../src/log.ts');
const { escribirDescripcion } = await import('../src/asistente/descripcion.ts');
const { conectarRedis } = await import('../src/almacen-redis.ts');
const { crearCola, crearTrabajador, procesar } = await import('../src/cola.ts');
const { cumpleContrato } = await import('./contrato.ts');

let ana: Record<string, string>;
let carmen: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
});

const encargar = (id: number, cabeceras: Record<string, string> = ana) =>
  app.request(`/v2/productos/${id}/descripcion`, { method: 'POST', headers: cabeceras });

const descripcionDe = async (id: number) =>
  (
    await pool.query<{ d: string | null }>('SELECT descripcion AS d FROM productos WHERE id = $1', [
      id,
    ])
  ).rows[0]?.d;

// Los eventos salientes sin enviar de un tipo (salientes.ts).
const pendientes = async (tipo: string) =>
  (
    await pool.query<{ datos: any }>(
      'SELECT datos FROM eventos_salientes WHERE tipo = $1 AND enviado_en IS NULL ORDER BY id',
      [tipo],
    )
  ).rows.map((fila) => fila.datos);

const marcarEnviados = () =>
  pool.query('UPDATE eventos_salientes SET enviado_en = now() WHERE enviado_en IS NULL');

// #region ruta
test('encargar la descripción: 202, Location del producto, y un evento saliente para el trabajador', async () => {
  await marcarEnviados();
  const res = await encargar(3);
  assert.equal(res.status, 202);
  assert.deepEqual(await res.clone().json(), { productoId: 3, estado: 'en-cola' });
  assert.equal(res.headers.get('location'), '/v2/productos/3');
  await cumpleContrato(res, 'post', '/productos/{id}/descripcion');
  const [evento, ...otros] = await pendientes('descripcion-de-producto');
  assert.equal(otros.length, 0);
  assert.equal(evento.productoId, 3);
  assert.match(evento.idEncargo, /^[0-9a-f-]{36}$/);
  // La ruta no llama al modelo: eso es del trabajador.
  assert.equal(modelo.peticiones.length, 0);
});

test('solo admin: un cliente, 403; sin identificarse, 401; un producto que no existe, 404', async () => {
  assert.equal((await encargar(3, carmen)).status, 403);
  assert.equal((await encargar(3, {})).status, 401);
  const noExiste = await encargar(999);
  assert.equal(noExiste.status, 404);
  await cumpleContrato(noExiste, 'post', '/productos/{id}/descripcion');
});
// #endregion ruta

// #region trabajo
test('el trabajo: pide la descripción con los datos del producto, la guarda y encarga el vector nuevo', async () => {
  await marcarEnviados();
  const info = mock.method(log, 'info', () => {});
  try {
    const nueva = 'Sudadera gruesa con capucha y bolsillo delantero, para cuando refresca.';
    modelo.guion(texto(`  ${nueva}\n`, { uso: { entrada: 400, salida: 40 } }));
    await procesar({ tipo: 'descripcion-de-producto', productoId: 3, idEncargo: 'e1' });
    // Guardada, sin los espacios de los lados (el mismo esquema que una escrita a mano).
    assert.equal(await descripcionDe(3), nueva);
    // Como cualquier cambio de descripción: su vector, a calcular otra vez (lección 5).
    const [vector] = await pendientes('vector-de-producto');
    assert.equal(vector.productoId, 3);
    // La petición: sus instrucciones, los datos del producto en JSON y nada de herramientas.
    const { cuerpo } = modelo.peticiones[0]!;
    assert.equal(cuerpo.model, 'claude-haiku-5-5');
    assert.match(cuerpo.system, /Escribes las descripciones de los productos/);
    assert.equal(cuerpo.tools, undefined);
    assert.deepEqual(JSON.parse(cuerpo.messages[0].content), {
      nombre: 'Sudadera',
      precioCentimos: 3500,
      categorias: ['Ropa'],
      descripcion:
        'Sudadera de algodón grueso con capucha y bolsillo delantero, para abrigarte cuando refresca.',
    });
    // Lo que ha costado, al log, como las llamadas del asistente.
    const [linea] = info.mock.calls
      .filter((llamada) => llamada.arguments[1] === 'llamada al modelo')
      .map((llamada) => llamada.arguments[0] as Record<string, unknown>);
    assert.partialDeepStrictEqual(linea, {
      trabajo: 'descripcion-de-producto',
      productoId: 3,
      costeUsd: 0.00006,
    });
  } finally {
    info.mock.restore();
  }
});

test('una descripción que no vale (más de 500 caracteres) no se guarda: el trabajo falla, y la cola lo repetirá', async () => {
  const antes = await descripcionDe(2);
  modelo.guion(texto('a'.repeat(501)));
  await assert.rejects(
    procesar({ tipo: 'descripcion-de-producto', productoId: 2, idEncargo: 'e2' }),
    /no ha escrito una descripción que valga/,
  );
  assert.equal(await descripcionDe(2), antes);
});

test('si el modelo se niega, no se guarda nada ni se repite: un aviso en el log', async () => {
  const antes = await descripcionDe(2);
  const aviso = mock.method(log, 'warn', () => {});
  try {
    modelo.guion(rechazo());
    await escribirDescripcion(2);
    assert.equal(await descripcionDe(2), antes);
    assert.equal(
      aviso.mock.calls.filter(
        (llamada) => llamada.arguments[1] === 'el modelo se ha negado a escribir la descripción',
      ).length,
      1,
    );
  } finally {
    aviso.mock.restore();
  }
});

test('un producto que ya no existe: no se llama al modelo', async () => {
  await escribirDescripcion(999);
  assert.equal(modelo.peticiones.length, 0);
});

test('un 529 del modelo: el error sale del trabajo (con MODELO_REINTENTOS=0, sin reintentos del SDK)', async () => {
  modelo.guion(sobrecargado());
  await assert.rejects(escribirDescripcion(2), { status: 529 });
});
// #endregion trabajo

// #region cola
const url = process.env.REDIS_URL_TESTS;
test(
  'por la cola de verdad: el modelo falla una vez (529), BullMQ lo reintenta y la descripción se guarda',
  { skip: url ? false : 'sin Redis: pon REDIS_URL_TESTS en test/.env para probarlo' },
  async () => {
    const conexion = conectarRedis(url!);
    const cola = crearCola(conexion);
    await cola.obliterate({ force: true });
    const trabajador = crearTrabajador({ url });
    const aviso = mock.method(log, 'warn', () => {});
    try {
      const nueva = 'Taza de cerámica para el café de la mañana, y un buen regalo.';
      modelo.guion(sobrecargado(), texto(nueva));
      await cola.add(
        'descripcion-de-producto',
        { tipo: 'descripcion-de-producto', productoId: 2, idEncargo: 'e3' },
        { jobId: 'descripcion-2-e3' },
      );
      // El primer intento falla; el segundo, al segundo (la espera de OPCIONES_TRABAJOS), sale.
      for (let ms = 0; (await descripcionDe(2)) !== nueva; ms += 100) {
        if (ms > 10_000) assert.fail('la descripción no se ha guardado en 10 segundos');
        await dormir(100);
      }
      assert.equal(modelo.peticiones.length, 2);
      const fallos = aviso.mock.calls.filter(
        (llamada) => llamada.arguments[1] === 'trabajo fallido: se reintentará',
      );
      assert.equal(fallos.length, 1);
    } finally {
      aviso.mock.restore();
      await trabajador.cerrar();
      await cola.obliterate({ force: true });
      await cola.close();
      conexion.destroy();
    }
  },
);
// #endregion cola
