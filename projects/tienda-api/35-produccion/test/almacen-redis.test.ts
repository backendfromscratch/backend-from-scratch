// El almacén de los límites en Redis, contra un Redis de verdad: el de REDIS_URL_TESTS (test/.env).
// Sin esa variable, estos tests se saltan, y npm test funciona sin Redis; CI sí la pone. Cada test
// usa su propio prefijo, así que no toca nada más de ese Redis.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { type ClienteRedis, conectarRedis, crearAlmacenRedis } from '../src/almacen-redis.ts';
import { crearLimitador } from '../src/limites.ts';
import { ejecutar } from './bd.ts';

const url = process.env.REDIS_URL_TESTS;
const sinRedis = url
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// Dos clientes: como dos copias de la API, cada una con su conexión al mismo Redis.
let uno: ClienteRedis;
let otro: ClienteRedis;

before(() => {
  if (!url) return;
  uno = conectarRedis(url);
  otro = conectarRedis(url);
});

after(async () => {
  await uno?.close();
  await otro?.close();
});

const prefijo = () => `prueba-${randomUUID()}:`;

test(
  'Redis da los intentos de la ventana, del más antiguo al más nuevo, y olvida los demás',
  { skip: sinRedis },
  async () => {
    const almacen = crearAlmacenRedis(uno, prefijo());
    for (const instante of [1000, 3000, 2000]) await almacen.apuntar('ana', instante);
    assert.deepEqual(await almacen.intentos('ana', 0), [1000, 2000, 3000]);
    // «Posteriores a desde»: el de 1000 ya no cuenta, y Redis lo borra.
    assert.deepEqual(await almacen.intentos('ana', 1000), [2000, 3000]);
    assert.deepEqual(await almacen.intentos('ana', 0), [2000, 3000]);
    assert.deepEqual(await almacen.intentos('luis', 0), []);
  },
);

test(
  'dos copias de la API con el mismo Redis llevan una sola cuenta',
  { skip: sinRedis },
  async () => {
    const comun = prefijo();
    const limite = { nombre: 'sesion-email', maximo: 10, ventana: 15 * 60 };
    const copiaUno = crearLimitador(limite, crearAlmacenRedis(uno, comun));
    const copiaOtra = crearLimitador(limite, crearAlmacenRedis(otro, comun));
    // Diez fallos, la mitad en cada copia.
    for (let vez = 1; vez <= 5; vez++) {
      await copiaUno.apuntar('luis@tienda.example');
      await copiaOtra.apuntar('luis@tienda.example');
    }
    assert.equal((await copiaUno.comprobar('luis@tienda.example')).permitido, false);
    assert.equal((await copiaOtra.comprobar('luis@tienda.example')).permitido, false);
    // Con la memoria, cada copia habría visto solo 5.
    assert.equal((await copiaOtra.comprobar('ana@tienda.example')).quedan, 10);
  },
);

test(
  'dos intentos en el mismo milisegundo cuentan dos, y la clave caduca sola',
  { skip: sinRedis },
  async () => {
    const p = prefijo();
    const almacen = crearAlmacenRedis(uno, p);
    await Promise.all([almacen.apuntar('ana', 5000), almacen.apuntar('ana', 5000)]);
    assert.deepEqual(await almacen.intentos('ana', 0), [5000, 5000]);
    const caduca = await uno.pTTL(`${p}ana`);
    assert.ok(caduca > 0 && caduca <= 24 * 60 * 60 * 1000, `caduca en ${caduca} ms`);
  },
);

test(
  'con REDIS_URL, los límites de la tienda se guardan en Redis',
  { skip: sinRedis },
  async () => {
    const email = `${randomUUID()}@ejemplo.com`;
    // Otro proceso, con REDIS_URL: el mismo arranque que la API en Docker Compose.
    const codigo = `
    const { limites } = await import('./src/limites.ts');
    await limites.sesionPorEmail.apuntar(${JSON.stringify(email)});
    process.exit(0);
  `;
    await ejecutar('node', ['--input-type=module', '-e', codigo], {
      env: { ...process.env, REDIS_URL: url },
    });
    const clave = `limites:sesion-email:${email}`;
    assert.equal(await uno.zCard(clave), 1);
    await uno.del(clave);
  },
);
