-- Las claves de API: cómo se identifica un programa, no una persona. La empresa de reparto (Fase 4)
-- tendrá la suya. Como con las sesiones, la tienda guarda el hash de cada clave, nunca la clave:
-- se enseña una sola vez, al crearla (scripts/crear-clave.ts).

-- #region claves-api
CREATE TABLE claves_api (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- De quién es, para que una persona la reconozca: «Reparto Rápido».
  nombre text NOT NULL,
  -- El SHA-256 de la clave. UNIQUE: además de impedir dos iguales, crea el índice con el que se
  -- busca la clave que llega en cada petición.
  hash bytea NOT NULL UNIQUE,
  creada_en timestamptz NOT NULL DEFAULT now(),
  -- La última vez que se usó: una clave que nadie usa desde hace meses se puede borrar.
  usada_en timestamptz
);
-- #endregion claves-api
