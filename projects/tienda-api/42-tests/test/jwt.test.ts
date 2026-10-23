import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { comprobar, crearToken, leerPartes, manipular, sinFirma } from '../ejemplos/jwt.ts';

// ejemplos/jwt.ts no usa la base de datos: estos tests tampoco.
const ejecutar = promisify(execFile);

test('un JWT son tres partes en base64url; cabecera y datos se leen sin el secreto', async () => {
  const token = await crearToken('carmen');
  assert.match(token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  const { cabecera, datos, bytesDeFirma } = leerPartes(token);
  assert.deepEqual(cabecera, { alg: 'HS256', typ: 'JWT' });
  assert.equal(datos.sub, 'carmen');
  assert.equal(datos.iss, 'tienda-api');
  assert.equal(datos.aud, 'tienda-api');
  assert.equal(datos.exp - datos.iat, 15 * 60);
  assert.equal(bytesDeFirma, 32); // un HMAC-SHA256
});

test('comprobar: el token tal cual vale, y da sus datos', async () => {
  const resultado = await comprobar(await crearToken('carmen'));
  assert.equal(resultado.valido, true);
  assert.equal(resultado.valido && resultado.datos.sub, 'carmen');
});

test('con los datos cambiados, la firma ya no corresponde: rechazado', async () => {
  const cambiado = manipular(await crearToken('carmen'), 'pablo');
  assert.equal(leerPartes(cambiado).datos.sub, 'pablo');
  assert.deepEqual(await comprobar(cambiado), {
    valido: false,
    motivo: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  });
});

test('alg: none y sin firma: rechazado, porque el algoritmo lo decide quien comprueba', async () => {
  const resultado = await comprobar(sinFirma(await crearToken('carmen')));
  assert.equal(resultado.valido, false);
  assert.equal(resultado.valido || resultado.motivo, 'ERR_JOSE_ALG_NOT_ALLOWED');
});

test('caducado, o para otra audiencia: rechazado', async () => {
  const caducado = await crearToken('carmen', 'tienda-api', Math.floor(Date.now() / 1000) - 60);
  assert.deepEqual(await comprobar(caducado), { valido: false, motivo: 'ERR_JWT_EXPIRED' });
  const otraAudiencia = await crearToken('carmen', 'pasarela-de-pago');
  assert.deepEqual(await comprobar(otraAudiencia), {
    valido: false,
    motivo: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
  });
  // El mismo token sí vale para quien es su audiencia.
  assert.equal((await comprobar(otraAudiencia, 'pasarela-de-pago')).valido, true);
});

test('node ejemplos/jwt.ts: enseña las partes y qué se rechaza', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/jwt.ts']);
  assert.match(stdout, /^Cabecera: \{ alg: 'HS256', typ: 'JWT' \}$/m);
  assert.match(stdout, /^Firma: 32 bytes$/m);
  assert.match(stdout, /^Tal cual: vale$/m);
  assert.match(
    stdout,
    /^Con los datos cambiados: rechazado \(ERR_JWS_SIGNATURE_VERIFICATION_FAILED\)$/m,
  );
  assert.match(stdout, /^Con alg: none y sin firma: rechazado \(ERR_JOSE_ALG_NOT_ALLOWED\)$/m);
  assert.match(stdout, /^Caducado hace un minuto: rechazado \(ERR_JWT_EXPIRED\)$/m);
  assert.match(stdout, /^Para otra audiencia: rechazado \(ERR_JWT_CLAIM_VALIDATION_FAILED\)$/m);
});
