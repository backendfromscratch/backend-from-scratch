-- Sessions: who has signed in, and until when. The browser keeps its session's id in a cookie;
-- the shop, only its hash (SHA-256). If someone took a copy of this table, they couldn't use any
-- session: the id can't be rebuilt from the hash.

-- #region sessions
CREATE TABLE sessions (
  -- bytea: bytes, nothing more. The 32 bytes of the id's SHA-256. It's the primary key: finding a
  -- session by its hash is instant.
  id_hash bytea PRIMARY KEY,
  -- ON DELETE CASCADE: if the account is deleted, its sessions go with it.
  user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- After this time, the session is no longer valid, even if the browser still has the cookie.
  expires_at timestamptz NOT NULL
);
-- #endregion sessions
