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
import { metrics as otelMetrics, type ObservableResult } from '@opentelemetry/api';

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
  // One read at a time: with Redis frozen, getWaitingCount stays waiting in the connection's command
  // queue until it comes back, and one per collection would pile up. While one hasn't finished, no
  // other is started and nothing is observed (the SDK repeats the last value).
  let reading = false;
  const read = async (result: ObservableResult) => {
    if (reading) return;
    reading = true;
    const stop = new AbortController();
    const limit = sleep(waitMs, undefined, { signal: stop.signal }).catch(() => undefined);
    try {
      const pending = queue.getWaitingCount().finally(() => {
        reading = false;
      });
      // If the time runs out first, the read carries on (and reading stays true) until Redis
      // answers; its result, or its error, no longer matters to anyone.
      pending.catch(() => {});
      const count = await Promise.race([pending, limit]);
      if (count !== undefined) result.observe(count);
    } catch {
      // Redis doesn't answer: no value.
      reading = false;
    } finally {
      stop.abort();
    }
  };
  waiting.addCallback(read);
  return () => waiting.removeCallback(read);
}
// #endregion queue-waiting
