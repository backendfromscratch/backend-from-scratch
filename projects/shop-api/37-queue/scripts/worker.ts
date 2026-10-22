// The worker (Phase 9, lesson 1): the shop's other process. The same code and the same image as the
// API, with another command: it doesn't listen for requests, it takes jobs from the queue
// (src/queue.ts) and does them. With Docker Compose it starts on its own (the worker service);
// without Docker, in another terminal:
//   npm run worker
// It needs REDIS_URL (the queue) and DATABASE_URL (the notifications and the emails are in the database).
import { pool } from '../src/db.ts';
import { config } from '../src/config.ts';
import { startHeartbeat } from '../src/heartbeat.ts';
import { log } from '../src/log.ts';
import { createWorker } from '../src/queue.ts';

if (!config.REDIS_URL) {
  console.error('REDIS_URL is missing: the worker takes jobs from the queue, which is in Redis');
  process.exit(1);
}

const worker = createWorker();
// The heartbeat (src/heartbeat.ts): while the worker takes jobs, Docker considers it healthy.
const stopHeartbeat = startHeartbeat(() => worker.running());
log.info('The worker is waiting for jobs from the queue');

// #region shut-down
// Shutting down properly, like the API (Phase 7): docker stop sends SIGTERM. The worker stops taking
// jobs and finishes the one it has half done before leaving. One cut in half isn't lost (the queue
// takes it as abandoned and repeats it), but it would be done twice: one notification or email too
// many. docker stop waits 10 seconds before killing it, and no job waits more than 5 seconds
// without an answer: neither a notification (safe-url.ts) nor an email (email.ts).
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    // First, no more heartbeats: it is on its way out.
    stopHeartbeat();
    log.info(`${signal}: the worker finishes what it has half done and shuts down`);
    // If something still gets stuck, it leaves after 9 seconds, before docker stop kills it.
    setTimeout(() => process.exit(0), 9000).unref();
    try {
      await worker.close();
      await pool.end();
      process.exit(0);
    } catch (error) {
      log.error({ reason: (error as Error).message }, 'the worker did not shut down properly');
      process.exit(1);
    }
  });
}
// #endregion shut-down
