import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

test('productos.js filtra, calcula y pasa a JSON y de vuelta', async () => {
  const { stdout } = await ejecutar('node', ['productos.js']);
  assert.equal(
    stdout,
    [
      'De menos de 25 €: Camiseta, Taza',
      'Dos de Camiseta: 40 €',
      'Dos de Taza: 17 €',
      'Dos de Sudadera: 70 €',
      '{"id":2,"nombre":"Taza","precio":8.5}',
      'Del texto al objeto: Gorra, 15 €',
      '',
    ].join('\n'),
  );
});

test('esperar.js espera al fichero antes de seguir', async () => {
  const { stdout } = await ejecutar('node', ['esperar.js']);
  assert.equal(stdout, 'Antes de leer el fichero\nEl fichero tiene 3 productos\n');
});
