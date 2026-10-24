import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/db.ts';
import { emptyDb, run } from './db.ts';

after(() => pool.end());

// The project's migrations, in order: 001-shop.sql, 002-stock.sql…
const all = (await readdir('db/migrations')).sort();

/** Runs scripts/migrate.ts (with another folder, if given one) and returns its output, even if it fails. */
async function migrate(folder?: string) {
  const args = folder === undefined ? [] : [folder];
  return run('node', ['scripts/migrate.ts', ...args]).catch((error) => error);
}

/** A temporary folder with the project's migrations it's told. */
async function folderWith(...migrations: string[]) {
  const folder = await mkdtemp(join(tmpdir(), 'migrations-'));
  for (const name of migrations) await cp(join('db/migrations', name), join(folder, name));
  return folder;
}

const columns = async (table: string) =>
  (
    await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY 1',
      [table],
    )
  ).rows.map((row) => row.column_name);

const recorded = async () =>
  (await pool.query('SELECT name FROM migrations ORDER BY name')).rows.map((r) => r.name);

test('on an empty database they are all applied, in order, and recorded', async () => {
  await emptyDb();
  const { stdout } = await migrate();
  assert.equal(stdout, all.map((name) => `Applied: ${name}\n`).join(''));
  assert.deepEqual(await recorded(), all);
});

test('migrating again applies nothing: the database is already up to date', async () => {
  const { stdout } = await migrate();
  assert.equal(stdout, 'No new migrations: the database is up to date\n');
  assert.deepEqual(await recorded(), all);
});

test('a migration that fails leaves nothing half-done, and is not recorded', async () => {
  const folder = await folderWith(...all);
  // The first change would work; the second divides by zero.
  await writeFile(
    join(folder, '999-fails.sql'),
    'ALTER TABLE products ADD COLUMN color text;\nSELECT 1 / 0;\n',
  );
  try {
    const result = await migrate(folder);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^999-fails\.sql was not applied: division by zero$/m);
    assert.ok(!(await columns('products')).includes('color'), 'the column does not stay');
    assert.deepEqual(await recorded(), all);
  } finally {
    await rm(folder, { recursive: true });
  }
});

test('002 on a table that already has rows: the ones there get the starting stock', async () => {
  await emptyDb();
  const folder = await folderWith('001-shop.sql');
  await migrate(folder);
  await rm(folder, { recursive: true });
  await pool.query(`INSERT INTO products (name, price_cents) VALUES ('Mug', 850)`);
  assert.ok(!(await columns('products')).includes('stock'));

  const { stdout } = await migrate();
  assert.match(stdout, /^Applied: 002-stock\.sql$/m);
  assert.deepEqual((await pool.query('SELECT name, stock FROM products')).rows, [
    { name: 'Mug', stock: 10 },
  ]);
  // The rules of the third step: a new product starts with 0, and the stock can't be negative.
  const cap = await pool.query(
    `INSERT INTO products (name, price_cents) VALUES ('Cap', 1500) RETURNING stock`,
  );
  assert.equal(cap.rows[0].stock, 0);
  await assert.rejects(pool.query('UPDATE products SET stock = -1'), { code: '23514' });
});

test('db:seed on the Phase 5 database: adds the accounts, and does not repeat the products', async () => {
  // A database like the one of whoever comes from Phase 5: migrated, with products and no accounts.
  await emptyDb();
  await migrate();
  await pool.query(await readFile('db/seed.sql', 'utf8'));
  for (let time = 1; time <= 2; time++) {
    const { stdout } = await run('node', ['scripts/seed.ts']);
    assert.match(stdout, /^The database already has products/m);
  }
  const count = async (table: string) =>
    (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  assert.equal(await count('products'), 4);
  assert.equal(await count('users'), 4, 'the four accounts, only once');
});

test('v2 shows the stock of each product, and documents it; v1 stays the same', async () => {
  const mug = await (await app.request('/v2/products/2')).json();
  assert.equal(mug.stock, 60);
  const list = await (await app.request('/v2/products')).json();
  assert.deepEqual(
    list.map((product: { stock: number }) => product.stock),
    [40, 60, 25, 15],
  );
  assert.deepEqual(await (await app.request('/v1/products/2')).json(), {
    id: 2,
    name: 'Mug',
    price: 8.5,
  });
  const doc = await (await app.request('/v2/openapi.json')).json();
  const product = doc.components.schemas.Product;
  assert.equal(product.properties.stock.type, 'integer');
  assert.equal(product.properties.stock.minimum, 0);
  assert.ok(product.required.includes('stock'));
});
