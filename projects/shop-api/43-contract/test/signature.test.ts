// The unit tests of the webhooks' signature (Phase 10, lesson 1). A unit test tests a single
// function, with no database or server: that's why useDb() isn't needed and it runs in
// milliseconds. sign is already tested in passing in webhooks.test.ts; here validSignature is
// tested, the one that decides whether a notification comes from the gateway, with each promise
// in its own test.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sign, validSignature } from '../src/signature.ts';

const SECRET = 'test-secret';
const BODY = '{"id":"evt_1","type":"payment.completed","orderId":7}';

test('a signature made with the same secret is valid', () => {
  assert.equal(validSignature(BODY, sign(BODY, SECRET), SECRET), true);
});

test('a signature made with another secret is not valid', () => {
  assert.equal(validSignature(BODY, sign(BODY, 'another-secret'), SECRET), false);
});

test('a body changed in a single byte is not valid, even with the original is signature', () => {
  const tampered = BODY.replace('"orderId":7', '"orderId":8');
  assert.equal(validSignature(tampered, sign(BODY, SECRET), SECRET), false);
});

test('without a signature it is not valid', () => {
  assert.equal(validSignature(BODY, undefined, SECRET), false);
});

test('a signature of another size is not valid, and does not make timingSafeEqual fail', () => {
  assert.equal(validSignature(BODY, 'sha256=abc', SECRET), false);
  assert.equal(validSignature(BODY, '', SECRET), false);
});
