// The job queue (Phase 9, lesson 1). What a request doesn't have to wait for (notifying the
// delivery company, sending an email) is written down in a queue and the answer goes out at once.
// Another process, the worker (scripts/worker.ts), takes the jobs from the queue and does them. If
// one fails, the queue keeps it and tries it again later.
// The queue lives in Redis, the same one as the attempt limits, with BullMQ: whoever writes the job
// down (the API) and whoever does it (the worker) are two processes, and may be on two machines.
import { type DefaultJobOptions, Queue, Worker } from 'bullmq';
import { config } from './config.ts';
import type { Order } from './data.ts';
import { sendConfirmation } from './email.ts';
import { log } from './log.ts';
import { notifyOne } from './notifications.ts';
import { type RedisClient, connectRedis } from './redis-store.ts';
import type { Options } from './safe-url.ts';

// The kinds of job: each one carries what it needs to be done, as JSON. eventId: the id of the
// notification, the same on every attempt (notifications.ts).
export type Job =
  | { type: 'payment-notice'; notificationId: number; order: Order; eventId: string }
  | { type: 'confirmation-email'; order: Order };

export const QUEUE_NAME = 'shop';

// #region retries
// Five attempts in all. Between one and the next, a wait that doubles (exponential): 1, 2, 4 and 8
// seconds. A receiver that is down for a moment has time to come back, and one that is down for good
// doesn't get a request every second. Finished jobs are forgotten after the last 1000; those that
// fail five times stay (also the last 1000), to look at what happened.
export const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
} satisfies DefaultJobOptions;
// #endregion retries

// Running a job: what the worker calls with each one it takes from the queue. If it throws an error,
// the job has failed.
export async function runJob(job: Job, options?: Options): Promise<void> {
  switch (job.type) {
    case 'payment-notice':
      return notifyOne(job.notificationId, job.order, job.eventId, options);
    case 'confirmation-email':
      await sendConfirmation(job.order);
      return;
  }
}

// #region enqueue
// The queue, if there is Redis, created the first time it's needed: the worker also loads this file
// and doesn't use it. The connection is its own: the limits' one does another job.
let theQueue: Queue<Job> | undefined;
let queueConnection: RedisClient | undefined;
function getQueue(url: string): Queue<Job> {
  if (!theQueue) {
    queueConnection = connectRedis(url);
    theQueue = new Queue<Job>(QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: JOB_OPTIONS,
    });
    // The connection's errors (Redis down) go to the log, like the worker's.
    theQueue.on('error', (error) => log.error({ reason: error.message }, 'queue error'));
  }
  return theQueue;
}

// Writes the job down in the queue and returns: it doesn't wait for it to be done. The job's name
// is its type, so it reads like that in the log and in Redis.
// Without Redis (without Docker, as until Phase 8), it's done right here, now, without waiting for
// it and without retries: if it fails, it stays in the log and nothing else.
export async function enqueue(job: Job): Promise<void> {
  if (config.REDIS_URL) {
    await getQueue(config.REDIS_URL).add(job.type, job);
    return;
  }
  log.info({ type: job.type }, 'no REDIS_URL: the job is done in this process, with no queue');
  void runJob(job).catch((error: Error) =>
    log.warn({ type: job.type, reason: error.message }, 'job failed, no retries'),
  );
}
// #endregion enqueue

// #region close-queue
// When the API shuts down (Phase 9, lesson 4): closes the queue's connection, if it was ever
// opened. With destroy(), without waiting for Redis: close() asks it to close and waits for its
// answer, and a hung Redis would never answer. When it's called, no request is left, and nothing
// to enqueue.
export async function closeQueue(): Promise<void> {
  queueConnection?.destroy();
}
// #endregion close-queue

// #region worker
// The worker: takes the jobs from the queue and does them, up to five at a time (concurrency), so a
// notification that takes long doesn't hold up an email. If runJob throws an error, BullMQ writes
// the failure down and leaves the job waiting for its next attempt (JOB_OPTIONS). url and options:
// in the tests, their Redis and the names allowed for the notifications.
export function createWorker(settings: { url?: string | undefined; options?: Options } = {}): {
  running(): boolean;
  close(): Promise<void>;
} {
  const url = settings.url ?? config.REDIS_URL;
  if (!url) throw new Error('The worker needs REDIS_URL: the queue is in Redis');
  // Its own connection: BullMQ copies it to wait for jobs (a wait that blocks the connection).
  const connection = connectRedis(url);
  const worker = new Worker<Job>(QUEUE_NAME, (job) => runJob(job.data, settings.options), {
    connection,
    concurrency: 5,
  });
  worker.on('completed', (job) => log.info({ id: job.id, type: job.name }, 'job done'));
  worker.on('failed', (job, error) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    log.warn(
      {
        id: job.id,
        type: job.name,
        attempt: job.attemptsMade,
        of: attempts,
        reason: error.message,
      },
      job.attemptsMade < attempts
        ? 'job failed: it will be retried'
        : 'job failed: no attempts left',
    );
  });
  // The connection's errors (Redis down): BullMQ reconnects on its own.
  worker.on('error', (error) => log.error({ reason: error.message }, 'worker error'));
  return {
    // Whether it's taking jobs: running, and not shutting down. The heartbeat asks it
    // (scripts/worker.ts).
    running: () => worker.isRunning() && !worker.closing,
    // close() stops taking new jobs and waits for those half done to finish.
    async close() {
      await worker.close();
      await connection.close();
    },
  };
}
// #endregion worker
