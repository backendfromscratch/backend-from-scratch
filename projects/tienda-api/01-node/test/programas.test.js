import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

test('hola.js saluda y dice la versión de Node.js', async () => {
  const { stdout } = await ejecutar('node', ['hola.js']);
  assert.match(stdout, /^Hola desde Node\.js\nEstás usando Node\.js v\d+\.\d+\.\d+\n$/);
});

test('leer-productos.js lista los tres productos', async () => {
  const { stdout } = await ejecutar('node', ['leer-productos.js']);
  assert.equal(
    stdout,
    'La tienda tiene 3 productos:\n- Camiseta: 20 €\n- Taza: 8.5 €\n- Sudadera: 35 €\n',
  );
});
