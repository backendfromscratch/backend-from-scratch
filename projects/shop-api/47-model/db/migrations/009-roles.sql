-- Roles (lesson 5): what each account and each key can do, and whose each order is.

-- #region roles
-- Each person has a role: customer (the usual: whoever signs up), delivery or admin. DEFAULT: the
-- accounts that were already there, and the new ones, are customers'. Making someone admin is an
-- UPDATE by hand, done by another admin person: never something asked for through the API.
ALTER TABLE users
  ADD COLUMN role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'delivery', 'admin'));

-- A key belongs to a program: delivery (just what the delivery company needs) or admin. Never
-- customer: a program has no orders of its own.
ALTER TABLE api_keys
  ADD COLUMN role text NOT NULL DEFAULT 'delivery' CHECK (role IN ('delivery', 'admin'));
-- #endregion roles

-- #region customer-orders
-- Whose each order is. It can be missing (NULL) in the orders that were already there: they were
-- placed when the shop had no accounts, and nobody knows whose they are. From now on, each new
-- order carries its own.
ALTER TABLE orders ADD COLUMN customer_id integer REFERENCES users (id);

-- A customer's list of orders, from newest to oldest: the same order as migration 003's index,
-- but starting with the customer.
CREATE INDEX orders_by_customer ON orders (customer_id, created_at DESC, id DESC);
-- #endregion customer-orders
