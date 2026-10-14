import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { PEDIDOS_POR_CURSOR } from '../src/paginacion.ts';
import { ejecutar, usarBd } from './bd.ts';

usarBd();

/** Pide una página y devuelve los ids de sus pedidos y la URL de la siguiente. */
async function pagina(url: string): Promise<{ ids: number[]; siguiente?: string }> {
  const res = await app.request(url);
  assert.equal(res.status, 200, url);
  const siguiente = res.headers.get('link')?.match(/^<(.+)>; rel="next"$/)?.[1];
  return { ids: (await res.json()).map((pedido: { id: number }) => pedido.id), siguiente };
}

/** El plan de PostgreSQL para la consulta de la lista de pedidos, como texto. */
async function plan(...valores: unknown[]): Promise<string> {
  const { rows } = await pool.query(`EXPLAIN ${PEDIDOS_POR_CURSOR}`, valores);
  return rows.map((fila) => fila['QUERY PLAN']).join('\n');
}

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
      headers: { 'Content-Type': 'application/json' },
      body: '{"productoId":1,"cantidad":1}',
    });
  }
  assert.deepEqual(
    vistos,
    Array.from({ length: 25 }, (_, i) => 25 - i),
  );
});

test('un cursor de antes, que solo llevaba el id, ya no vale: 422', async () => {
  const res = await app.request('/v2/pedidos?cursor=MTY');
  assert.equal(res.status, 422);
  assert.deepEqual((await res.json()).errores, [
    { campo: 'cursor', problema: 'El cursor no es válido' },
  ]);
});

test('con 100 000 pedidos, la lista usa el índice; sin él, lee la tabla entera', async () => {
  const { stdout } = await ejecutar('node', ['scripts/muchos-pedidos.ts']);
  assert.match(stdout, /^Ahora hay 1000\d\d pedidos$/m);

  // La primera página y una del medio: las dos van por el índice, directas a su sitio.
  const primera = await plan('infinity', 0, null, 11);
  assert.match(primera, /Index Scan using pedidos_por_fecha on pedidos/);
  const delMedio = await plan('2026-09-01T00:00:00.000Z', 0, null, 11);
  assert.match(delMedio, /Index Scan using pedidos_por_fecha on pedidos/);
  assert.match(delMedio, /Index Cond: \(ROW\(creado_en, id\) < ROW\(/);

  // Sin el índice, PostgreSQL tiene que leer todos los pedidos y ordenarlos para quedarse con 11.
  await pool.query('DROP INDEX pedidos_por_fecha');
  const sinIndice = await plan('2026-09-01T00:00:00.000Z', 0, null, 11);
  assert.doesNotMatch(sinIndice, /Index Scan/);
  assert.match(sinIndice, /Seq Scan on pedidos/);
});
