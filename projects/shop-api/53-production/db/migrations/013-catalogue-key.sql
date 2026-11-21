-- One more role for API keys (Phase 11, lesson 4): catalogue, the key of a program that only
-- browses the catalogue, like a price comparison site's agent. Through MCP (src/mcp.ts) it only
-- sees the catalogue's tools; the orders' tools, only delivery and admin. So each agent gets in
-- with just what its job needs, like the delivery company in Phase 6. It says the same as the SQL
-- drizzle-kit generated (drizzle/0010_catalogue-key.sql).

-- #region catalogue-key
-- A CHECK constraint isn't changed: it's dropped and another is created, with the same name (the
-- one PostgreSQL gave it in migration 009). Both statements go in the same migration, and our
-- runner applies each migration in a transaction: the table is never left without the constraint.
ALTER TABLE api_keys DROP CONSTRAINT api_keys_role_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_role_check CHECK (role IN ('delivery', 'admin', 'catalogue'));
-- #endregion catalogue-key
