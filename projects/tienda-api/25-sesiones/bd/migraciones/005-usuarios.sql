-- Las cuentas de la tienda: quién puede iniciar sesión. De cada persona, su email y el hash de su
-- contraseña: la contraseña no se guarda nunca, ni en claro ni cifrada (src/contrasenas.ts).

-- #region usuarios
CREATE TABLE usuarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  -- El hash de la contraseña, con su sal y sus parámetros: $argon2id$v=19$m=19456,t=2,p=1$…
  -- Puede faltar (NULL): quien entra con un proveedor de identidad (lección 4) no tiene contraseña
  -- en la tienda.
  hash_contrasena text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Un email, una cuenta, sin importar las mayúsculas: Ana@Tienda.example y ana@tienda.example son
-- la misma persona. El índice es sobre lower(email), así que PostgreSQL compara los dos en
-- minúsculas, y además sirve para buscar una cuenta por su email al iniciar sesión.
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
-- #endregion usuarios
