-- Las cuentas de práctica, con el hash de su contraseña (src/contrasenas.ts). Las contraseñas son
-- estas, y están aquí y en el README a propósito, para practicar: no las uses para nada más.
-- npm run bd:datos las carga siempre, también en una base de datos que ya tiene datos (la de la
-- Fase 5): las que ya estén no se repiten.

-- #region usuarios
--   ana@tienda.example     ana-practica-2026
--   luis@tienda.example    luis-practica-2026
--   carmen@ejemplo.com     carmen-practica-2026
--   pablo@ejemplo.com      pablo-practica-2026
INSERT INTO usuarios (email, hash_contrasena) VALUES
  ('ana@tienda.example', '$argon2id$v=19$m=19456,t=2,p=1$m/c21LEPqBvJ7DE403vtdQ$HtMsdeS4BMsuQjnaZq/K4KctBtBqlK9JHjNNJ0Pmgos'),
  ('luis@tienda.example', '$argon2id$v=19$m=19456,t=2,p=1$DVK7lz5xkba/Sq4TSgvonw$r3Zpb/TK156tjbVilyQ9Lub8cfPCw/uTTApDERmnxqw'),
  ('carmen@ejemplo.com', '$argon2id$v=19$m=19456,t=2,p=1$UB5Pq+0KHLbL/j8BzpY7YQ$a4WQXJXZLjGqdZO/9E1BWXmf/fd04T4CE2GCoNMdqGI'),
  ('pablo@ejemplo.com', '$argon2id$v=19$m=19456,t=2,p=1$Nrqu3xs98M6g5GdzYIBA4g$HWFdazJyWkf3mVsfP3TjtHRSobI8INQewkqnBeYN1GE')
-- ON CONFLICT … DO NOTHING: si ya hay una cuenta con ese email (el índice único sobre lower(email)),
-- no se crea otra ni se cambia la que hay.
ON CONFLICT ((lower(email))) DO NOTHING;
-- #endregion usuarios
