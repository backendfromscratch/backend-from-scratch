// Tests de punta a punta (Fase 10, lección 2): la tienda de verdad, la de Compose, con su API, su
// base de datos, su cola, su trabajador y su correo. Solo se usa fetch: lo que hace un cliente.
// npm run e2e, con la tienda arrancada. Si algo falla aquí y no en los demás tests, el fallo está
// en cómo encajan las piezas, no en una de ellas.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { BASE_URL, esperar, MAILPIT_URL, ORIGEN } from './ayuda.ts';

const ejecutar = promisify(execFile);
const json = { 'Content-Type': 'application/json' };

test('una compra de principio a fin: cuenta, sesión, pedido, pago y correo', async () => {
  // Un email nuevo en cada ejecución: así el test no depende de lo que dejó la anterior, y el
  // correo que buscamos en Mailpit solo puede ser el de esta compra.
  const email = `e2e-${randomUUID()}@ejemplo.com`;
  const contrasena = 'una frase larga para el test e2e';

  const alta = await fetch(`${BASE_URL}/v2/cuentas`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, contrasena }),
  });
  assert.equal(alta.status, 201);

  const sesion = await fetch(`${BASE_URL}/v2/sesion`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, contrasena }),
  });
  assert.equal(sesion.status, 200);
  // Del Set-Cookie solo se manda de vuelta «nombre=valor»: lo demás son instrucciones para el navegador.
  const cookie = sesion.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie, 'la tienda no ha puesto la cookie de la sesión');

  const pedido = await fetch(`${BASE_URL}/v2/pedidos`, {
    method: 'POST',
    headers: { ...json, Cookie: cookie, Origin: ORIGEN },
    body: JSON.stringify({ productoId: 1, cantidad: 1 }),
  });
  assert.equal(pedido.status, 201);
  const { id } = await pedido.json();

  // El pago lo hace la pasarela de mentira, la misma que usa quien sigue las lecciones a mano.
  // Lee WEBHOOK_SECRET del .env de Compose, que es el que usa la API.
  const { stdout } = await ejecutar('npm', ['run', '--silent', 'pasarela', '--', String(id)], {
    env: { ...process.env, TIENDA_URL: BASE_URL },
  });
  assert.match(stdout, /← 2\d\d/);

  // El correo no sale al instante: pasa por la cola y lo manda el trabajador. Se espera, con un
  // máximo, en vez de dormir un número fijo de segundos (un test así falla a veces, y nadie sabe por qué).
  const mensajes = await esperar('el correo de confirmación', async () => {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
    );
    const { messages } = await res.json();
    return messages.length > 0 ? messages : undefined;
  });
  assert.equal(mensajes.length, 1);
});

test('la tienda responde en /salud, y lo que no existe es un 404 en formato Problem Details', async () => {
  assert.equal((await fetch(`${BASE_URL}/salud`)).status, 200);

  const res = await fetch(`${BASE_URL}/no-existe`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') ?? '', /application\/problem\+json/);
  assert.equal((await res.json()).status, 404);
});
