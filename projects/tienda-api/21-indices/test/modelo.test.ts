import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../src/bd.ts';
import { ejecutar, vaciarBd } from './bd.ts';

after(() => pool.end());

/** Comprueba que PostgreSQL rechaza la consulta, con el código de la regla que se rompe. */
const rechaza = (sql: string, code: string) => assert.rejects(pool.query(sql), { code });

test('npm run bd:migrar crea las tablas, y npm run bd:datos les pone los datos de ejemplo', async () => {
  await vaciarBd();
  const migrar = await ejecutar('node', ['scripts/migrar.ts']);
  assert.match(migrar.stdout, /^Aplicada: 001-tienda\.sql$/m);
  const datos = await ejecutar('node', ['scripts/cargar-datos.ts']);
  assert.equal(datos.stdout, 'Datos de ejemplo cargados\n');
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1`,
  );
  assert.deepEqual(
    rows.map((fila) => fila.table_name),
    [
      'categorias',
      'claves_idempotencia',
      'eventos_procesados',
      'migraciones',
      'pedidos',
      'productos',
      'productos_categorias',
    ],
  );
});

test('los ids los pone PostgreSQL, en orden; la Gorra no tiene pedidos', async () => {
  const { rows } = await pool.query(`
    SELECT p.id, p.nombre, count(pe.id)::int AS pedidos
    FROM productos p LEFT JOIN pedidos pe ON pe.producto_id = p.id
    GROUP BY p.id ORDER BY p.id
  `);
  assert.deepEqual(rows, [
    { id: 1, nombre: 'Camiseta', pedidos: 8 },
    { id: 2, nombre: 'Taza', pedidos: 9 },
    { id: 3, nombre: 'Sudadera', pedidos: 8 },
    { id: 4, nombre: 'Gorra', pedidos: 0 },
  ]);
});

// Los códigos son los de PostgreSQL (SQLSTATE): 23514, un CHECK; 23503, una clave foránea;
// 23505, un valor repetido donde tiene que ser único; 23502, un NOT NULL.
test('CHECK: un precio de 0 no entra', async () => {
  await rechaza(`INSERT INTO productos (nombre, precio_centimos) VALUES ('Gratis', 0)`, '23514');
});

test('NOT NULL: un producto sin precio no entra', async () => {
  await rechaza(`INSERT INTO productos (nombre) VALUES ('Sin precio')`, '23502');
});

test('REFERENCES: un pedido del producto 99, que no existe, no entra', async () => {
  await rechaza(
    `INSERT INTO pedidos (producto_id, cantidad, estado, creado_en) VALUES (99, 1, 'pendiente', now())`,
    '23503',
  );
});

test('UNIQUE: dos categorías con el mismo nombre, no', async () => {
  await rechaza(`INSERT INTO categorias (nombre) VALUES ('Ropa')`, '23505');
});

test('CHECK: un estado que no es de los cuatro (perdido) no entra', async () => {
  await rechaza(
    `INSERT INTO pedidos (producto_id, cantidad, estado, creado_en) VALUES (1, 1, 'perdido', now())`,
    '23514',
  );
});

test('PRIMARY KEY: la misma pareja de producto y categoría, dos veces no', async () => {
  await rechaza(
    `INSERT INTO productos_categorias (producto_id, categoria_id) VALUES (1, 1)`,
    '23505',
  );
});

test('un producto con pedidos no se puede borrar: los pedidos lo necesitan', async () => {
  await rechaza('DELETE FROM productos WHERE id = 1', '23503');
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM productos WHERE id = 1');
  assert.equal(rows[0].n, 1);
});

test('ON DELETE CASCADE: al borrar un producto sin pedidos, sus categorías se van con él', async () => {
  const categoriasDeLaGorra =
    'SELECT count(*)::int AS n FROM productos_categorias WHERE producto_id = 4';
  assert.equal((await pool.query(categoriasDeLaGorra)).rows[0].n, 2);
  await pool.query('DELETE FROM productos WHERE id = 4');
  assert.equal((await pool.query(categoriasDeLaGorra)).rows[0].n, 0);
  // Las categorías siguen ahí: solo se borran las parejas.
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM categorias')).rows[0].n, 3);
});
