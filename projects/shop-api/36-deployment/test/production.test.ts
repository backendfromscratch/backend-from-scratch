// Production doesn't load the practice accounts (their passwords are public) and the first admin is
// created with npm run create-admin. The real scripts, as processes, against the tests' database.
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { pool } from '../src/db.ts';
import { checkCredentials } from '../src/users.ts';
import { emptyDb, run } from './db.ts';

after(() => pool.end());

// A database with the tables and nothing else: what there is in production before loading anything.
beforeEach(async () => {
  await emptyDb();
  await run('node', ['scripts/migrate.ts']);
});

/** Runs a script and returns how it ended, without throwing if it exits with a code other than 0. */
async function execute(...args: string[]) {
  try {
    const { stdout, stderr } = await run('node', args);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
    return { code, stdout, stderr };
  }
}

const count = async (table: 'users' | 'products') =>
  (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number;

test('seed --no-accounts loads the products and no accounts', async () => {
  const { code, stdout } = await execute('scripts/seed.ts', '--no-accounts');
  assert.equal(code, 0);
  assert.match(stdout, /^Sample data loaded$/m);
  assert.doesNotMatch(stdout, /Practice accounts/);
  assert.ok((await count('products')) > 0);
  assert.equal(await count('users'), 0);
});

test('seed without the flag still loads the practice accounts', async () => {
  const { code, stdout } = await execute('scripts/seed.ts');
  assert.equal(code, 0);
  assert.match(stdout, /^Practice accounts ready/m);
  assert.ok((await count('products')) > 0);
  assert.equal(await count('users'), 4);
});

test('seed with an unknown argument exits with code 1 and loads nothing', async () => {
  for (const arg of ['--no-account', '--no-accounts=true', 'no-accounts']) {
    const { code, stdout, stderr } = await execute('scripts/seed.ts', arg);
    assert.equal(code, 1, arg);
    assert.doesNotMatch(stdout, /loaded|ready/);
    assert.match(stderr, /Invalid argument/);
  }
  assert.equal(await count('users'), 0);
  assert.equal(await count('products'), 0);
});

const LINE = /^Password \(save it now, it is not shown again\): (\S+)$/m;

test('create-admin creates an admin account, prints a password of 24 characters or more just once, and that password signs in', async () => {
  const { code, stdout } = await execute('scripts/create-admin.ts', 'owner@my-shop.example');
  assert.equal(code, 0);
  const password = stdout.match(LINE)?.[1];
  assert.ok(password && password.length >= 24, `password: ${password}`);
  assert.equal(stdout.split(password).length - 1, 1, 'the password appears just once');

  const { rows } = await pool.query('SELECT email, role FROM users');
  assert.deepEqual(rows, [{ email: 'owner@my-shop.example', role: 'admin' }]);
  const user = await checkCredentials('owner@my-shop.example', password);
  assert.equal(user?.role, 'admin');
});

test('create-admin with an email that already exists changes nothing, prints no password and exits with code 1', async () => {
  await execute('scripts/seed.ts');
  const before = await pool.query('SELECT * FROM users ORDER BY id');
  const { code, stdout, stderr } = await execute('scripts/create-admin.ts', 'carmen@example.com');
  assert.equal(code, 1);
  assert.doesNotMatch(stdout, /Password/);
  assert.match(stderr, /there is already an account/i);
  assert.deepEqual((await pool.query('SELECT * FROM users ORDER BY id')).rows, before.rows);
});

test('create-admin with an invalid email exits with code 1 and says so', async () => {
  for (const args of [['this-is-not-an-email'], []]) {
    const { code, stdout, stderr } = await execute('scripts/create-admin.ts', ...args);
    assert.equal(code, 1);
    assert.doesNotMatch(stdout, /Password/);
    assert.match(stderr, /email/i);
  }
  assert.equal(await count('users'), 0);
});

test('the database only keeps the hash', async () => {
  const { stdout } = await execute('scripts/create-admin.ts', 'admin@my-shop.example');
  const password = stdout.match(LINE)?.[1];
  assert.ok(password);
  const { rows } = await pool.query('SELECT password_hash FROM users');
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
  const all = await pool.query('SELECT u::text AS row FROM users u');
  assert.ok(all.rows.every((row) => !row.row.includes(password)));
});
