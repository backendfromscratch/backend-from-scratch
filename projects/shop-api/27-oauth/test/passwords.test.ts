import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { hashPassword, passwordProblem, verifyPassword } from '../src/passwords.ts';
import { run, useDb } from './db.ts';

useDb();

const signUp = (body: unknown) =>
  app.request('/v2/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const SENTENCE = 'a long sentence only I know';

test('the same password, two different hashes (each with its salt), and both verify it', async () => {
  const one = await hashPassword(SENTENCE);
  const other = await hashPassword(SENTENCE);
  assert.notEqual(one, other);
  assert.equal(await verifyPassword(SENTENCE, one), true);
  assert.equal(await verifyPassword(SENTENCE, other), true);
});

test('verifyPassword: the right password yes; another, or the same with one letter changed, no', async () => {
  const stored = await hashPassword(SENTENCE);
  assert.equal(await verifyPassword('a long sentence only I knew', stored), false);
  assert.equal(await verifyPassword('something completely different', stored), false);
  assert.equal(await verifyPassword(SENTENCE, 'this is not a hash'), false);
  // é written both ways (one letter, or an e and an accent) is the same password.
  const withAccent = await hashPassword('my café password'.normalize('NFC'));
  assert.equal(await verifyPassword('my café password'.normalize('NFD'), withAccent), true);
});

test('the PHC format: algorithm, version, parameters, 16 bytes of salt and 32 of hash', async () => {
  const stored = await hashPassword(SENTENCE);
  const parts = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    stored,
  );
  assert.ok(parts, stored);
  assert.equal(Buffer.from(parts[1]!, 'base64').length, 16);
  assert.equal(Buffer.from(parts[2]!, 'base64').length, 32);
});

test('the rules: from 15 to 128 characters, counted as characters, and not one of the most used', () => {
  assert.equal(passwordProblem(SENTENCE), undefined);
  assert.match(passwordProblem('short')!, /At least 15 characters/);
  // 14 emojis are 28 "letters" for length, but 14 characters: not enough.
  assert.match(passwordProblem('🍕'.repeat(14))!, /At least 15/);
  assert.equal(passwordProblem('🍕'.repeat(15)), undefined);
  assert.match(passwordProblem('x'.repeat(129))!, /At most 128/);
  // Long, but among the most used: capitals don't matter.
  for (const common of ['123456789012345', 'QwertyuiopAsdfghjkl', 'passwordpassword']) {
    assert.match(passwordProblem(common)!, /most used/, common);
  }
  // No composition rules: only lowercase letters and spaces is fine.
  assert.equal(passwordProblem('correct horse battery staple'), undefined);
});

test('POST /v2/accounts: 201 with the id and the email, Location, and in the table, only the hash', async () => {
  const res = await signUp({ email: 'Marta@Example.com', password: SENTENCE });
  assert.equal(res.status, 201);
  const account = await res.json();
  assert.deepEqual(Object.keys(account), ['id', 'email']);
  assert.equal(account.email, 'Marta@Example.com');
  assert.equal(res.headers.get('location'), `/v2/accounts/${account.id}`);
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [account.id]);
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
  assert.ok(!rows[0].password_hash.includes(SENTENCE));
  assert.equal(await verifyPassword(SENTENCE, rows[0].password_hash), true);
});

test('the same email with other capitals: 409, and no other account is created', async () => {
  await signUp({ email: 'pedro@example.com', password: SENTENCE });
  const res = await signUp({
    email: 'PEDRO@example.COM',
    password: 'another long different sentence',
  });
  assert.equal(res.status, 409);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).type, 'https://shop.example/problems/email-taken');
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM users WHERE lower(email) = 'pedro@example.com'`,
  );
  assert.equal(rows[0].n, 1);
});

test('a short password or one of the most used: 422 with the reason; an email that is not one, too', async () => {
  const cases = [
    [{ email: 'a@example.com', password: 'short' }, 'password', /At least 15/],
    [{ email: 'a@example.com', password: '123456789012345' }, 'password', /most used/],
    [{ email: 'this is not an email', password: SENTENCE }, 'email', /Must be an email/],
  ] as const;
  for (const [body, field, reason] of cases) {
    const res = await signUp(body);
    assert.equal(res.status, 422);
    const [error] = (await res.json()).errors;
    assert.equal(error.field, field);
    assert.match(error.problem, reason);
  }
});

test('the practice accounts in db/accounts.sql verify with their passwords from the README', async () => {
  const { rows } = await pool.query('SELECT email, password_hash FROM users ORDER BY id');
  const practice = {
    'ana@shop.example': 'ana-practice-2026',
    'luis@shop.example': 'luis-practice-2026',
    'carmen@example.com': 'carmen-practice-2026',
    'pablo@example.com': 'pablo-practice-2026',
  };
  assert.deepEqual(
    rows.slice(0, 4).map((row) => row.email),
    Object.keys(practice),
  );
  for (const row of rows.slice(0, 4)) {
    const password = practice[row.email as keyof typeof practice];
    assert.equal(await verifyPassword(password, row.password_hash), true, row.email);
  }
});

test('examples/fast-hash.ts: a million SHA-256 against one argon2id, and the salt', async () => {
  const { stdout } = await run('node', ['examples/fast-hash.ts']);
  const sha256 = Number(/^A million SHA-256 hashes: (\d+) ms$/m.exec(stdout)?.[1]);
  const argon2 = Number(/^One argon2id hash: (\d+) ms$/m.exec(stdout)?.[1]);
  assert.ok(sha256 > 0 && argon2 > 0, stdout);
  assert.match(stdout, /^In the time one argon2id takes, SHA-256 computes about [\d,]+\.$/m);
  const [one, other] = stdout.split('The same password, twice:\n')[1]!.trim().split('\n');
  assert.match(one!, /^\$argon2id\$/);
  assert.notEqual(one, other);
});
