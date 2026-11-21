// The queue (Phase 9, lesson 1): paying an order leaves the slow work (the notifications to the
// delivery company and the confirmation email) in a Redis queue, and a separate process, the worker,
// does it. Since lesson 7, through outbox_events: the API saves them in PostgreSQL and the relayer
// enqueues them (test/events.test.ts). The tests that need Redis use the one in REDIS_URL_TESTS
// (test/.env), like the limits' store ones: without that variable, they're skipped. Each one
// empties the queue when it starts.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { rm, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { Queue } from 'bullmq';
import { createKey } from '../src/api-keys.ts';
import { config } from '../src/config.ts';
import { findOrder } from '../src/data.ts';
import { pool } from '../src/db.ts';
import { startHeartbeat } from '../src/heartbeat.ts';
import { notifyOne } from '../src/notifications.ts';
import { relay } from '../src/outbox.ts';
import { createWorker, enqueue, JOB_OPTIONS, type Job, QUEUE_NAME } from '../src/queue.ts';
import { type RedisClient, connectRedis } from '../src/redis-store.ts';
import { sign } from '../src/signature.ts';
import { useDb } from './db.ts';

useDb();

const url = process.env.REDIS_URL_TESTS;
const noRedis = url
  ? false
  : 'no Redis: put REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to test it';

// The shop's queue, seen from the tests: to look at which jobs there are and to add some.
let client: RedisClient;
let queue: Queue<Job>;

before(() => {
  if (!url) return;
  client = connectRedis(url);
  queue = new Queue<Job>(QUEUE_NAME, {
    connection: client,
    defaultJobOptions: JOB_OPTIONS,
  });
});

after(async () => {
  await queue?.close();
  await client?.close();
});

/** Empties the queue: the jobs from another test (or another run) don't count. */
const emptyQueue = () => queue.obliterate({ force: true });

// The notifications' URLs point to 127.0.0.1, the test receivers' one: in development, that name is
// allowed (like NOTIFICATION_DEV_HOSTS=127.0.0.1 in .env).
const inDevelopment = { devHosts: ['127.0.0.1'] };

interface Received {
  headers: IncomingMessage['headers'];
  body: string;
}

/**
 * A notification receiver on 127.0.0.1: the delivery company, pretend. It writes down what it
 * receives and answers what `respond` says (which can take long, or never answer).
 */
async function receiver(respond: (time: number, response: ServerResponse) => void | Promise<void>) {
  const received: Received[] = [];
  let answered = 0;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received.push({ headers: request.headers, body });
    await respond(received.length, response);
    if (response.writableEnded) answered++;
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/notifications`,
    received,
    answered: () => answered,
    close() {
      server.closeAllConnections();
      server.close();
    },
  };
}

/** A delivery key with its notification URL, as PUT /v2/delivery/notification saves it. */
async function saveNotification(notificationUrl: string): Promise<number> {
  const { id } = await createKey('Test delivery');
  await pool.query(
    `INSERT INTO notifications (key_id, url, secret) VALUES ($1, $2, 'test-secret')`,
    [id, notificationUrl],
  );
  return id;
}

/** Waits until the condition holds, or fails when the time is up. */
async function waitFor(condition: () => boolean | Promise<boolean>, ms = 10_000, what = '') {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) assert.fail(`after ${ms} ms, not yet: ${what}`);
    await sleep(50);
  }
}

/** A free port on 127.0.0.1. */
async function freePort(): Promise<number> {
  const free = createTcpServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as AddressInfo).port;
  free.close();
  return port;
}

/**
 * Starts one of the shop's processes (the API or the worker) with the tests' environment plus the
 * one it's given, without REDIS_URL or SMTP_URL unless they're set. Collects what it writes to the log.
 */
function start(file: string, environment: Record<string, string>) {
  const { REDIS_URL: _r, SMTP_URL: _s, ...base } = process.env;
  const child: ChildProcessWithoutNullStreams = spawn('node', [file], {
    env: { ...base, LOG_LEVEL: 'info', ...environment },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  return { child, output: () => output };
}

/** The API on a free port; it returns once it's listening. */
async function startApi(environment: Record<string, string>) {
  const port = await freePort();
  const api = start('src/server.ts', { PORT: String(port), ...environment });
  await waitFor(() => api.output().includes('The shop is listening'), 10_000, 'the API starts');
  return { ...api, url: `http://127.0.0.1:${port}` };
}

/** The payment gateway says the order is paid (scripts/payment-gateway.ts). */
async function pay(shop: string, orderId: number) {
  const body = JSON.stringify({ id: `evt_${randomUUID()}`, type: 'payment.completed', orderId });
  return fetch(`${shop}/v2/webhooks/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(body, config.WEBHOOK_SECRET),
    },
    body,
  });
}

async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, 'exit');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('without REDIS_URL, paying sends the notification and the email in the same process', async () => {
  const delivery = await receiver((_time, response) => void response.writeHead(204).end());
  await saveNotification(delivery.url);
  const api = await startApi({ NOTIFICATION_DEV_HOSTS: '127.0.0.1' });
  try {
    // Order 21, pending, is Carmen's.
    const res = await pay(api.url, 21);
    assert.equal(res.status, 200);
    await waitFor(() => delivery.received.length === 1, 10_000, 'the notification arrives');
    const [{ headers, body }] = delivery.received as [Received];
    assert.equal(JSON.parse(body).order.status, 'paid');
    assert.match(String(headers['x-event-id']), UUID);
    // Without SMTP_URL, the email doesn't go out, and the log says so.
    await waitFor(() => api.output().includes('no SMTP_URL'), 10_000, 'the email');
    assert.match(api.output(), /no REDIS_URL/);
    assert.match(api.output(), /"orderId":21[,}].*no SMTP_URL/);
  } finally {
    await stop(api.child);
    delivery.close();
    await pool.query('DELETE FROM notifications');
  }
});

test(
  'paying leaves one notification for each URL and one email, and the relayer enqueues them',
  { skip: noRedis },
  async () => {
    await emptyQueue();
    const ids = [
      await saveNotification('https://93.184.215.14/notifications'),
      await saveNotification('https://93.184.215.15/notifications'),
    ];
    const api = await startApi({ REDIS_URL: url! });
    try {
      // Order 23, pending, also Carmen's.
      const res = await pay(api.url, 23);
      assert.equal(res.status, 200);
      // Since lesson 7, the API enqueues nothing: the jobs wait in outbox_events.
      assert.equal(await queue.count(), 0);
      assert.equal(await relay(50, (job) => enqueue(job, queue)), 3);
      // Nobody does them (there's no worker): they wait in the queue.
      const jobs = await queue.getJobs(['waiting']);
      const notices = jobs.filter((j) => j.data.type === 'payment-notice');
      const emails = jobs.filter((j) => j.data.type === 'confirmation-email');
      assert.equal(jobs.length, 3);
      assert.deepEqual(
        notices.map((j) => j.data.type === 'payment-notice' && j.data.notificationId).sort(),
        ids,
      );
      assert.equal(emails.length, 1);
      for (const job of jobs) {
        assert.equal(job.data.order.id, 23);
        assert.equal(job.data.order.status, 'paid');
        assert.equal(job.opts.attempts, 5);
        assert.deepEqual(job.opts.backoff, { type: 'exponential', delay: 1000 });
      }
      // A single event, order 23's payment: the same id for both URLs.
      const events = new Set(
        notices.map((j) => j.data.type === 'payment-notice' && j.data.eventId),
      );
      assert.equal(events.size, 1);
      assert.match(String([...events][0]), UUID);
      assert.doesNotMatch(api.output(), /no REDIS_URL/);
      assert.equal((await findOrder(23))!.status, 'paid');
    } finally {
      await stop(api.child);
      await emptyQueue();
      await pool.query('DELETE FROM notifications');
    }
  },
);

test(
  'the notification carries X-Event-Id, the same on every retry',
  { skip: noRedis },
  async () => {
    await emptyQueue();
    // The first time, the delivery company fails (500); the second, it answers well.
    const delivery = await receiver(
      (time, response) => void response.writeHead(time === 1 ? 500 : 204).end(),
    );
    const notificationId = await saveNotification(delivery.url);
    const worker = createWorker({ url, options: inDevelopment });
    try {
      const order = (await findOrder(13))!;
      const eventId = randomUUID();
      const job = await queue.add('payment-notice', {
        type: 'payment-notice',
        notificationId,
        order,
        eventId,
      });
      await waitFor(async () => (await job.getState()) === 'completed', 10_000, 'the retry');
      assert.equal(delivery.received.length, 2);
      for (const { headers, body } of delivery.received) {
        assert.equal(headers['x-event-id'], eventId);
        assert.equal(headers['x-signature'], sign(body, 'test-secret'));
        assert.deepEqual(JSON.parse(body), { type: 'order.paid', order });
      }
    } finally {
      await worker.close();
      delivery.close();
      await emptyQueue();
      await pool.query('DELETE FROM notifications');
    }
  },
);

test('a notification that fails throws an error (BullMQ retries it)', async () => {
  const delivery = await receiver((_time, response) => void response.writeHead(500).end());
  const notificationId = await saveNotification(delivery.url);
  try {
    const order = (await findOrder(13))!;
    await assert.rejects(notifyOne(notificationId, order, randomUUID(), inDevelopment), /500/);
    // An internal URL is never sent to (SSRF, Phase 6): that's a failure too.
    await assert.rejects(notifyOne(notificationId, order, randomUUID(), { devHosts: [] }), /https/);
    assert.equal(delivery.received.length, 1);
    // A notification that no longer exists (the company removed it) isn't a failure: nobody to notify.
    await notifyOne(999_999, order, randomUUID(), inDevelopment);
    // The retries: 5 attempts, waiting 1, 2, 4 and 8 seconds between one and the next.
    assert.equal(JOB_OPTIONS.attempts, 5);
    assert.deepEqual(JOB_OPTIONS.backoff, { type: 'exponential', delay: 1000 });
  } finally {
    delivery.close();
    await pool.query('DELETE FROM notifications');
  }
});

test(
  'a notification that does not answer is retried and the email goes out anyway',
  { skip: noRedis },
  async () => {
    await emptyQueue();
    // It receives the notification and never answers.
    const delivery = await receiver(() => {});
    const notificationId = await saveNotification(delivery.url);
    const worker = createWorker({ url, options: inDevelopment });
    try {
      const order = (await findOrder(15))!;
      const notice = await queue.add('payment-notice', {
        type: 'payment-notice',
        notificationId,
        order,
        eventId: randomUUID(),
      });
      const email = await queue.add('confirmation-email', {
        type: 'confirmation-email',
        order,
      });
      // The email doesn't wait for the notification: the worker does several jobs at once.
      await waitFor(async () => (await email.getState()) === 'completed', 4000, 'the email');
      assert.equal(await notice.getState(), 'active');
      // After 5 seconds without an answer, the notification is cut off and left for another attempt.
      await waitFor(async () => (await notice.getState()) === 'delayed', 10_000, 'the retry');
      const failed = (await queue.getJob(notice.id!))!;
      assert.equal(failed.attemptsMade, 1);
      assert.match(failed.failedReason, /does not answer in time/);
    } finally {
      await worker.close();
      delivery.close();
      await emptyQueue();
      await pool.query('DELETE FROM notifications');
    }
  },
);

test(
  'the worker beats its heartbeat while it takes jobs, and stops when it shuts down',
  { skip: noRedis },
  async () => {
    const file = join(tmpdir(), `heartbeat-${randomUUID()}`);
    const worker = createWorker({ url });
    const stopHeartbeat = startHeartbeat(() => worker.running(), { file, everyMs: 50 });
    let closed = false;
    try {
      // The first beat, at once; then another one, and another.
      const first = (await stat(file)).mtimeMs;
      await waitFor(async () => (await stat(file)).mtimeMs > first, 2000, 'another beat');
      // Shutting down (close, as on SIGTERM): it no longer takes jobs, and the file stays as it was.
      await worker.close();
      closed = true;
      assert.equal(worker.running(), false);
      const last = (await stat(file)).mtimeMs;
      await sleep(300);
      assert.equal((await stat(file)).mtimeMs, last);
    } finally {
      stopHeartbeat();
      if (!closed) await worker.close();
      await rm(file, { force: true });
    }
  },
);

test(
  'the worker shuts down on SIGTERM without cutting off the job in progress',
  { skip: noRedis },
  async () => {
    await emptyQueue();
    // It takes a second and a half to answer: enough time to send SIGTERM with the job half done.
    const delivery = await receiver(async (_time, response) => {
      await sleep(1500);
      response.writeHead(204).end();
    });
    const notificationId = await saveNotification(delivery.url);
    const worker = start('scripts/worker.ts', {
      REDIS_URL: url!,
      NOTIFICATION_DEV_HOSTS: '127.0.0.1',
    });
    try {
      const order = (await findOrder(17))!;
      const job = await queue.add('payment-notice', {
        type: 'payment-notice',
        notificationId,
        order,
        eventId: randomUUID(),
      });
      await waitFor(
        () => delivery.received.length === 1,
        10_000,
        'the worker takes the notification',
      );
      worker.child.kill('SIGTERM');
      const [code] = await once(worker.child, 'exit');
      assert.equal(code, 0, worker.output());
      // It finished the notification before leaving: the company answered and the job is done.
      assert.equal(delivery.answered(), 1);
      assert.equal(await job.getState(), 'completed');
      assert.match(worker.output(), /SIGTERM: the worker/);
    } finally {
      await stop(worker.child);
      delivery.close();
      await emptyQueue();
      await pool.query('DELETE FROM notifications');
    }
  },
);
