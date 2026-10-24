import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { useDb } from './db.ts';

useDb();

/** POST /v2/session with an email and a password, and the headers it's given. */
const signIn = (email: string, password: string, headers: Record<string, string> = {}) =>
  app.request('/v2/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ email, password }),
  });

/** The session id in a response's Set-Cookie header. */
function idOf(res: Response): string {
  const id = /^session=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(id, 'the response brings the session cookie');
  return id;
}

const me = (headers: Record<string, string> = {}) => app.request('/v2/me', { headers });

const withCookie = (id: string) => ({ Cookie: `session=${id}` });

test('signing in (with the email in other capitals): 200 with the account; /v2/me recognizes it', async () => {
  const res = await signIn('ANA@shop.example', 'ana-practice-2026');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: 1, email: 'ana@shop.example', role: 'admin' });
  const id = idOf(res);
  const withTheCookie = await me(withCookie(id));
  assert.equal(withTheCookie.status, 200);
  assert.deepEqual(await withTheCookie.json(), {
    type: 'user',
    id: 1,
    email: 'ana@shop.example',
    role: 'admin',
  });
  // The same session, as Bearer: what a program that doesn't keep cookies would do.
  const withBearer = await me({ Authorization: `Bearer ${id}` });
  assert.deepEqual(await withBearer.json(), {
    type: 'user',
    id: 1,
    email: 'ana@shop.example',
    role: 'admin',
  });
});

test('the cookie: a long random id, HttpOnly, Secure, SameSite=Lax, Path=/ and a week', async () => {
  const res = await signIn('luis@shop.example', 'luis-practice-2026');
  const cookie = res.headers.get('set-cookie')!;
  assert.match(idOf(res), /^[A-Za-z0-9_-]{43}$/); // 32 bytes in base64url
  const attributes = cookie.split('; ').slice(1);
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) {
    assert.ok(attributes.includes(attribute), `${attribute} in ${cookie}`);
  }
});

test('in the table, only the SHA-256 of the id, and it expires in a week', async () => {
  const id = idOf(await signIn('carmen@example.com', 'carmen-practice-2026'));
  const hash = createHash('sha256').update(id).digest();
  const { rows } = await pool.query(
    `SELECT user_id, expires_at - created_at AS lasts FROM sessions WHERE id_hash = $1`,
    [hash],
  );
  assert.equal(rows[0].user_id, 3);
  assert.equal(rows[0].lasts.days, 7);
  const { rows: withTheId } = await pool.query(
    `SELECT count(*)::int AS n FROM sessions WHERE encode(id_hash, 'escape') LIKE $1`,
    [`%${id}%`],
  );
  assert.equal(withTheId[0].n, 0, 'the id is not in the table');
});

test('a wrong password and an email that does not exist: the same response, without a cookie', async () => {
  const wrong = await signIn('ana@shop.example', 'not-the-password');
  const nobody = await signIn('nobody@example.com', 'not-the-password');
  assert.equal(wrong.status, 400);
  assert.equal(nobody.status, 400);
  const body = await wrong.json();
  assert.deepEqual(await nobody.json(), body);
  assert.equal(body.type, 'https://shop.example/problems/invalid-credentials');
  assert.equal(wrong.headers.get('set-cookie'), null);
  assert.equal(nobody.headers.get('set-cookie'), null);
});

test('an account without a password (from an identity provider) cannot get in with one', async () => {
  await pool.query(`INSERT INTO users (email) VALUES ('no-password@example.com')`);
  const res = await signIn('no-password@example.com', 'anything at all');
  assert.equal(res.status, 400);
});

test('/v2/me without a session, or with a made-up id: 401 with WWW-Authenticate', async () => {
  const cases: Record<string, string>[] = [
    {},
    withCookie('made-up'),
    { Authorization: 'Bearer made-up' },
  ];
  for (const headers of cases) {
    const res = await me(headers);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="shop-api"');
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
  }
});

test('signing out: 204, the cookie is deleted, and the old id is no longer valid even if kept', async () => {
  const id = idOf(await signIn('pablo@example.com', 'pablo-practice-2026'));
  // Origin, as the browser sends it: without it, a request with the cookie doesn't pass (lesson 7).
  const res = await app.request('/v2/session', {
    method: 'DELETE',
    headers: { ...withCookie(id), Origin: 'http://localhost:3000' },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('set-cookie')!, /^session=; Max-Age=0; Path=\/; HttpOnly; Secure/);
  assert.equal((await me(withCookie(id))).status, 401);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = 4');
  assert.equal(rows[0].n, 0);
});

test('an expired session is not valid, and it is deleted', async () => {
  const id = idOf(await signIn('ana@shop.example', 'ana-practice-2026'));
  const hash = createHash('sha256').update(id).digest();
  await pool.query(
    `UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id_hash = $1`,
    [hash],
  );
  assert.equal((await me(withCookie(id))).status, 401);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE id_hash = $1', [
    hash,
  ]);
  assert.equal(rows[0].n, 0);
});

test('when signing in, a new id: the one the browser brought is deleted (session fixation)', async () => {
  const before = idOf(await signIn('luis@shop.example', 'luis-practice-2026'));
  const res = await signIn('luis@shop.example', 'luis-practice-2026', withCookie(before));
  const after = idOf(res);
  assert.notEqual(after, before);
  assert.equal((await me(withCookie(before))).status, 401);
  assert.equal((await me(withCookie(after))).status, 200);
});
