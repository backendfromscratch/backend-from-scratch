// Los tests unitarios de la firma de los webhooks (Fase 10, lección 1). Un test unitario prueba una
// sola función, sin base de datos ni servidor: por eso no hace falta usarBd() y corre en milisegundos.
// firmar ya se prueba de pasada en webhooks.test.ts; aquí se prueba firmaValida, la que decide
// si un aviso es de la pasarela, con cada promesa en su propio test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firmaValida, firmar } from '../src/firma.ts';

const SECRETO = 'secreto-de-prueba';
const CUERPO = '{"id":"evt_1","tipo":"pago.completado","pedidoId":7}';

test('una firma hecha con el mismo secreto vale', () => {
  assert.equal(firmaValida(CUERPO, firmar(CUERPO, SECRETO), SECRETO), true);
});

test('una firma hecha con otro secreto no vale', () => {
  assert.equal(firmaValida(CUERPO, firmar(CUERPO, 'otro-secreto'), SECRETO), false);
});

test('un cuerpo cambiado en un solo byte no vale, aunque la firma sea la del original', () => {
  const manipulado = CUERPO.replace('"pedidoId":7', '"pedidoId":8');
  assert.equal(firmaValida(manipulado, firmar(CUERPO, SECRETO), SECRETO), false);
});

test('sin firma no vale', () => {
  assert.equal(firmaValida(CUERPO, undefined, SECRETO), false);
});

test('una firma de otro tamaño no vale, y no hace fallar a timingSafeEqual', () => {
  assert.equal(firmaValida(CUERPO, 'sha256=abc', SECRETO), false);
  assert.equal(firmaValida(CUERPO, '', SECRETO), false);
});
