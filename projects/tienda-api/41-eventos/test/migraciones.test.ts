import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { ejecutar, vaciarBd } from './bd.ts';

after(() => pool.end());

// Las migraciones del proyecto, en orden: 001-tienda.sql, 002-stock.sql…
const todas = (await readdir('bd/migraciones')).sort();

/** Ejecuta scripts/migrar.ts (con otra carpeta, si se le da) y devuelve su salida, aunque falle. */
async function migrar(carpeta?: string) {
  const argumentos = carpeta === undefined ? [] : [carpeta];
  return ejecutar('node', ['scripts/migrar.ts', ...argumentos]).catch((error) => error);
}

/** Una carpeta temporal con las migraciones del proyecto que se le digan. */
async function carpetaCon(...migraciones: string[]) {
  const carpeta = await mkdtemp(join(tmpdir(), 'migraciones-'));
  for (const nombre of migraciones) await cp(join('bd/migraciones', nombre), join(carpeta, nombre));
  return carpeta;
}

const columnas = async (tabla: string) =>
  (
    await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY 1',
      [tabla],
    )
  ).rows.map((fila) => fila.column_name);

const apuntadas = async () =>
  (await pool.query('SELECT nombre FROM migraciones ORDER BY nombre')).rows.map((f) => f.nombre);

test('en una base de datos vacía se aplican todas, en orden, y quedan apuntadas', async () => {
  await vaciarBd();
  const { stdout } = await migrar();
  assert.equal(stdout, todas.map((nombre) => `Aplicada: ${nombre}\n`).join(''));
  assert.deepEqual(await apuntadas(), todas);
});

test('migrar otra vez no aplica nada: la base de datos ya está al día', async () => {
  const { stdout } = await migrar();
  assert.equal(stdout, 'No hay migraciones nuevas: la base de datos está al día\n');
  assert.deepEqual(await apuntadas(), todas);
});

test('una migración que falla no deja nada a medias, ni se apunta', async () => {
  const carpeta = await carpetaCon(...todas);
  // El primer cambio funcionaría; el segundo divide entre cero.
  await writeFile(
    join(carpeta, '999-falla.sql'),
    'ALTER TABLE productos ADD COLUMN color text;\nSELECT 1 / 0;\n',
  );
  try {
    const resultado = await migrar(carpeta);
    assert.equal(resultado.code, 1);
    assert.match(resultado.stderr, /^No se ha aplicado 999-falla\.sql: division by zero$/m);
    assert.ok(!(await columnas('productos')).includes('color'), 'la columna no se queda');
    assert.deepEqual(await apuntadas(), todas);
  } finally {
    await rm(carpeta, { recursive: true });
  }
});

test('002 en una tabla que ya tiene filas: las que había reciben el stock de partida', async () => {
  await vaciarBd();
  const carpeta = await carpetaCon('001-tienda.sql');
  await migrar(carpeta);
  await rm(carpeta, { recursive: true });
  await pool.query(`INSERT INTO productos (nombre, precio_centimos) VALUES ('Taza', 850)`);
  assert.ok(!(await columnas('productos')).includes('stock'));

  const { stdout } = await migrar();
  assert.match(stdout, /^Aplicada: 002-stock\.sql$/m);
  assert.deepEqual((await pool.query('SELECT nombre, stock FROM productos')).rows, [
    { nombre: 'Taza', stock: 10 },
  ]);
  // Las reglas del tercer paso: un producto nuevo empieza con 0, y el stock no puede ser negativo.
  const gorra = await pool.query(
    `INSERT INTO productos (nombre, precio_centimos) VALUES ('Gorra', 1500) RETURNING stock`,
  );
  assert.equal(gorra.rows[0].stock, 0);
  await assert.rejects(pool.query('UPDATE productos SET stock = -1'), { code: '23514' });
});

test('bd:datos en la base de datos de la Fase 5: añade las cuentas, y no repite los productos', async () => {
  // Una base de datos como la de quien viene de la Fase 5: migrada, con productos y sin cuentas.
  await vaciarBd();
  await migrar();
  await pool.query(await readFile('bd/datos.sql', 'utf8'));
  for (let vez = 1; vez <= 2; vez++) {
    const { stdout } = await ejecutar('node', ['scripts/cargar-datos.ts']);
    assert.match(stdout, /^La base de datos ya tiene productos/m);
  }
  const cuenta = async (tabla: string) =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`)).rows[0].n;
  assert.equal(await cuenta('productos'), 4);
  assert.equal(await cuenta('usuarios'), 4, 'las cuatro cuentas, una sola vez');
});

test('v2 enseña el stock de cada producto, y lo documenta; v1 sigue igual', async () => {
  const taza = await (await app.request('/v2/productos/2')).json();
  assert.equal(taza.stock, 60);
  const lista = await (await app.request('/v2/productos')).json();
  assert.deepEqual(
    lista.map((producto: { stock: number }) => producto.stock),
    [40, 60, 25, 15],
  );
  assert.deepEqual(await (await app.request('/v1/productos/2')).json(), {
    id: 2,
    nombre: 'Taza',
    precio: 8.5,
  });
  const doc = await (await app.request('/v2/openapi.json')).json();
  const producto = doc.components.schemas.Producto;
  assert.equal(producto.properties.stock.type, 'integer');
  assert.equal(producto.properties.stock.minimum, 0);
  assert.ok(producto.required.includes('stock'));
});
