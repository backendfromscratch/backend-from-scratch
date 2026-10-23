-- Las sesiones: quién ha iniciado sesión, y hasta cuándo. El navegador guarda el id de su sesión en
-- una cookie; la tienda, solo su hash (SHA-256). Si alguien se llevara una copia de esta tabla, no
-- podría usar ninguna sesión: con el hash no se puede rehacer el id.

-- #region sesiones
CREATE TABLE sesiones (
  -- bytea: bytes, sin más. Los 32 bytes del SHA-256 del id. Es la clave primaria: buscar una sesión
  -- por su hash es inmediato.
  id_hash bytea PRIMARY KEY,
  -- ON DELETE CASCADE: si se borra la cuenta, sus sesiones se van con ella.
  usuario_id integer NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  creada_en timestamptz NOT NULL DEFAULT now(),
  -- Después de esta hora, la sesión ya no vale, aunque el navegador aún tenga la cookie.
  expira_en timestamptz NOT NULL
);
-- #endregion sesiones
