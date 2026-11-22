-- Los datos de ejemplo de la tienda: los mismos que la API tenía en memoria, más una gorra que
-- nadie ha pedido todavía y las categorías. Los ids los pone PostgreSQL, en orden: 1, 2, 3…
-- Van en una base de datos sin productos, después de las migraciones: npm run bd:migrar y
-- npm run bd:datos (scripts/cargar-datos.ts, que antes carga las cuentas de bd/cuentas.sql).
-- Desde la Fase 11 (lección 5), el catálogo crece: cada producto tiene su descripción, y a los
-- cuatro de siempre (con los mismos ids, nombres y precios: los pedidos los usan) se suman 16 más,
-- en grupos que la búsqueda por el significado tiene que saber encontrar: ropa de abrigo, café y
-- cocina, cosas para el verano y regalos. Sin vectores: los calcula npm run embeddings.

-- #region productos
INSERT INTO productos (nombre, descripcion, precio_centimos, stock) VALUES
  ('Camiseta', 'Camiseta de algodón de manga corta con el logo de la tienda, para el día a día.', 2000, 40),
  ('Taza', 'Taza de cerámica de 350 ml para el café o el té de la mañana; también es un buen regalo.', 850, 60),
  ('Sudadera', 'Sudadera de algodón grueso con capucha y bolsillo delantero, para abrigarte cuando refresca.', 3500, 25),
  ('Gorra', 'Gorra de algodón con visera, para protegerte la cabeza del sol en verano.', 1500, 15),
  -- Ropa de abrigo, para el frío.
  ('Bufanda', 'Bufanda larga de lana gruesa, suave y calentita, para los días de invierno.', 2200, 30),
  ('Guantes', 'Guantes de punto forrados por dentro, para que no se te queden las manos heladas.', 1800, 35),
  ('Gorro de lana', 'Gorro de lana que tapa bien las orejas cuando hace frío y sopla el viento.', 1600, 20),
  ('Manta', 'Manta grande de forro polar para taparte en el sofá en las noches de invierno.', 3900, 12),
  -- Café y cocina.
  ('Café en grano', 'Paquete de 500 g de café de tueste natural, en grano, para molerlo en casa.', 1100, 45),
  ('Cafetera italiana', 'Cafetera de aluminio para seis tazas: el café de siempre, hecho en el fuego.', 2900, 18),
  ('Tetera', 'Tetera de cerámica de un litro con filtro de acero, para el té o las infusiones.', 2400, 10),
  ('Delantal', 'Delantal de algodón con bolsillo, para cocinar sin mancharte la ropa.', 1400, 22),
  -- Para el verano.
  ('Gafas de sol', 'Gafas de sol ligeras con filtro UV400, para la playa y los días de mucho sol.', 2500, 14),
  ('Abanico', 'Abanico de madera y tela estampada, para darte aire en los días de calor.', 1200, 25),
  ('Toalla de playa', 'Toalla grande de algodón de rayas, para tumbarte en la arena o junto a la piscina.', 2100, 20),
  ('Sombrero de paja', 'Sombrero de paja de ala ancha que te da sombra en la cara cuando aprieta el sol.', 1900, 12),
  ('Chanclas', 'Chanclas de goma para la playa, la piscina y los paseos de verano.', 1000, 30),
  -- Regalos.
  ('Tarjeta regalo', 'Tarjeta regalo de 25 € para gastar en la tienda, para cuando no sabes qué regalar.', 2500, 100),
  ('Vela aromática', 'Vela de cera de soja con olor a vainilla, en un tarro de cristal: un detalle para regalar.', 1300, 40),
  ('Libreta', 'Libreta de tapa dura con hojas lisas, para apuntes, dibujos o listas.', 900, 50);
-- #endregion productos

INSERT INTO categorias (nombre) VALUES
  ('Ropa'),
  ('Hogar'),
  ('Regalos');

-- Ropa es la 1, Hogar la 2 y Regalos la 3.
INSERT INTO productos_categorias (producto_id, categoria_id) VALUES
  (1, 1),
  (2, 2),
  (2, 3),
  (3, 1),
  (4, 1),
  (4, 3),
  (5, 1),
  (5, 3),
  (6, 1),
  (7, 1),
  (8, 2),
  (8, 3),
  (9, 2),
  (9, 3),
  (10, 2),
  (11, 2),
  (11, 3),
  (12, 2),
  (13, 1),
  (14, 3),
  (15, 2),
  (16, 1),
  (17, 1),
  (18, 3),
  (19, 2),
  (19, 3),
  (20, 3);

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

-- #region duenos
-- De quién es cada pedido (lección 5 de la Fase 6): los de número impar, de Carmen; los de número
-- par, de Pablo, dos de las cuentas de práctica (bd/cuentas.sql, que se carga antes). Se buscan por
-- su email, no por su id: el id depende de las cuentas que ya hubiera.
UPDATE pedidos SET cliente_id = (
  SELECT id FROM usuarios
  WHERE email = CASE WHEN pedidos.id % 2 = 1 THEN 'carmen@ejemplo.com' ELSE 'pablo@ejemplo.com' END
);
-- #endregion duenos
