import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createKey } from '../src/api-keys.ts';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { run, useDb } from './db.ts';

useDb();

const me = (headers: Record<string, string>) => app.request('/v2/me', { headers });

test('npm run create-key: shows it once, and in the table only its hash is left', async () => {
  const { stdout } = await run('node', ['scripts/create-key.ts', 'Fast Delivery']);
  const key = /^(shop_[\w-]{43})$/m.exec(stdout)?.[1];
  assert.ok(key, stdout);
  assert.match(stdout, /^Key \d+, for "Fast Delivery":$/m);
  const { rows } = await pool.query(`SELECT name, hash FROM api_keys`);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].hash, createHash('sha256').update(key).digest());
  const { rows: inPlainText } = await pool.query(
    `SELECT count(*)::int AS n FROM api_keys WHERE encode(hash, 'escape') LIKE $1`,
    [`%${key.slice(5)}%`],
  );
  assert.equal(inPlainText[0].n, 0, 'the key is not in the table');
});

test('with the key as Bearer, /v2/me says it is a key, and when it was used is recorded', async () => {
  const { id, key } = await createKey('Fast Delivery');
  const res = await me({ Authorization: `Bearer ${key}` });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    type: 'key',
    id,
    name: 'Fast Delivery',
    role: 'delivery',
  });
  const { rows } = await pool.query('SELECT used_at FROM api_keys WHERE id = $1', [id]);
  assert.ok(rows[0].used_at instanceof Date);
});

test('a key that does not exist, or without the prefix: 401 with WWW-Authenticate: Bearer', async () => {
  const { key } = await createKey('Fast Delivery');
  for (const fake of [`${key.slice(0, -1)}x`, key.slice(5), 'shop_made-up']) {
    const res = await me({ Authorization: `Bearer ${fake}` });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="shop-api"');
  }
});

test('with the session, /v2/me says it is a person', async () => {
  const session = await app.request('/v2/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana@shop.example', password: 'ana-practice-2026' }),
  });
  const cookie = session.headers.get('set-cookie')!.split(';')[0]!;
  assert.deepEqual(await (await me({ Cookie: cookie })).json(), {
    type: 'user',
    id: 1,
    email: 'ana@shop.example',
    role: 'admin',
  });
});
