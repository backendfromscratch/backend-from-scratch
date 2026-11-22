-- The shop's accounts: who can sign in. For each person, their email and the hash of their
-- password: the password itself is never stored, neither in plain text nor encrypted
-- (src/passwords.ts).

-- #region users
CREATE TABLE users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  -- The password's hash, with its salt and its parameters: $argon2id$v=19$m=19456,t=2,p=1$…
  -- It can be missing (NULL): whoever comes in with an identity provider (lesson 4) has no
  -- password in the shop.
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One email, one account, whatever the capitals: Ana@Shop.example and ana@shop.example are the
-- same person. The index is on lower(email), so PostgreSQL compares both in lowercase, and it also
-- serves to find an account by its email when signing in.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
-- #endregion users
