-- The shop's tables: what data they keep and what rules they follow. PostgreSQL checks the rules
-- (the constraints) on every change: data that breaks them doesn't get in, wherever it comes from.

-- #region products
CREATE TABLE products (
  -- The primary key: the number that identifies each row. PostgreSQL sets it (1, 2, 3…) and it never repeats.
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- NOT NULL: it can't be missing.
  name text NOT NULL,
  -- CHECK: a condition every row has to meet. A price of 0 or less doesn't get in.
  price_cents integer NOT NULL CHECK (price_cents > 0)
);
-- #endregion products

-- #region categories
CREATE TABLE categories (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- UNIQUE: there can't be two categories with the same name.
  name text NOT NULL UNIQUE
);
-- #endregion categories

-- #region product-categories
-- A product can be in several categories, and a category has several products (N:M).
-- This table keeps each pair: one row for each product in each category.
CREATE TABLE product_categories (
  -- REFERENCES: a foreign key. Only the id of a product that exists is valid.
  -- ON DELETE CASCADE: if the product is deleted, its rows here are deleted with it.
  product_id integer NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  -- The primary key is both columns together: the same pair can't be there twice.
  PRIMARY KEY (product_id, category_id)
);
-- #endregion product-categories

-- #region orders
-- Each order is for one product (1:N: one product, many orders).
CREATE TABLE orders (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Without ON DELETE, PostgreSQL won't let you delete a product that has orders: the orders are
  -- the shop's history and can't be left without their product.
  product_id integer NOT NULL REFERENCES products (id),
  quantity integer NOT NULL CHECK (quantity > 0),
  -- Only these four statuses: the same ones the API accepts.
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  -- timestamptz: a date and time with its time zone. PostgreSQL stores it in UTC.
  created_at timestamptz NOT NULL
);
-- #endregion orders
