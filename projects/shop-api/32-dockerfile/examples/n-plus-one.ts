// The N+1 problem: the products with their categories, asked for in two ways. With Drizzle's log
// on you can see each query that reaches the database, and they're counted. It needs the database
// from .env; run it with: node --env-file=.env examples/n-plus-one.ts
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from '../src/db.ts';
import * as schema from '../src/schema.ts';

const { categories, products, productCategories } = schema;

// #region log
// A Drizzle for this example, on top of the same pool, with a log of its own: it writes each query
// and counts it.
let queries = 0;
const db = drizzle({
  client: pool,
  schema,
  logger: {
    logQuery(query) {
      queries++;
      console.log(`  SQL: ${query}`);
    },
  },
});
// #endregion log

// #region n-plus-one
// WRONG: one query for the products and, after that, another for each product for its
// categories. With 4 products that's 5 queries; with 1000, 1001. Each one is a round trip to the
// database, and the loop waits for each one to come back before launching the next.
async function withNPlusOne() {
  const list = await db.select().from(products).orderBy(asc(products.id));
  const result = [];
  for (const product of list) {
    const its = await db
      .select({ name: categories.name })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(eq(productCategories.productId, product.id))
      .orderBy(asc(categories.id));
    result.push({ name: product.name, categories: its.map((row) => row.name) });
  }
  return result;
}
// #endregion n-plus-one

// #region one-query
// RIGHT: a single query. with asks Drizzle for the products with their categories, and Drizzle
// writes SQL that brings it all at once, whether there are 4 products or 1000.
async function withOneQuery() {
  const list = await db.query.products.findMany({
    orderBy: asc(products.id),
    with: {
      categories: { with: { category: true }, orderBy: asc(productCategories.categoryId) },
    },
  });
  return list.map((product) => ({
    name: product.name,
    categories: product.categories.map((row) => row.category.name),
  }));
}
// #endregion one-query

// #region compare
for (const [title, list] of [
  ['With N+1', withNPlusOne],
  ['With one query', withOneQuery],
] as const) {
  console.log(`== ${title}`);
  queries = 0;
  const result = await list();
  console.log(`Result: ${JSON.stringify(result)}`);
  console.log(`Database queries: ${queries}\n`);
}
// #endregion compare

await pool.end();
