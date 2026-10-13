-- Los datos de la tienda de Ana y Luis, para practicar SQL (Backend desde cero, Fase 5).
-- Cárgalos en tu base de datos con:
--   psql -d tienda -f tienda.sql
-- Cuidado: primero borra estas cuatro tablas si ya existen, para empezar siempre igual.

DROP TABLE IF EXISTS pedidos, productos_categorias, categorias, productos;

CREATE TABLE productos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  precio_centimos integer NOT NULL CHECK (precio_centimos > 0)
);

CREATE TABLE categorias (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

-- Un producto puede estar en varias categorías, y una categoría tiene varios productos.
CREATE TABLE productos_categorias (
  producto_id integer NOT NULL REFERENCES productos (id) ON DELETE CASCADE,
  categoria_id integer NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
  PRIMARY KEY (producto_id, categoria_id)
);

CREATE TABLE pedidos (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  producto_id integer NOT NULL REFERENCES productos (id),
  cantidad integer NOT NULL CHECK (cantidad > 0),
  estado text NOT NULL CHECK (estado IN ('pendiente', 'pagado', 'enviado', 'cancelado')),
  creado_en timestamptz NOT NULL
);

INSERT INTO productos (nombre, precio_centimos) VALUES
  ('Camiseta', 2000),
  ('Taza', 850),
  ('Sudadera', 3500),
  ('Gorra', 1500);

INSERT INTO categorias (nombre) VALUES
  ('Ropa'),
  ('Hogar'),
  ('Regalos');

INSERT INTO productos_categorias (producto_id, categoria_id) VALUES
  (1, 1),
  (2, 2),
  (2, 3),
  (3, 1),
  (4, 1),
  (4, 3);

-- Un pedido cada 7 horas desde el 1 de octubre: los más antiguos ya están enviados.
INSERT INTO pedidos (producto_id, cantidad, estado, creado_en) VALUES
  (2, 2, 'enviado', '2026-10-01 09:00:00+00'),
  (3, 3, 'enviado', '2026-10-01 16:00:00+00'),
  (1, 4, 'enviado', '2026-10-01 23:00:00+00'),
  (2, 1, 'enviado', '2026-10-02 06:00:00+00'),
  (3, 2, 'enviado', '2026-10-02 13:00:00+00'),
  (1, 3, 'enviado', '2026-10-02 20:00:00+00'),
  (2, 4, 'enviado', '2026-10-03 03:00:00+00'),
  (3, 1, 'enviado', '2026-10-03 10:00:00+00'),
  (1, 2, 'enviado', '2026-10-03 17:00:00+00'),
  (2, 3, 'enviado', '2026-10-04 00:00:00+00'),
  (3, 4, 'enviado', '2026-10-04 07:00:00+00'),
  (1, 1, 'enviado', '2026-10-04 14:00:00+00'),
  (2, 2, 'pagado', '2026-10-04 21:00:00+00'),
  (3, 3, 'pagado', '2026-10-05 04:00:00+00'),
  (1, 4, 'pagado', '2026-10-05 11:00:00+00'),
  (2, 1, 'pagado', '2026-10-05 18:00:00+00'),
  (3, 2, 'pagado', '2026-10-06 01:00:00+00'),
  (1, 3, 'pagado', '2026-10-06 08:00:00+00'),
  (2, 4, 'pagado', '2026-10-06 15:00:00+00'),
  (3, 1, 'pagado', '2026-10-06 22:00:00+00'),
  (1, 2, 'pendiente', '2026-10-07 05:00:00+00'),
  (2, 3, 'pendiente', '2026-10-07 12:00:00+00'),
  (3, 4, 'pendiente', '2026-10-07 19:00:00+00'),
  (1, 1, 'pendiente', '2026-10-08 02:00:00+00'),
  (2, 2, 'pendiente', '2026-10-08 09:00:00+00');
