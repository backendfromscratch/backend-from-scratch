-- The practice accounts, with their password's hash (src/passwords.ts). The passwords are these,
-- and they're here and in the README on purpose, for practice: don't use them for anything else.
-- npm run db:seed always loads them, also into a database that already has data (the one from
-- Phase 5): the ones already there aren't repeated.

-- #region users
--   ana@shop.example       ana-practice-2026
--   luis@shop.example      luis-practice-2026
--   carmen@example.com     carmen-practice-2026
--   pablo@example.com      pablo-practice-2026
INSERT INTO users (email, password_hash) VALUES
  ('ana@shop.example', '$argon2id$v=19$m=19456,t=2,p=1$Ah3bwvSS1s7RIvUGU2h2dg$A+FCqTH/9Tc51TO+gZLEEWM2IpLuCLRK4EHX1342hao'),
  ('luis@shop.example', '$argon2id$v=19$m=19456,t=2,p=1$Lgy+upb5e++YekOkI4bfxQ$DSuMvrSdh6I8PIuaknrmZs7DDBHG5F7l89a2HpQ6Yfo'),
  ('carmen@example.com', '$argon2id$v=19$m=19456,t=2,p=1$0huYu7/4AAAeYDMvWuPxZg$6TfylhOfZvUD30af6rhbuNlQLqBCOve4XJ8zPyveDfU'),
  ('pablo@example.com', '$argon2id$v=19$m=19456,t=2,p=1$Qk95W4ENFJzHuUY4tPtDrQ$XTs1viVhM0MqQ/+/YFhMcPoK02FOTxRCj6eamUXHB6w')
-- ON CONFLICT … DO NOTHING: if there's already an account with that email (the unique index on
-- lower(email)), no other one is created and the existing one isn't changed.
ON CONFLICT ((lower(email))) DO NOTHING;
-- #endregion users
