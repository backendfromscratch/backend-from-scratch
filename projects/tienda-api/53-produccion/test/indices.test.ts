import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { consultaPorCursor, type Cursor } from '../src/paginacion.ts';
import { ejecutar, usarBd } from './bd.ts';
import { ANA, CARMEN, comoUsuario } from './identidades.ts';

// Ana, admin, ve todos los pedidos; Carmen, clienta, los hace.
let ana: Record<string, string>;
let carmen: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
});

/** Pide una página y devuelve los ids de sus pedidos y la URL de la siguiente. */
async function pagina(url: string): Promise<{ ids: number[]; siguiente?: string }> {
  const res = await app.request(url, { headers: ana });
  assert.equal(res.status, 200, url);
  const siguiente = res.headers.get('link')?.match(/^<(.+)>; rel="next"$/)?.[1];
  return { ids: (await res.json()).map((pedido: { id: number }) => pedido.id), siguiente };
}

/** El plan de PostgreSQL para la consulta de una página de 11 pedidos, como texto. */
async function plan(despuesDe?: Cursor): Promise<string> {
  // toSQL() da el SQL que Drizzle escribe para esa consulta, y sus parámetros.
  const { sql, params } = consultaPorCursor(11, despuesDe).toSQL();
  const { rows } = await pool.query(`EXPLAIN ${sql}`, params);
  return rows.map((fila) => fila['QUERY PLAN']).join('\n');
}

const delMedio = { creadoEn: '2026-09-01T00:00:00.000Z', id: 0 };

test('la migración 003 crea el índice de la lista de pedidos: por fecha y por id, de mayor a menor', async () => {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'pedidos_por_fecha'`,
  );
  assert.match(rows[0].indexdef, /ON public\.pedidos USING btree \(creado_en DESC, id DESC\)$/);
});

test('por cursor se ven todos los pedidos una sola vez, aunque entren nuevos entre dos páginas', async () => {
  const vistos: number[] = [];
  let url: string | undefined = '/v2/pedidos?limite=4';
  while (url) {
    const { ids, siguiente } = await pagina(url);
    vistos.push(...ids);
    url = siguiente;
    // Entre una página y la siguiente, alguien hace un pedido: es más nuevo, va delante del todo.
    await app.request('/v2/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...carmen },
      body: '{"productoId":1,"cantidad":1}',
    });
  }
  assert.deepEqual(
    vistos,
    Array.from({ length: 25 }, (_, i) => 25 - i),
  );
});

test('un cursor de antes, que solo llevaba el id, ya no vale: 422', async () => {
  const res = await app.request('/v2/pedidos?cursor=MTY', { headers: ana });
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errores, [
    { campo: 'cursor', problema: 'El cursor no es válido' },
  ]);
});

test('con 100 000 pedidos, la lista usa el índice; sin él, lee la tabla entera', async () => {
  const { stdout } = await ejecutar('node', ['scripts/muchos-pedidos.ts']);
  assert.match(stdout, /^Ahora hay 1000\d\d pedidos$/m);

  // La primera página y una del medio: las dos van por el índice, directas a su sitio.
  const primera = await plan();
  assert.match(primera, /Index Scan using pedidos_por_fecha on pedidos/);
  const enMedio = await plan(delMedio);
  assert.match(enMedio, /Index Scan using pedidos_por_fecha on pedidos/);
  assert.match(enMedio, /Index Cond: \(ROW\(creado_en, id\) < ROW\(/);

  // Sin el índice, PostgreSQL tiene que leer todos los pedidos y ordenarlos para quedarse con 11.
  await pool.query('DROP INDEX pedidos_por_fecha');
  const sinIndice = await plan(delMedio);
  assert.doesNotMatch(sinIndice, /Index Scan/);
  assert.match(sinIndice, /Seq Scan on pedidos/);
});
