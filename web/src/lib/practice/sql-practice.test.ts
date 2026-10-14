import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

// The shop's data for Phase 5 (spec §5): the file the reader loads with psql and the playground
// loads in the browser. Both languages hold the same numbers, row by row.
const practice = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../public/practicas/${name}`, import.meta.url)),
    'utf8',
  );

async function load(name: string) {
  const db = await PGlite.create();
  await db.exec(practice(name));
  return db;
}

const files = {
  es: {
    file: 'tienda.sql',
    name: 'nombre',
    products: 'productos',
    categories: 'categorias',
    join: 'productos_categorias',
    orders: 'pedidos',
    product: 'producto_id',
    category: 'categoria_id',
    price: 'precio_centimos',
    quantity: 'cantidad',
    status: 'estado',
    created: 'creado_en',
  },
  en: {
    file: 'shop.sql',
    name: 'name',
    products: 'products',
    categories: 'categories',
    join: 'product_categories',
    orders: 'orders',
    product: 'product_id',
    category: 'category_id',
    price: 'price_cents',
    quantity: 'quantity',
    status: 'status',
    created: 'created_at',
  },
} as const;

describe.each(Object.entries(files))('%s practice data', (_, n) => {
  it('loads, twice in a row (it drops its own tables first)', async () => {
    const db = await load(n.file);
    await db.exec(practice(n.file));
    const count = async (table: string) =>
      (await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`)).rows[0]!
        .count;
    expect(await count(n.products)).toBe(4);
    expect(await count(n.categories)).toBe(3);
    expect(await count(n.orders)).toBe(25);
    await db.close();
  }, 30_000);

  it('has a product nobody ordered, for LEFT JOIN', async () => {
    const db = await load(n.file);
    const { rows } = await db.query(
      `SELECT p.id FROM ${n.products} p LEFT JOIN ${n.orders} o ON o.${n.product} = p.id WHERE o.id IS NULL`,
    );
    expect(rows).toEqual([{ id: 4 }]);
    await db.close();
  }, 30_000);

  it('rejects what the constraints forbid', async () => {
    const db = await load(n.file);
    await expect(
      db.exec(
        `INSERT INTO ${n.orders} (${n.product}, ${n.quantity}, ${n.status}, ${n.created}) VALUES (99, 1, 'x', now())`,
      ),
    ).rejects.toThrow();
    await expect(db.exec(`INSERT INTO ${n.products} (${n.name}) VALUES ('x')`)).rejects.toThrow();
    await db.close();
  }, 30_000);
});

it('both languages hold the same numbers, row by row', async () => {
  const [es, en] = await Promise.all([load('tienda.sql'), load('shop.sql')]);
  const status = {
    enviado: 'shipped',
    pagado: 'paid',
    pendiente: 'pending',
    cancelado: 'cancelled',
  } as Record<string, string>;
  const esOrders = (
    await es.query<Record<string, unknown>>(
      'SELECT id, producto_id, cantidad, estado, creado_en FROM pedidos ORDER BY id',
    )
  ).rows;
  const enOrders = (
    await en.query<Record<string, unknown>>(
      'SELECT id, product_id, quantity, status, created_at FROM orders ORDER BY id',
    )
  ).rows;
  expect(enOrders).toEqual(
    esOrders.map((o) => ({
      id: o.id,
      product_id: o.producto_id,
      quantity: o.cantidad,
      status: status[o.estado as string],
      created_at: o.creado_en,
    })),
  );
  const prices = async (db: PGlite, sql: string) => (await db.query(sql)).rows;
  expect(await prices(en, 'SELECT id, price_cents AS p FROM products ORDER BY id')).toEqual(
    await prices(es, 'SELECT id, precio_centimos AS p FROM productos ORDER BY id'),
  );
  expect(
    await prices(en, 'SELECT product_id, category_id FROM product_categories ORDER BY 1, 2'),
  ).toEqual(
    (
      await prices(es, 'SELECT producto_id, categoria_id FROM productos_categorias ORDER BY 1, 2')
    ).map((r) => ({
      product_id: (r as Record<string, number>).producto_id,
      category_id: (r as Record<string, number>).categoria_id,
    })),
  );
  await Promise.all([es.close(), en.close()]);
}, 30_000);
