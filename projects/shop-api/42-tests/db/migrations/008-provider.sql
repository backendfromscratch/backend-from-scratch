-- Whoever comes in with an identity provider (lesson 4) is recognized by the sub the provider
-- gives: an identifier of that person that never changes, even if their email changes.

-- #region provider-sub
-- It can be missing (NULL): whoever only uses a password doesn't have one. UNIQUE: one sub, one
-- account. With a single provider a column is enough; with several (Google, GitHub…), it would be
-- a separate table with the provider and the sub of each one.
ALTER TABLE users ADD COLUMN provider_sub text UNIQUE;
-- #endregion provider-sub
