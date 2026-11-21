-- The shop's sample data: the same the API had in memory, plus a cap nobody has ordered yet and
-- the categories. PostgreSQL sets the ids, in order: 1, 2, 3…
-- They go into a database with no products, after the migrations: npm run db:migrate and
-- npm run db:seed (scripts/seed.ts, which first loads the accounts in db/accounts.sql).
-- Since Phase 11 (lesson 5), the catalogue grows: each product has its description, and to the
-- usual four (with the same ids, names and prices: the orders use them) 16 more are added, in
-- groups that search by meaning has to tell apart: warm clothes, coffee and kitchen things, summer
-- things and gifts. With no vectors: npm run embeddings computes them.

-- #region products
INSERT INTO products (name, description, price_cents, stock) VALUES
  ('T-shirt', 'Short-sleeved cotton T-shirt with the shop logo, for every day.', 2000, 40),
  ('Mug', 'A 350 ml ceramic mug for the morning coffee or tea; it also makes a nice gift.', 850, 60),
  ('Hoodie', 'Thick cotton hoodie with a front pocket, to keep warm when it gets chilly.', 3500, 25),
  ('Cap', 'Cotton cap with a peak, to protect your head from the summer sun.', 1500, 15),
  -- Warm clothes, for the cold.
  ('Scarf', 'Long, soft and cosy scarf of thick wool, for winter days.', 2200, 30),
  ('Gloves', 'Knitted gloves lined inside, so your hands never freeze.', 1800, 35),
  ('Wool hat', 'Wool hat that covers your ears well when it is cold and windy.', 1600, 20),
  ('Blanket', 'Large fleece blanket to curl up under on the sofa on winter nights.', 3900, 12),
  -- Coffee and kitchen.
  ('Coffee beans', 'A 500 g bag of medium roast coffee beans, to grind at home.', 1100, 45),
  ('Moka pot', 'Aluminium moka pot for six cups: classic coffee, made on the stove.', 2900, 18),
  ('Teapot', 'One-litre ceramic teapot with a steel strainer, for tea or herbal infusions.', 2400, 10),
  ('Apron', 'Cotton apron with a pocket, to cook without staining your clothes.', 1400, 22),
  -- For the summer.
  ('Sunglasses', 'Light sunglasses with a UV400 filter, for the beach and very sunny days.', 2500, 14),
  ('Hand fan', 'Wooden hand fan with printed fabric, to cool down on hot days.', 1200, 25),
  ('Beach towel', 'Large striped cotton towel, to lie on the sand or by the pool.', 2100, 20),
  ('Straw hat', 'Wide-brimmed straw hat that shades your face when the sun is strong.', 1900, 12),
  ('Flip-flops', 'Rubber flip-flops for the beach, the pool and summer walks.', 1000, 30),
  -- Gifts.
  ('Gift card', 'A €25 gift card to spend in the shop, for when you do not know what to give.', 2500, 100),
  ('Scented candle', 'Soy wax candle with a vanilla scent, in a glass jar: a small gift.', 1300, 40),
  ('Notebook', 'Hardback notebook with plain pages, for notes, drawings or lists.', 900, 50);
-- #endregion products

INSERT INTO categories (name) VALUES
  ('Clothing'),
  ('Home'),
  ('Gifts');

-- Clothing is 1, Home 2 and Gifts 3.
INSERT INTO product_categories (product_id, category_id) VALUES
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

-- #region owners
-- Whose each order is (Phase 6, lesson 5): the odd-numbered ones, Carmen's; the even-numbered
-- ones, Pablo's, two of the practice accounts (db/accounts.sql, which is loaded first). They're
-- found by their email, not by their id: the id depends on the accounts that were already there.
UPDATE orders SET customer_id = (
  SELECT id FROM users
  WHERE email = CASE WHEN orders.id % 2 = 1 THEN 'carmen@example.com' ELSE 'pablo@example.com' END
);
-- #endregion owners
