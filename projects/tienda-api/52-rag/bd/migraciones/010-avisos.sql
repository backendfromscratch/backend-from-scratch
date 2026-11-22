-- A dónde avisa la tienda a la empresa de reparto de que un pedido está pagado (lección 7): la URL
-- que la empresa da con PUT /v2/reparto/aviso, y el secreto con el que la tienda firma cada aviso.

-- #region avisos
CREATE TABLE avisos (
  -- Uno por clave de API: la de la empresa de reparto. Si se borra la clave, su aviso también.
  clave_id integer PRIMARY KEY REFERENCES claves_api (id) ON DELETE CASCADE,
  url text NOT NULL,
  -- El secreto del HMAC, como el de los webhooks de la Fase 4, pero al revés: aquí firma la tienda.
  -- Se guarda tal cual, no su hash: para firmar hace falta el secreto.
  secreto text NOT NULL,
  cambiado_en timestamptz NOT NULL DEFAULT now()
);
-- #endregion avisos
