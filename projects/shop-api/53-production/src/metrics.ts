// The shop's metrics (Phase 10, lesson 5). A metric is a number measured over time: how many
// requests, how long they take, how many paid orders. Prometheus keeps them and Grafana draws them.
// Each request's are measured by @hono/otel (app.ts); here, the ones only the shop knows: what
// happens in the business and inside it.
// Be careful with attributes: each different combination of values is a series Prometheus keeps
// forever. That is why they only carry what has few values, like a route's template
// (/orders/{id}) or the status code, and never a whole URL, an id or an email: with one per order
// or per customer, the series would grow without stopping (cardinality).
// Without instrumentation (instrumentation.ts), the meter does nothing and these calls cost nothing.
import { setTimeout as sleep } from 'node:timers/promises';
import {
  metrics as otelMetrics,
  type ObservableGauge,
  type ObservableResult,
} from '@opentelemetry/api';

const meter = otelMetrics.getMeter('shop');

// #region counters
// A counter only goes up: 1 is added every time something happens. Prometheus adds _total to the
// name and changes the dots to underscores: shop_orders_paid_total.
export const metrics = {
  // An order that really became paid (v2.ts). A repeated event, or a payment for a cancelled order,
  // changes nothing and doesn't count.
  ordersPaid: meter.createCounter('shop.orders.paid', {
    description: 'Orders that became paid',
  }),
  // A response that doesn't have the shape the contract promises (contract-responses.ts). Attribute
  // route: the contract's template (/orders/{id}).
  responsesOutsideContract: meter.createCounter('shop.responses.outside_contract', {
    description: "Responses that don't meet the API's contract",
  }),
  // #region ai
  // Phase 11, lesson 7: what the AI model spends (assistant/cost.ts, after every call). The tokens,
  // with two attributes: model and kind (input, output, cache_read, cache_write). In Prometheus,
  // shop_ai_tokens_total.
  aiTokens: meter.createCounter('shop.ai.tokens', {
    description: 'Tokens of the calls to the AI model, by model and kind',
  }),
  // The same, in dollars, with the model attribute: shop_ai_cost_dollars_total. A counter can add
  // decimals: each call adds what it cost, a few ten-thousandths of a dollar.
  aiCost: meter.createCounter('shop.ai.cost_dollars', {
    description: 'What the calls to the AI model cost, in dollars',
  }),
  // A histogram doesn't keep each measurement: it counts how many fall in each range (bucket), and
  // with that Prometheus computes percentiles. This one measures, in streamed answers, how long it
  // takes from when the shop starts asking the model until it sends the customer the first piece of
  // text (the time to first token): it's what the customer waits looking at an empty screen. With
  // tools, it includes the rounds before the first text. The ranges, in seconds: the ones
  // OpenTelemetry brings by default (from 0 to 10,000) are for milliseconds. unit: 's', and
  // Prometheus adds it to the name: shop_ai_time_to_first_token_seconds.
  aiTimeToFirstToken: meter.createHistogram('shop.ai.time_to_first_token', {
    description: "Seconds until the first piece of text of a streamed assistant's answer",
    unit: 's',
    advice: { explicitBucketBoundaries: [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 8, 13, 20] },
  }),
  // #endregion ai
};
// #endregion counters

// #region queue-waiting
// A gauge doesn't add up: it says what something is worth now, and it can go up and down. The jobs
// waiting in the queue are one: if they grow, the worker can't keep up. Nothing is stored: every
// time the metrics are collected, the queue is asked. And it is asked in a hurry: if Redis doesn't
// answer within waitMs, nothing is observed this time (better that than a false zero, or a
// collection that never ends). Careful: that doesn't leave a gap in the chart. The SDK sends the
// values accumulated since it started (cumulative temporality), and for a gauge that is the last one
// observed: with Redis frozen, Prometheus keeps receiving the earlier number, as if nothing had
// happened. It returns the function that stops observing.
export function observeQueue(
  queue: { getWaitingCount(): Promise<number> },
  { waitMs = 2000 }: { waitMs?: number } = {},
): () => void {
  const waiting = meter.createObservableGauge('shop.queue.waiting', {
    description: 'Jobs waiting in the queue',
  });
  return observeInAHurry(waiting, () => queue.getWaitingCount(), waitMs);
}

// What the gauges that ask another server share (this one and the outgoing events' age, further
// down). One read at a time: with Redis frozen, getWaitingCount stays waiting in the connection's
// command queue until it comes back, and one per collection would pile up. While one hasn't
// finished, no other is started and nothing is observed (the SDK repeats the last value).
function observeInAHurry(
  gauge: ObservableGauge,
  readValue: () => Promise<number>,
  waitMs: number,
): () => void {
  let reading = false;
  const read = async (result: ObservableResult) => {
    if (reading) return;
    reading = true;
    const stop = new AbortController();
    const limit = sleep(waitMs, undefined, { signal: stop.signal }).catch(() => undefined);
    try {
      const pending = readValue().finally(() => {
        reading = false;
      });
      // If the time runs out first, the read carries on (and reading stays true) until it
      // answers; its result, or its error, no longer matters to anyone.
      pending.catch(() => {});
      const value = await Promise.race([pending, limit]);
      if (value !== undefined) result.observe(value);
    } catch {
      // It doesn't answer: no value.
      reading = false;
    } finally {
      stop.abort();
    }
  };
  gauge.addCallback(read);
  return () => gauge.removeCallback(read);
}
// #endregion queue-waiting

// #region outbox-age
// How many seconds the oldest unsent outgoing event has been waiting (Phase 10, lesson 6). It is
// what the customer notices when something fails without giving any error: the payment goes well,
// but the email doesn't arrive. If the relayer works, it never goes over a few seconds; if it
// grows, something is stopping it. It is read from PostgreSQL, not from Redis: that way it keeps
// telling the truth when what has failed is the queue's Redis. The API reads it (server.ts), in a
// hurry, like the queue's: one read at a time and, if PostgreSQL doesn't answer within waitMs,
// nothing new. As with the queue's, the SDK then repeats the last value: with PostgreSQL frozen,
// the age stands still instead of growing, and this alert doesn't fire (the others warn of that:
// the slowness and the errors). unit: 's', and Prometheus adds it to the name:
// shop_outbox_age_seconds.
export const outboxAge = meter.createObservableGauge('shop.outbox.age', {
  description: 'Seconds the oldest unsent outgoing event has been waiting',
  unit: 's',
});

/** Starts observing the age with read (unsentAge, in outbox.ts). */
export function observeOutbox(
  read: () => Promise<number>,
  { waitMs = 2000 }: { waitMs?: number } = {},
): () => void {
  return observeInAHurry(outboxAge, read, waitMs);
}
// #endregion outbox-age
