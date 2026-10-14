-- Las tablas de la tienda: qué datos guarda y qué reglas cumplen. Las reglas (las restricciones)
-- las comprueba PostgreSQL en cada cambio: un dato que no las cumple no entra, venga de donde venga.

-- #region productos
CREATE TABLE productos (
  -- La clave primaria: el número que identifica cada fila. Lo pone PostgreSQL (1, 2, 3…) y no se repite.
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NOT NULL: no puede faltar.
  nombre text NOT NULL,
  -- CHECK: una condición que cada fila tiene que cumplir. Un precio de 0 o negativo no entra.
  precio_centimos integer NOT NULL CHECK (precio_centimos > 0)
);
-- #endregion productos

-- #region categorias
CREATE TABLE categorias (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- UNIQUE: no puede haber dos categorías con el mismo nombre.
  nombre text NOT NULL UNIQUE
);
-- #endregion categorias

-- #region productos-categorias
-- Un producto puede estar en varias categorías, y una categoría tiene varios productos (N:M).
-- Esta tabla guarda cada pareja: una fila por cada producto en cada categoría.
CREATE TABLE productos_categorias (
  -- REFERENCES: una clave foránea. Solo vale el id de un producto que exista.
  -- ON DELETE CASCADE: si se borra el producto, sus filas de aquí se borran con él.
  producto_id integer NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  categoria_id integer NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
  -- La clave primaria son las dos columnas juntas: la misma pareja no puede estar dos veces.
  PRIMARY KEY (producto_id, categoria_id)
);
-- #endregion productos-categorias

-- #region pedidos
-- Cada pedido es de un producto (1:N: un producto, muchos pedidos).
CREATE TABLE pedidos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Sin ON DELETE, PostgreSQL no deja borrar un producto que tenga pedidos: los pedidos son la
  -- historia de la tienda y no se pueden quedar sin su producto.
  producto_id integer NOT NULL REFERENCES productos (id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  -- Solo estos cuatro estados: los mismos que acepta la API.
  estado text NOT NULL CHECK (estado IN ('pendiente', 'pagado', 'enviado', 'cancelado')),
  -- timestamptz: una fecha y hora con su zona horaria. PostgreSQL la guarda en UTC.
  creado_en timestamptz NOT NULL
);
-- #endregion pedidos

-- #region idempotencia
-- Las respuestas guardadas para cada Idempotency-Key (Fase 4): en una tabla, un reinicio del
-- servidor ya no las olvida.
CREATE TABLE claves_idempotencia (
  clave text PRIMARY KEY,
  -- El cuerpo de la petición: si la misma clave llega con otros datos, es un error del cliente.
  cuerpo_peticion text NOT NULL,
  -- La respuesta que se dio: el código de estado, el cuerpo y la cabecera Location, si la llevaba.
  estado integer NOT NULL,
  cuerpo text NOT NULL,
  location text,
  -- Cuándo se guardó: con esto se pueden borrar las de más de un día.
  creado_en timestamptz NOT NULL DEFAULT now()
);
-- #endregion idempotencia

-- #region eventos-procesados
-- Los ids de los avisos de la pasarela de pago ya procesados. La clave primaria impide que el
-- mismo id entre dos veces: así se sabe si un aviso está repetido.
CREATE TABLE eventos_procesados (
  id text PRIMARY KEY,
  -- DEFAULT now(): si no se dice otra cosa, la hora de ahora.
  procesado_en timestamptz NOT NULL DEFAULT now()
);
-- #endregion eventos-procesados
