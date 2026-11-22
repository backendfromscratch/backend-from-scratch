-- Where the shop notifies the delivery company that an order is paid (lesson 7): the URL the
-- company gives with PUT /v2/delivery/notification, and the secret the shop signs each notice with.

-- #region notifications
CREATE TABLE notifications (
  -- One per API key: the delivery company's. If the key is deleted, its notification goes too.
  key_id integer PRIMARY KEY REFERENCES api_keys (id) ON DELETE CASCADE,
  url text NOT NULL,
  -- The HMAC's secret, like the one for Phase 4's webhooks, but the other way round: here the shop
  -- signs. It's stored as is, not its hash: signing needs the secret.
  secret text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
-- #endregion notifications
