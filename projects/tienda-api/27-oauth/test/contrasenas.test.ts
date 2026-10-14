import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { hashear, problemaDeContrasena, verificar } from '../src/contrasenas.ts';
import { ejecutar, usarBd } from './bd.ts';

usarBd();

const alta = (cuerpo: unknown) =>
  app.request('/v2/cuentas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

const FRASE = 'una frase larga que solo sé yo';

test('la misma contraseña, dos hashes distintos (cada uno con su sal), y los dos la verifican', async () => {
  const uno = await hashear(FRASE);
  const otro = await hashear(FRASE);
  assert.notEqual(uno, otro);
  assert.equal(await verificar(FRASE, uno), true);
  assert.equal(await verificar(FRASE, otro), true);
});

test('verificar: la contraseña buena sí; otra, o la misma con una letra cambiada, no', async () => {
  const guardado = await hashear(FRASE);
  assert.equal(await verificar('una frase larga que solo se yo', guardado), false);
  assert.equal(await verificar('otra cosa completamente distinta', guardado), false);
  assert.equal(await verificar(FRASE, 'esto no es un hash'), false);
  // La ñ escrita de las dos formas (una letra, o una n y una tilde) es la misma contraseña.
  const conEnie = await hashear('mi contraseña de quince'.normalize('NFC'));
  assert.equal(await verificar('mi contraseña de quince'.normalize('NFD'), conEnie), true);
});

test('el formato PHC: algoritmo, versión, parámetros, 16 bytes de sal y 32 de hash', async () => {
  const guardado = await hashear(FRASE);
  const partes = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    guardado,
  );
  assert.ok(partes, guardado);
  assert.equal(Buffer.from(partes[1]!, 'base64').length, 16);
  assert.equal(Buffer.from(partes[2]!, 'base64').length, 32);
});

test('las reglas: de 15 a 128 caracteres, contados como caracteres, y no una de las más usadas', () => {
  assert.equal(problemaDeContrasena(FRASE), undefined);
  assert.match(problemaDeContrasena('corta')!, /Como mínimo, 15 caracteres/);
  // 14 emojis son 28 «letras» para length, pero 14 caracteres: no llega.
  assert.match(problemaDeContrasena('🍕'.repeat(14))!, /Como mínimo, 15/);
  assert.equal(problemaDeContrasena('🍕'.repeat(15)), undefined);
  assert.match(problemaDeContrasena('x'.repeat(129))!, /Como máximo, 128/);
  // Largas, pero de las más usadas: da igual en mayúsculas.
  for (const comun of ['123456789012345', 'QwertyuiopAsdfghjkl', 'passwordpassword']) {
    assert.match(problemaDeContrasena(comun)!, /más usadas/, comun);
  }
  // Sin reglas de composición: solo minúsculas y espacios vale.
  assert.equal(problemaDeContrasena('caballo correcto pila grapa'), undefined);
});

test('POST /v2/cuentas: 201 con el id y el email, Location, y en la tabla, solo el hash', async () => {
  const res = await alta({ email: 'Marta@Ejemplo.com', contrasena: FRASE });
  assert.equal(res.status, 201);
  const cuenta = await res.json();
  assert.deepEqual(Object.keys(cuenta), ['id', 'email']);
  assert.equal(cuenta.email, 'Marta@Ejemplo.com');
  assert.equal(res.headers.get('location'), `/v2/cuentas/${cuenta.id}`);
  const { rows } = await pool.query('SELECT hash_contrasena FROM usuarios WHERE id = $1', [
    cuenta.id,
  ]);
  assert.match(rows[0].hash_contrasena, /^\$argon2id\$/);
  assert.ok(!rows[0].hash_contrasena.includes(FRASE));
  assert.equal(await verificar(FRASE, rows[0].hash_contrasena), true);
});

test('el mismo email con otras mayúsculas: 409, y no se crea otra cuenta', async () => {
  await alta({ email: 'pedro@ejemplo.com', contrasena: FRASE });
  const res = await alta({ email: 'PEDRO@ejemplo.COM', contrasena: 'otra frase larga distinta' });
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).type, 'https://tienda.example/problemas/email-en-uso');
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM usuarios WHERE lower(email) = 'pedro@ejemplo.com'`,
  );
  assert.equal(rows[0].n, 1);
});

test('una contraseña corta o de las más usadas: 422 con el motivo; un email que no lo es, también', async () => {
  const casos = [
    [{ email: 'a@ejemplo.com', contrasena: 'corta' }, 'contrasena', /Como mínimo, 15/],
    [{ email: 'a@ejemplo.com', contrasena: '123456789012345' }, 'contrasena', /más usadas/],
    [{ email: 'esto no es un email', contrasena: FRASE }, 'email', /Tiene que ser un email/],
  ] as const;
  for (const [cuerpo, campo, motivo] of casos) {
    const res = await alta(cuerpo);
    assert.equal(res.status, 422);
    const [error] = (await res.json()).errores;
    assert.equal(error.campo, campo);
    assert.match(error.problema, motivo);
  }
});

test('las cuentas de práctica de bd/cuentas.sql se verifican con sus contraseñas del README', async () => {
  const { rows } = await pool.query('SELECT email, hash_contrasena FROM usuarios ORDER BY id');
  const practica = {
    'ana@tienda.example': 'ana-practica-2026',
    'luis@tienda.example': 'luis-practica-2026',
    'carmen@ejemplo.com': 'carmen-practica-2026',
    'pablo@ejemplo.com': 'pablo-practica-2026',
  };
  assert.deepEqual(
    rows.slice(0, 4).map((fila) => fila.email),
    Object.keys(practica),
  );
  for (const fila of rows.slice(0, 4)) {
    const contrasena = practica[fila.email as keyof typeof practica];
    assert.equal(await verificar(contrasena, fila.hash_contrasena), true, fila.email);
  }
});

test('ejemplos/hash-rapido.ts: un millón de SHA-256 contra un argon2id, y la sal', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/hash-rapido.ts']);
  const sha256 = Number(/^Un millón de hashes SHA-256: (\d+) ms$/m.exec(stdout)?.[1]);
  const argon2 = Number(/^Un hash argon2id: (\d+) ms$/m.exec(stdout)?.[1]);
  assert.ok(sha256 > 0 && argon2 > 0, stdout);
  assert.match(stdout, /^En lo que tarda un argon2id, SHA-256 calcula unos [\d.]+\.$/m);
  const [uno, otro] = stdout.split('La misma contraseña, dos veces:\n')[1]!.trim().split('\n');
  assert.match(uno!, /^\$argon2id\$/);
  assert.notEqual(uno, otro);
});
