import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { type AlmacenLimites, crearAlmacenEnMemoria, crearLimitador } from '../src/limites.ts';
import { ejecutar, usarBd } from './bd.ts';

usarBd();

// Cada test hace sus peticiones desde su propia IP: así los límites de uno no cuentan en otro. Con
// app.request no hay conexión de verdad; la IP va donde la busca getConnInfo.
const desde = (ip: string) => ({ incoming: { socket: { remoteAddress: ip } } });

const iniciar = (ip: string, email: string, contrasena: string) =>
  app.request(
    '/v2/sesion',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, contrasena }),
    },
    desde(ip),
  );

test('el undécimo intento fallido con el mismo email: 429 con Retry-After, aunque la contraseña sea la buena', async () => {
  const ip = '203.0.113.1';
  for (let vez = 1; vez <= 10; vez++) {
    const res = await iniciar(ip, 'luis@tienda.example', 'no-es-la-contrasena');
    assert.equal(res.status, 400, `intento ${vez}`);
    assert.match(res.headers.get('ratelimit')!, new RegExp(`"sesion-email";r=${10 - vez};t=\\d+`));
  }
  const bloqueado = await iniciar(ip, 'LUIS@tienda.example', 'luis-practica-2026');
  assert.equal(bloqueado.status, 429);
  assert.equal(bloqueado.headers.get('content-type'), 'application/problem+json');
  assert.equal(
    (await bloqueado.json()).type,
    'https://tienda.example/problemas/demasiados-intentos',
  );
  const espera = Number(bloqueado.headers.get('retry-after'));
  assert.ok(espera > 0 && espera <= 15 * 60, `Retry-After: ${espera}`);
  assert.equal(
    bloqueado.headers.get('ratelimit-policy'),
    '"sesion-email";q=10;w=900, "sesion-ip";q=30;w=900',
  );
  assert.equal(bloqueado.headers.get('set-cookie'), null);
});

test('otro email desde la misma IP tiene su propia cuenta; la IP, la suya, con un límite más alto', async () => {
  const ip = '203.0.113.2';
  for (let vez = 1; vez <= 10; vez++) await iniciar(ip, 'carmen@ejemplo.com', 'mala');
  assert.equal((await iniciar(ip, 'carmen@ejemplo.com', 'mala')).status, 429);
  const otro = await iniciar(ip, 'pablo@ejemplo.com', 'pablo-practica-2026');
  assert.equal(otro.status, 200);
  // Fallos de muchos emails desde una IP: al llegar a 30, la IP también se para.
  for (let vez = 1; vez <= 20; vez++) await iniciar(ip, `nadie${vez}@ejemplo.com`, 'mala');
  const res = await iniciar(ip, 'pablo@ejemplo.com', 'pablo-practica-2026');
  assert.equal(res.status, 429);
  assert.match(res.headers.get('ratelimit')!, /"sesion-ip";r=0;/);
});

test('crear cuentas: como mucho 5 por hora desde la misma IP', async () => {
  const alta = (n: number) =>
    app.request(
      '/v2/cuentas',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `nueva${n}@ejemplo.com`,
          contrasena: 'una frase larga de prueba',
        }),
      },
      desde('203.0.113.3'),
    );
  for (let n = 1; n <= 5; n++) assert.equal((await alta(n)).status, 201);
  const sexta = await alta(6);
  assert.equal(sexta.status, 429);
  assert.ok(Number(sexta.headers.get('retry-after')) > 0);
});

test('la ventana se desliza: pasado el tiempo del intento más antiguo, vuelve a caber uno', async () => {
  let ahora = 0;
  const limitador = crearLimitador(
    { nombre: 'prueba', maximo: 3, ventana: 60, siFalla: 'cerrar' },
    undefined,
    () => ahora,
  );
  for (const instante of [0, 20_000, 40_000]) {
    ahora = instante;
    await limitador.apuntar('ana');
  }
  ahora = 50_000;
  const lleno = await limitador.comprobar('ana');
  assert.deepEqual(lleno, { permitido: false, quedan: 0, reintentarEn: 10, reinicioEn: 10 });
  ahora = 60_001; // el de 0 ya ha salido de la ventana; los de 20 y 40, no
  assert.deepEqual(await limitador.comprobar('ana'), {
    permitido: true,
    quedan: 1,
    reintentarEn: 0,
    reinicioEn: 20,
  });
  // Otra clave, otra cuenta.
  assert.equal((await limitador.comprobar('luis')).quedan, 3);
});

test('el almacén se puede cambiar por otro (Redis, en la Fase 7) sin tocar el limitador', async () => {
  const llamadas: string[] = [];
  const memoria = crearAlmacenEnMemoria();
  const conLog: AlmacenLimites = {
    intentos: (clave, desdeInstante) => {
      llamadas.push(`intentos ${clave}`);
      return memoria.intentos(clave, desdeInstante);
    },
    apuntar: (clave, instante) => {
      llamadas.push(`apuntar ${clave}`);
      return memoria.apuntar(clave, instante);
    },
  };
  const limitador = crearLimitador(
    { nombre: 'prueba', maximo: 1, ventana: 60, siFalla: 'cerrar' },
    conLog,
  );
  await limitador.apuntar('ana');
  assert.equal((await limitador.comprobar('ana')).permitido, false);
  assert.deepEqual(llamadas, ['apuntar prueba:ana', 'intentos prueba:ana']);
});

test('sin un secreto, con uno corto o con el de ejemplo, el servidor no arranca', async () => {
  const casos = [
    [undefined, /WEBHOOK_SECRET: Falta WEBHOOK_SECRET/],
    ['corto', /WEBHOOK_SECRET es demasiado corto/],
    ['cambia-esto-por-un-secreto-de-openssl-rand', /WEBHOOK_SECRET es el de ejemplo/],
  ] as const;
  for (const [valor, mensaje] of casos) {
    const { WEBHOOK_SECRET, ...resto } = process.env;
    const env = valor === undefined ? resto : { ...resto, WEBHOOK_SECRET: valor };
    const resultado = await ejecutar('node', ['src/servidor.ts'], { env }).catch((error) => error);
    assert.equal(resultado.code, 1);
    assert.match(resultado.stderr, mensaje);
  }
});
