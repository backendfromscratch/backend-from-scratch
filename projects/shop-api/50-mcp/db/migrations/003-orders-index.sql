-- An index for the list of orders, just as the API reads it: from newest to oldest
-- (created_at DESC) and, between two with the same date, the one with the higher id first (id
-- DESC). It's the pages' order (src/pagination.ts): with it, PostgreSQL goes straight to the cursor
-- and reads only the page's orders, without going through the whole table.

-- #region index
CREATE INDEX orders_by_date ON orders (created_at DESC, id DESC);
-- #endregion index

-- What it costs: each INSERT and each DELETE in orders, and each UPDATE of these two columns, has
-- to change the index too; and the index takes up disk space. That's why you don't put an index on
-- every column, only for the queries that need it.
--
-- On a big table in production you'd use CREATE INDEX CONCURRENTLY: it takes longer, but it doesn't
-- block writes while it's being created. It can't go inside a transaction, and this runner puts
-- each migration in one.
