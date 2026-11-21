// The worker (Phase 9, lesson 1): the shop's other process. The same code and the same image as the
// API, with another command: it doesn't listen for requests, it takes jobs from the queue
// (src/queue.ts) and does them. Since lesson 7 it also relays the outgoing events (src/outbox.ts):
// it moves them from PostgreSQL into the queue. With Docker Compose it starts on its own (the
// worker service); without Docker, in another terminal:
//   npm run worker
// (which starts it with --import ./src/instrumentation.ts, for the traces: Phase 10, lesson 4).
// It needs REDIS_URL (the queue) and DATABASE_URL (the notifications and the emails are in the database).
import { setTimeout as sleep } from 'node:timers/promises';
import { pool } from '../src/db.ts';
import { config } from '../src/config.ts';
import { instrumentation } from '../src/instrumentation.ts';
import { startHeartbeat } from '../src/heartbeat.ts';
import { log } from '../src/log.ts';
import { relayEverySecond } from '../src/outbox.ts';
import { closeQueue, createWorker } from '../src/queue.ts';

if (!config.REDIS_URL) {
  console.error('REDIS_URL is missing: the worker takes jobs from the queue, which is in Redis');
  process.exit(1);
}

const worker = createWorker();
// #region relayer
// The relayer: on start, the events left unsent (by an API that went down, or a Redis that wasn't
// answering); after that, every second, the new ones.
const relayer = relayEverySecond();
// #endregion relayer
// The heartbeat (src/heartbeat.ts): while the worker takes jobs and the relayer relays, Docker
// considers it healthy.
const stopHeartbeat = startHeartbeat(() => worker.running() && relayer.running());
log.info('The worker is waiting for jobs from the queue');

// #region shut-down
// Shutting down properly, like the API (Phase 7): docker stop sends SIGTERM. The relayer stops and
// the worker stops taking jobs and finishes the one it has half done before leaving. One cut in
// half isn't lost (the queue takes it as abandoned and repeats it), but it would be done twice: one
// notification or email too many. docker stop waits 10 seconds before killing it, and no job
// waits more than 5 seconds without an answer: neither a notification (safe-url.ts) nor an email
// (email.ts).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    // First, no more heartbeats: it is on its way out.
    stopHeartbeat();
    log.info(`${signal}: the worker finishes what it has half done and shuts down`);
    // If something still gets stuck, it leaves after 9 seconds, before docker stop kills it, and
    // with an error (1): it couldn't shut down properly.
    setTimeout(() => process.exit(1), 9000).unref();
    try {
      // The relayer first, which uses the queue and PostgreSQL: it finishes its round and doesn't
      // start another.
      await relayer.stop();
      await worker.close();
      await closeQueue();
      await pool.end();
      // And the last spans, to Jaeger (Phase 10, lesson 4), if possible: 2 seconds at most, and if
      // Jaeger doesn't answer, no harm done. A few lost traces are not a failed shutdown.
      await Promise.race([
        instrumentation.shutdown().catch(() => {}),
        sleep(2000, undefined, { ref: false }),
      ]);
      process.exit(0);
    } catch (error) {
      log.error({ reason: (error as Error).message }, 'the worker did not shut down properly');
      process.exit(1);
    }
  });
}
// #endregion shut-down
