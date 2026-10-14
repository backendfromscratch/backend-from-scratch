-- The shop's sample data: the same the API had in memory, plus a cap nobody has ordered yet and
-- the categories. PostgreSQL sets the ids, in order: 1, 2, 3…

INSERT INTO products (name, price_cents) VALUES
  ('T-shirt', 2000),
  ('Mug', 850),
  ('Hoodie', 3500),
  ('Cap', 1500);

INSERT INTO categories (name) VALUES
  ('Clothing'),
  ('Home'),
  ('Gifts');

INSERT INTO product_categories (product_id, category_id) VALUES
  (1, 1),
  (2, 2),
  (2, 3),
  (3, 1),
  (4, 1),
  (4, 3);

-- One order every 7 hours from October 1: the oldest are already shipped.
INSERT INTO orders (product_id, quantity, status, created_at) VALUES
  (2, 2, 'shipped', '2026-10-01 09:00:00+00'),
  (3, 3, 'shipped', '2026-10-01 16:00:00+00'),
  (1, 4, 'shipped', '2026-10-01 23:00:00+00'),
  (2, 1, 'shipped', '2026-10-02 06:00:00+00'),
  (3, 2, 'shipped', '2026-10-02 13:00:00+00'),
  (1, 3, 'shipped', '2026-10-02 20:00:00+00'),
  (2, 4, 'shipped', '2026-10-03 03:00:00+00'),
  (3, 1, 'shipped', '2026-10-03 10:00:00+00'),
  (1, 2, 'shipped', '2026-10-03 17:00:00+00'),
  (2, 3, 'shipped', '2026-10-04 00:00:00+00'),
  (3, 4, 'shipped', '2026-10-04 07:00:00+00'),
  (1, 1, 'shipped', '2026-10-04 14:00:00+00'),
  (2, 2, 'paid', '2026-10-04 21:00:00+00'),
  (3, 3, 'paid', '2026-10-05 04:00:00+00'),
  (1, 4, 'paid', '2026-10-05 11:00:00+00'),
  (2, 1, 'paid', '2026-10-05 18:00:00+00'),
  (3, 2, 'paid', '2026-10-06 01:00:00+00'),
  (1, 3, 'paid', '2026-10-06 08:00:00+00'),
  (2, 4, 'paid', '2026-10-06 15:00:00+00'),
  (3, 1, 'paid', '2026-10-06 22:00:00+00'),
  (1, 2, 'pending', '2026-10-07 05:00:00+00'),
  (2, 3, 'pending', '2026-10-07 12:00:00+00'),
  (3, 4, 'pending', '2026-10-07 19:00:00+00'),
  (1, 1, 'pending', '2026-10-08 02:00:00+00'),
  (2, 2, 'pending', '2026-10-08 09:00:00+00');
