import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { config } from '../src/config.ts';
import { ejecutar, usarBd } from './bd.ts';

usarBd();

/** Los productos de una URL de la API, como «id: categorías». */
async function categoriasDe(url: string): Promise<Record<number, string[]>> {
  const res = await app.request(url);
  assert.equal(res.status, 200, url);
  const lista: { id: number; categorias: string[] }[] = await res.json();
  return Object.fromEntries(lista.map((producto) => [producto.id, producto.categorias]));
}

test('v2 enseña las categorías de cada producto, en la lista y de uno en uno', async () => {
  assert.deepEqual(await categoriasDe('/v2/productos'), {
    1: ['Ropa'],
    2: ['Hogar', 'Regalos'],
    3: ['Ropa'],
    4: ['Ropa', 'Regalos'],
  });
  assert.deepEqual(await (await app.request('/v2/productos/2')).json(), {
    id: 2,
    nombre: 'Taza',
    precioCentimos: 850,
    stock: 60,
    categorias: ['Hogar', 'Regalos'],
  });
});

test('un producto nuevo empieza sin categorías y sin stock', async () => {
  const res = await app.request('/v2/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ADMIN_TOKEN}` },
    body: '{"nombre":"Chapa","precioCentimos":200}',
  });
  assert.equal(res.status, 201);
  const { id, ...producto } = await res.json();
  assert.deepEqual(producto, { nombre: 'Chapa', precioCentimos: 200, stock: 0, categorias: [] });
  await app.request(`/v2/productos/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.ADMIN_TOKEN}` },
  });
});

test('?categoria= filtra, sin importar las mayúsculas, y se combina con los otros filtros', async () => {
  const ids = async (url: string) => Object.keys(await categoriasDe(url)).map(Number);
  assert.deepEqual(await ids('/v2/productos?categoria=ropa'), [1, 3, 4]);
  assert.deepEqual(await ids('/v2/productos?categoria=REGALOS'), [2, 4]);
  assert.deepEqual(await ids('/v2/productos?categoria=juguetes'), []);
  const baratos = await (
    await app.request('/v2/productos?categoria=Ropa&maxCentimos=2000&orden=-precio')
  ).json();
  assert.deepEqual(
    baratos.map((producto: { nombre: string }) => producto.nombre),
    ['Camiseta', 'Gorra'],
  );
});

test('un valor raro en ?categoria= es solo un valor: no cambia la consulta', async () => {
  assert.deepEqual(
    await categoriasDe(`/v2/productos?categoria=${encodeURIComponent("x' OR '1'='1")}`),
    {},
  );
  const vacia = await app.request('/v2/productos?categoria=');
  assert.equal(vacia.status, 422);
  assert.deepEqual((await vacia.json()).errores, [
    { campo: 'categoria', problema: 'No puede estar vacío' },
  ]);
});

test('v1 no cambia: ni categorías ni filtro por categoría', async () => {
  assert.deepEqual(await (await app.request('/v1/productos/2')).json(), {
    id: 2,
    nombre: 'Taza',
    precio: 8.5,
  });
  const todos = await (await app.request('/v1/productos?categoria=hogar')).json();
  assert.equal(todos.length, 4);
});

test('el contrato documenta las categorías y el filtro', async () => {
  const doc = await (await app.request('/v2/openapi.json')).json();
  const producto = doc.components.schemas.Producto;
  assert.equal(producto.properties.categorias.type, 'array');
  assert.ok(producto.required.includes('categorias'));
  const filtros = doc.paths['/productos'].get.parameters.map((p: { name: string }) => p.name);
  assert.ok(filtros.includes('categoria'));
});

test('ejemplos/n-mas-uno.ts: N+1 consultas frente a una sola, con el mismo resultado', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/n-mas-uno.ts']);
  const [nMasUno, unaSola] = stdout.split(/^== /m).slice(1);
  // Una para los productos y una más por cada uno de los 4.
  assert.match(nMasUno!, /^Consultas a la base de datos: 5$/m);
  assert.match(unaSola!, /^Consultas a la base de datos: 1$/m);
  const resultado = /^Resultado: (.*)$/m;
  assert.equal(nMasUno!.match(resultado)![1], unaSola!.match(resultado)![1]);
});

test('la migración 004, que generó drizzle-kit, crea el índice por categoría', async () => {
  const { rows } = await pool.query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'productos_categorias_por_categoria'`,
  );
  assert.match(rows[0].indexdef, /ON public\.productos_categorias USING btree \(categoria_id\)$/);
});

test('drizzle-kit no ve cambios pendientes: src/esquema.ts y sus migraciones están al día', async () => {
  const { stdout } = await ejecutar('npx', ['drizzle-kit', 'generate']);
  assert.match(stdout, /No schema changes, nothing to migrate/);
});
