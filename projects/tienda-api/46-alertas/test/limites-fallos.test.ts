// Los límites cuando su almacén falla (Fase 10, lección 6). Hasta el paso 45, un Redis congelado
// (docker compose pause redis) dejaba el inicio de sesión esperando sin fin: el limitador le
// preguntaba y nadie contestaba. Ahora cada pregunta tiene un tiempo máximo, y cada límite dice qué
// hacer si no hay respuesta: cerrar (no deja pasar: 503) o abrir (deja pasar, y lo dice en el log).
// Un Redis congelado de verdad no se puede preparar en un test: se usa un almacén que no contesta
// nunca, que es lo que ve el limitador. El docker pause de verdad se hace en la lección 7.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { app } from '../src/app.ts';
import { log } from '../src/log.ts';
import {
  type AlmacenLimites,
  almacen,
  crearLimitador,
  type Limite,
  LimitesSinAlmacen,
} from '../src/limites.ts';
import { usarBd } from './bd.ts';

usarBd();

const nunca = () => new Promise<never>(() => {});
// Un almacén que no contesta nunca: Redis congelado.
const congelado: AlmacenLimites = { intentos: nunca, apuntar: nunca };
// Un almacén que da un error: Redis caído, sin conexión.
const roto: AlmacenLimites = {
  intentos: async () => {
    throw new Error('ECONNREFUSED');
  },
  apuntar: async () => {
    throw new Error('ECONNREFUSED');
  },
};

const limite = (siFalla: Limite['siFalla']): Limite => ({
  nombre: 'prueba',
  maximo: 3,
  ventana: 60,
  siFalla,
});

for (const [caso, almacenQueFalla] of [
  ['no contesta', congelado],
  ['da un error', roto],
] as const) {
  test(`cerrar, con un almacén que ${caso}: LimitesSinAlmacen en menos de espera + 50 ms`, async (t) => {
    t.mock.method(log, 'warn', () => {});
    const limitador = crearLimitador(limite('cerrar'), almacenQueFalla, Date.now, 100);
    const antes = performance.now();
    await assert.rejects(limitador.comprobar('ana'), LimitesSinAlmacen);
    assert.ok(performance.now() - antes < 150, `${performance.now() - antes} ms`);
    await assert.rejects(limitador.apuntar('ana'), LimitesSinAlmacen);
  });

  test(`abrir, con un almacén que ${caso}: deja pasar, y un solo aviso en el log por segundo`, async (t) => {
    const aviso = t.mock.method(log, 'warn', () => {});
    // El reloj del limitador, el del test: diez llamadas dentro del mismo segundo.
    let ahora = 1_000_000;
    const limitador = crearLimitador(limite('abrir'), almacenQueFalla, () => ahora, 20);
    for (let vez = 0; vez < 10; vez++) {
      const estado = await limitador.comprobar('ana');
      assert.deepEqual(estado, { permitido: true, quedan: 3, reintentarEn: 0, reinicioEn: 0 });
      await limitador.apuntar('ana');
      ahora += 50;
    }
    assert.equal(aviso.mock.callCount(), 1);
    assert.equal((aviso.mock.calls[0]!.arguments[0] as { limite: string }).limite, 'prueba');
    // Pasado el segundo, otro aviso.
    ahora += 1000;
    await limitador.comprobar('ana');
    assert.equal(aviso.mock.callCount(), 2);
  });
}

test('con un almacén que contesta, nada cambia: cuenta y no avisa', async (t) => {
  const aviso = t.mock.method(log, 'warn', () => {});
  const limitador = crearLimitador(limite('cerrar'));
  await limitador.apuntar('ana');
  assert.equal((await limitador.comprobar('ana')).quedan, 2);
  assert.equal(aviso.mock.callCount(), 0);
});

// Las rutas, con el almacén de la tienda congelado: sus dos funciones no contestan nunca.
const desde = (ip: string) => ({ incoming: { socket: { remoteAddress: ip } } });
function congelarAlmacen() {
  mock.method(log, 'warn', () => {});
  mock.method(almacen, 'intentos', nunca);
  mock.method(almacen, 'apuntar', nunca);
}

test('iniciar sesión sin poder comprobar los intentos: 503 rápido, con Retry-After', async (t) => {
  congelarAlmacen();
  t.after(() => mock.restoreAll());
  const antes = performance.now();
  const res = await app.request(
    '/v2/sesion',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'carmen@ejemplo.com', contrasena: 'carmen-practica-2026' }),
    },
    desde('203.0.113.40'),
  );
  assert.ok(performance.now() - antes < 1000, `${performance.now() - antes} ms`);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('retry-after'), '5');
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).title, 'No se pueden comprobar los intentos');
  // Ni la contraseña buena abre una sesión.
  assert.equal(res.headers.get('set-cookie'), null);
});

test('crear una cuenta sin poder comprobar los intentos: 201 (ese límite se abre)', async (t) => {
  congelarAlmacen();
  t.after(() => mock.restoreAll());
  const res = await app.request(
    '/v2/cuentas',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'sin-redis@ejemplo.com',
        contrasena: 'una frase larga de prueba',
      }),
    },
    desde('203.0.113.41'),
  );
  assert.equal(res.status, 201);
});
