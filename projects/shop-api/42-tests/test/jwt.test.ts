import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { check, createToken, readParts, tamper, unsigned } from '../examples/jwt.ts';

// examples/jwt.ts doesn't use the database: these tests don't either.
const run = promisify(execFile);

test('a JWT is three parts in base64url; header and payload can be read without the secret', async () => {
  const token = await createToken('carmen');
  assert.match(token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  const { header, payload, signatureBytes } = readParts(token);
  assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' });
  assert.equal(payload.sub, 'carmen');
  assert.equal(payload.iss, 'shop-api');
  assert.equal(payload.aud, 'shop-api');
  assert.equal(payload.exp - payload.iat, 15 * 60);
  assert.equal(signatureBytes, 32); // an HMAC-SHA256
});

test('check: the token as is is valid, and gives its payload', async () => {
  const result = await check(await createToken('carmen'));
  assert.equal(result.valid, true);
  assert.equal(result.valid && result.payload.sub, 'carmen');
});

test('with the payload changed, the signature no longer matches: rejected', async () => {
  const changed = tamper(await createToken('carmen'), 'pablo');
  assert.equal(readParts(changed).payload.sub, 'pablo');
  assert.deepEqual(await check(changed), {
    valid: false,
    reason: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  });
});

test('alg: none and no signature: rejected, because the algorithm is decided by whoever checks', async () => {
  const result = await check(unsigned(await createToken('carmen')));
  assert.equal(result.valid, false);
  assert.equal(result.valid || result.reason, 'ERR_JOSE_ALG_NOT_ALLOWED');
});

test('expired, or for another audience: rejected', async () => {
  const expired = await createToken('carmen', 'shop-api', Math.floor(Date.now() / 1000) - 60);
  assert.deepEqual(await check(expired), { valid: false, reason: 'ERR_JWT_EXPIRED' });
  const otherAudience = await createToken('carmen', 'payment-gateway');
  assert.deepEqual(await check(otherAudience), {
    valid: false,
    reason: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
  });
  // The same token is valid for whoever is its audience.
  assert.equal((await check(otherAudience, 'payment-gateway')).valid, true);
});

test('node examples/jwt.ts: shows the parts and what is rejected', async () => {
  const { stdout } = await run('node', ['examples/jwt.ts']);
  assert.match(stdout, /^Header: \{ alg: 'HS256', typ: 'JWT' \}$/m);
  assert.match(stdout, /^Signature: 32 bytes$/m);
  assert.match(stdout, /^As is: valid$/m);
  assert.match(
    stdout,
    /^With the payload changed: rejected \(ERR_JWS_SIGNATURE_VERIFICATION_FAILED\)$/m,
  );
  assert.match(stdout, /^With alg: none and no signature: rejected \(ERR_JOSE_ALG_NOT_ALLOWED\)$/m);
  assert.match(stdout, /^Expired a minute ago: rejected \(ERR_JWT_EXPIRED\)$/m);
  assert.match(stdout, /^For another audience: rejected \(ERR_JWT_CLAIM_VALIDATION_FAILED\)$/m);
});
