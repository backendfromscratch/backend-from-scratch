// Producción no carga las cuentas de práctica (sus contraseñas son públicas) y el primer admin se
// crea con npm run crear-admin. Los scripts de verdad, como procesos, contra la base de datos de
// los tests.
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { pool } from '../src/bd.ts';
import { comprobarCredenciales } from '../src/usuarios.ts';
import { ejecutar, vaciarBd } from './bd.ts';

after(() => pool.end());

// Una base de datos con las tablas y nada más: lo que hay en producción antes de cargar nada.
beforeEach(async () => {
  await vaciarBd();
  await ejecutar('node', ['scripts/migrar.ts']);
});

/** Ejecuta un script y devuelve cómo ha terminado, sin lanzar si sale con un código distinto de 0. */
async function correr(...argumentos: string[]) {
  try {
    const { stdout, stderr } = await ejecutar('node', argumentos);
    return { codigo: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { codigo: code, stdout, stderr };
  }
}

const contar = async (tabla: 'usuarios' | 'productos') =>
  (await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`)).rows[0].n as number;

test('cargar-datos --sin-cuentas carga los productos y ninguna cuenta', async () => {
  const { codigo, stdout } = await correr('scripts/cargar-datos.ts', '--sin-cuentas');
  assert.equal(codigo, 0);
  assert.match(stdout, /^Datos de ejemplo cargados$/m);
  assert.doesNotMatch(stdout, /Cuentas de práctica/);
  assert.ok((await contar('productos')) > 0);
  assert.equal(await contar('usuarios'), 0);
});

test('cargar-datos sin el flag sigue cargando las cuentas de práctica', async () => {
  const { codigo, stdout } = await correr('scripts/cargar-datos.ts');
  assert.equal(codigo, 0);
  assert.match(stdout, /^Cuentas de práctica listas/m);
  assert.ok((await contar('productos')) > 0);
  assert.equal(await contar('usuarios'), 4);
});

test('cargar-datos con un argumento desconocido sale con código 1 y no carga nada', async () => {
  for (const argumento of ['--sin-cuenta', '--sin-cuentas=true', 'sin-cuentas']) {
    const { codigo, stdout, stderr } = await correr('scripts/cargar-datos.ts', argumento);
    assert.equal(codigo, 1, argumento);
    assert.doesNotMatch(stdout, /cargad|listas/);
    assert.match(stderr, /Argumento no válido/);
  }
  assert.equal(await contar('usuarios'), 0);
  assert.equal(await contar('productos'), 0);
});

const LINEA = /^Contraseña \(guárdala ahora, no se vuelve a enseñar\): (\S+)$/m;

test('crear-admin crea una cuenta admin, imprime una contraseña de 24 caracteres o más una sola vez, y esa contraseña inicia sesión', async () => {
  const { codigo, stdout } = await correr('scripts/crear-admin.ts', 'duena@mi-tienda.example');
  assert.equal(codigo, 0);
  const contrasena = stdout.match(LINEA)?.[1];
  assert.ok(contrasena && contrasena.length >= 24, `contraseña: ${contrasena}`);
  assert.equal(stdout.split(contrasena).length - 1, 1, 'la contraseña sale una sola vez');

  const { rows } = await pool.query('SELECT email, rol FROM usuarios');
  assert.deepEqual(rows, [{ email: 'duena@mi-tienda.example', rol: 'admin' }]);
  const usuario = await comprobarCredenciales('duena@mi-tienda.example', contrasena);
  assert.equal(usuario?.rol, 'admin');
});

test('crear-admin con un email que ya existe no cambia nada, no imprime contraseña y sale con código 1', async () => {
  await correr('scripts/cargar-datos.ts');
  const antes = await pool.query('SELECT * FROM usuarios ORDER BY id');
  const { codigo, stdout, stderr } = await correr('scripts/crear-admin.ts', 'carmen@ejemplo.com');
  assert.equal(codigo, 1);
  assert.doesNotMatch(stdout, /Contraseña/);
  assert.match(stderr, /ya hay una cuenta/i);
  assert.deepEqual((await pool.query('SELECT * FROM usuarios ORDER BY id')).rows, antes.rows);
});

test('crear-admin con un email no válido sale con código 1 y lo dice', async () => {
  for (const argumentos of [['esto-no-es-un-email'], []]) {
    const { codigo, stdout, stderr } = await correr('scripts/crear-admin.ts', ...argumentos);
    assert.equal(codigo, 1);
    assert.doesNotMatch(stdout, /Contraseña/);
    assert.match(stderr, /email/i);
  }
  assert.equal(await contar('usuarios'), 0);
});

test('la base de datos solo guarda el hash', async () => {
  const { stdout } = await correr('scripts/crear-admin.ts', 'admin@mi-tienda.example');
  const contrasena = stdout.match(LINEA)?.[1];
  assert.ok(contrasena);
  const { rows } = await pool.query('SELECT hash_contrasena FROM usuarios');
  assert.match(rows[0].hash_contrasena, /^\$argon2id\$/);
  const todo = await pool.query('SELECT u::text AS fila FROM usuarios u');
  assert.ok(todo.rows.every((fila) => !fila.fila.includes(contrasena)));
});
