-- The trace of each outgoing event (Phase 10, lesson 4). The API saves the event inside the payment's
-- request, and the relayer puts it in the queue later, in another process and with no request:
-- without this, the job would start a new trace, and it wouldn't show that it comes from that
-- payment. It says the same as the SQL drizzle-kit generated (drizzle/0009_event-context.sql).

-- #region context
-- The trace and the span the event was saved in, in the format of the W3C Trace Context standard
-- (the traceparent header): 00-<trace id>-<span id>-01. NULL if there are no traces (without
-- OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) and in the events from before this migration: those are
-- relayed all the same, each one in a trace of its own. It allows NULL and has no DEFAULT:
-- PostgreSQL only notes that the column exists, without touching the rows that are already there.
ALTER TABLE outbox_events ADD COLUMN context text;
-- #endregion context
