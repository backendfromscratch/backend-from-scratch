// The outgoing events (Phase 9, lesson 7), the outbox pattern. Until lesson 6, paying an order was
// two writes in two places: the order, in PostgreSQL, and then its jobs (the notifications and the
// email), in the Redis queue. If the API went down between one and the other, or Redis didn't
// answer, the order was left paid and its jobs were nowhere.
// Now the jobs are saved in PostgreSQL, in the outbox_events table and in the same transaction as
// the payment: either both are saved, or neither. A relayer, in the worker, reads the ones that
// haven't been sent, puts them in the queue and writes down that they are there.
import { setTimeout as sleep } from 'node:timers/promises';
import { context, propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import { asc, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Transaction } from './db.ts';
import { log } from './log.ts';
import { enqueue, type Job } from './queue.ts';
import { outboxEvents } from './schema.ts';

// #region save-outbox
// Saves a job for later, inside the transaction tx: with its COMMIT, it is saved with everything
// else; with a ROLLBACK, it disappears with everything else. Nothing goes to Redis yet.
// Since Phase 10 (lesson 4), with the trace it is saved in (the payment's), in context:
// propagation.inject writes it as the traceparent header of the W3C standard, the same one that
// travels between services over HTTP. Without traces, it writes nothing, and context stays NULL.
export async function saveOutbox(tx: Transaction, job: Job): Promise<void> {
  const carrier: { traceparent?: string } = {};
  propagation.inject(context.active(), carrier);
  await tx
    .insert(outboxEvents)
    .values({ type: job.type, data: job, context: carrier.traceparent ?? null });
}
// #endregion save-outbox

// #region in-its-trace
// The opposite: it does something inside the trace that saved the event. propagation.extract reads
// the traceparent, and context.with makes whatever happens inside (BullMQ's span when writing down
// the job) a child of the payment's span. An event with no context (without traces, or from before
// migration 012) starts a new trace.
function inItsTrace<T>(traceContext: string | null, run: () => Promise<T>): Promise<T> {
  if (!traceContext) return run();
  return context.with(propagation.extract(ROOT_CONTEXT, { traceparent: traceContext }), run);
}
// #endregion in-its-trace

// #region relay
// How long the relayer waits for Redis, at most, in each round. While it waits it has a transaction
// open and its rows locked, and a hung Redis would never answer (the time limit of each command of
// the Redis client doesn't work for one that has already gone out: Phase 9, lesson 2).
export const QUEUE_WAIT = 2000; // ms

// One round of the relayer. In a transaction:
//   1. It reads up to limit unsent events, the oldest first. FOR UPDATE locks them until the end of
//      the transaction, and SKIP LOCKED skips the ones another has already locked: with two
//      workers, each takes its own, and never the same one.
//   2. It puts them in the queue, one after another, while QUEUE_WAIT hasn't passed since the first.
//   3. It marks as sent (sent_at) the ones Redis has confirmed, and COMMIT. It returns how many.
// If the time runs out (Redis is slow), the round keeps the ones that have already arrived and
// leaves the rest for the next one: that way, even if Redis is slow, each round moves forward. If
// none has arrived (Redis doesn't answer), or Redis gives an error, it throws the error, the
// transaction ends with ROLLBACK and the events stay unsent: the next round tries them again.
// It never marks as sent what Redis hasn't confirmed.
// It enqueues inside the transaction, and not after the COMMIT, on purpose: if they were marked as
// sent first and enqueued afterwards, a worker that goes down between the two things would lose
// them, the same problem as before. The price is the opposite one: if it goes down after enqueuing
// and before the COMMIT (or Redis answers late, when the event has already been left for another
// round), the next round enqueues it again. They arrive at least once, sometimes twice
// (at-least-once), and that is why each job carries its id: BullMQ doesn't write down the same one
// twice (jobId, in queue.ts).
// toQueue: in the tests, another queue, or one that fails, is slow or doesn't answer.
export async function relay(
  limit = 50,
  toQueue: (job: Job) => Promise<void> = enqueue,
): Promise<number> {
  return db.transaction(async (tx) => {
    // #region no-owner
    // If the worker disappears with the transaction open (its machine is switched off, the network
    // is cut), PostgreSQL doesn't find out until TCP gives the connection up for lost, and that can
    // take hours: until then, its rows stay locked and nobody relays them. With this, a transaction
    // that spends 5 seconds without sending anything is cut and releases its rows. 5 seconds, more
    // than QUEUE_WAIT: while it waits for Redis, the transaction isn't sending anything either.
    // SET LOCAL: only for this transaction, not for the connection, which goes back to the pool.
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    // #endregion no-owner
    // #region read-pending
    const rows = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.sentAt))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (rows.length === 0) return 0;
    // #endregion read-pending

    // #region enqueue-in-time
    // One after another, each against the same deadline: the one that doesn't arrive in time, and
    // the ones behind it, are left for the next round. Each one, in its payment's trace.
    const deadline = sleep(QUEUE_WAIT, 'late' as const, { ref: false });
    const sent: number[] = [];
    for (const row of rows) {
      const outcome = await Promise.race([
        inItsTrace(row.context, () => toQueue(row.data)).then(() => 'queued' as const),
        deadline,
      ]);
      if (outcome === 'late') break;
      sent.push(row.id);
    }
    if (sent.length === 0) throw new Error(`the queue doesn't answer in ${QUEUE_WAIT} ms`);
    if (sent.length < rows.length) {
      log.warn(
        { sent: sent.length, of: rows.length },
        'the queue is slow: the rest, in the next round',
      );
    }
    // #endregion enqueue-in-time

    // #region mark-sent
    // clock_timestamp(): the time now, after enqueuing. now() would be the BEGIN's.
    await tx
      .update(outboxEvents)
      .set({ sentAt: sql`clock_timestamp()` })
      .where(inArray(outboxEvents.id, sent));
    return sent.length;
    // #endregion mark-sent
  });
}
// #endregion relay

// #region relay-every-second
// The relayer, running: a round at the start and another every intervalMs (a second). If a round
// comes back full (there are more waiting), the next one starts right away. Each round starts when
// the previous one has finished, never at the same time: with setTimeout, after each one, and not
// setInterval. stop() doesn't start any more and waits for the one halfway: when shutting down
// (scripts/worker.ts), before closing the queue and PostgreSQL. A round lasts at most QUEUE_WAIT
// plus whatever PostgreSQL takes.
export function relayEverySecond(
  toQueue: (job: Job) => Promise<void> = enqueue,
  intervalMs = 1000,
): { running(): boolean; stop(): Promise<void> } {
  const LIMIT = 50;
  let stopped = false;
  let next: NodeJS.Timeout | undefined;
  let round: Promise<void>;

  async function oneRound() {
    try {
      let relayed;
      do {
        relayed = await relay(LIMIT, toQueue);
        // Relayed: in the queue or, without Redis, already being done in this process (enqueue).
        if (relayed > 0) log.info({ events: relayed }, 'outgoing events relayed');
      } while (relayed === LIMIT && !stopped);
    } catch (error) {
      log.warn(
        { reason: (error as Error).message },
        "the outgoing events haven't reached the queue: it will be retried",
      );
    }
    if (!stopped) next = setTimeout(() => (round = oneRound()), intervalMs);
  }

  round = oneRound();
  return {
    // Whether it's still relaying: until stop(). The worker's heartbeat asks it.
    running: () => !stopped,
    async stop() {
      stopped = true;
      clearTimeout(next);
      await round;
    },
  };
}
// #endregion relay-every-second
