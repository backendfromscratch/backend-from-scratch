-- How many units of each product are left. The table already has rows, and each one needs a
-- value: that's why there are three steps. The runner (scripts/migrate.ts) applies the whole
-- migration in a transaction: if a step fails, none of them stays.

-- #region column
-- 1. The column, still without NOT NULL: the rows already there get it empty (NULL). With NOT NULL
--    and no value, PostgreSQL wouldn't add it, because those rows would break the rule from the start.
ALTER TABLE products ADD COLUMN stock integer;
-- #endregion column

-- #region backfill
-- 2. A value for each row that was already there: a starting stock, until Ana counts the warehouse.
UPDATE products SET stock = 10 WHERE stock IS NULL;
-- #endregion backfill

-- #region rules
-- 3. Now that no row is empty, the rules: the stock can't be missing or negative, and a new product
--    starts with 0 unless told otherwise (DEFAULT).
ALTER TABLE products
  ALTER COLUMN stock SET DEFAULT 0,
  ALTER COLUMN stock SET NOT NULL,
  ADD CONSTRAINT stock_not_negative CHECK (stock >= 0);
-- #endregion rules
