-- API keys: how a program identifies itself, not a person. The delivery company (Phase 4) will
-- have its own. As with sessions, the shop stores each key's hash, never the key: it's shown only
-- once, when it's created (scripts/create-key.ts).

-- #region api-keys
CREATE TABLE api_keys (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Whose it is, so a person can recognize it: "Fast Delivery".
  name text NOT NULL,
  -- The key's SHA-256. UNIQUE: besides preventing two equal ones, it creates the index used to
  -- find the key that arrives in each request.
  hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The last time it was used: a key nobody has used for months can be deleted.
  used_at timestamptz
);
-- #endregion api-keys
