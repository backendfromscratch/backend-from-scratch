-- An index for searching product_categories by category: the GET /v2/products?category= filter.
-- This SQL isn't written by hand: drizzle-kit generated it by comparing src/schema.ts with its
-- previous snapshot (npm run db:generate -- --name=categories-index, in drizzle/0001_categories-index.sql).
-- drizzle-kit only generates it; our runner applies it, like the others: npm run db:migrate

-- #region index
CREATE INDEX "product_categories_by_category" ON "product_categories" USING btree ("category_id");
-- #endregion index
