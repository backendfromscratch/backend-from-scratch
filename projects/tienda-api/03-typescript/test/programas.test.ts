import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { buscarProducto, total } from '../src/productos.ts';

const ejecutar = promisify(execFile);

test('buscarProducto encuentra un producto o devuelve undefined', () => {
  assert.equal(buscarProducto(2)?.nombre, 'Taza');
  assert.equal(buscarProducto(99), undefined);
});

test('total multiplica el precio por la cantidad', () => {
  assert.equal(total({ id: 1, nombre: 'Camiseta', precio: 20 }, 3), 60);
});

test('main.ts se ejecuta sin compilar', async () => {
  const { stdout } = await ejecutar('node', ['src/main.ts']);
  assert.equal(stdout, 'Pedido 1: 3 × Taza = 25.5 €\nHa llegado un producto: Gorra\n');
});

test('tsc encuentra el error del ejemplo, y Node lo ejecuta igual', async () => {
  const tsc = await ejecutar('npx', ['tsc', '-p', 'ejemplos']).catch((error) => error);
  assert.match(tsc.stdout, /error TS2322: Type 'string' is not assignable to type 'number'/);
  const { stdout } = await ejecutar('node', ['ejemplos/error-de-tipo.ts']);
  assert.equal(stdout, '17\n');
});
