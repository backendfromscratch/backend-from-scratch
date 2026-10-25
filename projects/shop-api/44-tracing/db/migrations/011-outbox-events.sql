-- The outgoing events (Phase 9, lesson 7): what the shop has to do after an order is paid (notify
-- the delivery company, send the email), saved in the same transaction as the payment. If the
-- payment is saved, this is too; if not, neither. Afterwards, a relayer in the worker
-- (src/outbox.ts) reads them, puts them in the Redis queue and writes down when. It says the same
-- as the SQL drizzle-kit generated (drizzle/0008_outbox-events.sql).

-- #region outbox-events
CREATE TABLE outbox_events (
  -- bigint, not integer: it's a table that only grows, one row for each job of each payment.
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The job's type (payment-notice, confirmation-email), also inside data: here, in plain sight, to
  -- count or search without opening the JSON.
  type text NOT NULL,
  -- The whole job, the way it will go to the queue. jsonb: JSON that PostgreSQL understands inside.
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- When the relayer put it in the queue. NULL: not yet.
  sent_at timestamptz
);

-- A partial index (WHERE): only the unsent rows, the ones the relayer looks for every second. The
-- sent ones, which over time are almost all, aren't in it, so it stays small.
CREATE INDEX outbox_events_unsent ON outbox_events (created_at)
  WHERE sent_at IS NULL;
-- #endregion outbox-events
