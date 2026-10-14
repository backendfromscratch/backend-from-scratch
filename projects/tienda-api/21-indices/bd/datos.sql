-- Los datos de ejemplo de la tienda: los mismos que la API tenía en memoria, más una gorra que
-- nadie ha pedido todavía y las categorías. Los ids los pone PostgreSQL, en orden: 1, 2, 3…
-- Van en una base de datos vacía, después de las migraciones: npm run bd:migrar y npm run bd:datos.

INSERT INTO productos (nombre, precio_centimos, stock) VALUES
  ('Camiseta', 2000, 40),
  ('Taza', 850, 60),
  ('Sudadera', 3500, 25),
  ('Gorra', 1500, 15);

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
