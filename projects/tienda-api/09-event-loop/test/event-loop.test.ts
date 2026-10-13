import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';

const ejecutar = promisify(execFile);

/** Lanza dos peticiones a la vez y devuelve en qué orden terminan. */
async function ordenDeLlegada(lenta: string): Promise<string[]> {
  const llegadas: string[] = [];
  const pedir = async (ruta: string) => {
    await app.request(ruta);
    llegadas.push(ruta);
  };
  await Promise.all([pedir(lenta), pedir('/productos')]);
  return llegadas;
}

test('/lento bloquea: /productos tiene que esperar a que termine', async () => {
  assert.deepEqual(await ordenDeLlegada('/lento'), ['/lento', '/productos']);
});

test('/lento-asincrono no bloquea: /productos termina antes', async () => {
  assert.deepEqual(await ordenDeLlegada('/lento-asincrono'), ['/productos', '/lento-asincrono']);
});

test('las dos rutas lentas responden cuánto han tardado', async () => {
  for (const ruta of ['/lento', '/lento-asincrono']) {
    const { ms } = await (await app.request(ruta)).json();
    assert.ok(ms > 0, ruta);
  }
});

test('ejemplos/orden.ts: primero el código, luego la promesa, al final el temporizador', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/orden.ts']);
  assert.deepEqual(stdout.trim().split('\n'), [
    '1. Empieza el programa',
    '2. Termina el código, de arriba abajo',
    '3. La promesa ya resuelta',
    '4. El temporizador, aunque sea de 0 ms',
  ]);
});
