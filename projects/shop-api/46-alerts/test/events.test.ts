// The outgoing events (Phase 9, lesson 7): paying an order no longer puts anything in the queue. It
// saves the order's change and what has to be done afterwards (the notifications and the email) in
// the same transaction, in the outbox_events table. A relayer, in the worker, moves them to the
// queue. The tests that need Redis use the one in REDIS_URL_TESTS (test/.env): without it, they're
// skipped.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { Queue } from 'bullmq';
import { createKey } from '../src/api-keys.ts';
import { app } from '../src/app.ts';
import { config } from '../src/config.ts';
import { findOrder } from '../src/data.ts';
import { db, pool } from '../src/db.ts';
import { QUEUE_WAIT, relay, relayEverySecond, saveOutbox } from '../src/outbox.ts';
import { createWorker, enqueue, JOB_OPTIONS, type Job, QUEUE_NAME } from '../src/queue.ts';
import { type RedisClient, connectRedis } from '../src/redis-store.ts';
import { sign } from '../src/signature.ts';
import { useDb } from './db.ts';
import { asUser, CARMEN } from './identities.ts';

let carmen: Record<string, string>;
useDb(async () => {
  carmen = await asUser(CARMEN);
});

const url = process.env.REDIS_URL_TESTS;
const noRedis = url
  ? false
  : 'no Redis: put REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to test it';

// The shop's queue, seen from the tests.
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

// Each test starts with no events, no saved notifications and an empty queue.
beforeEach(async () => {
  await pool.query('DELETE FROM outbox_events');
  await pool.query('DELETE FROM notifications');
  await queue?.obliterate({ force: true });
});

/** Enqueues in the tests' queue (the Redis in REDIS_URL_TESTS), with the real enqueue. */
const toTestQueue = (job: Job) => enqueue(job, queue);

/** Creates a pending order for Carmen and returns its id. */
async function newOrder(): Promise<number> {
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"productId":1,"quantity":1}',
  });
  assert.equal(res.status, 201);
  return (await res.json()).id;
}

/** The payment gateway says the order is paid, with a signed webhook. */
function pay(orderId: number, eventId = `evt_${randomUUID()}`, shop?: string) {
  const body = JSON.stringify({ id: eventId, type: 'payment.completed', orderId });
  const request = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signature': sign(body, config.WEBHOOK_SECRET),
    },
    body,
  };
  return shop
    ? fetch(`${shop}/v2/webhooks/payments`, request)
    : app.request('/v2/webhooks/payments', request);
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

interface OutboxRow {
  id: string;
  type: string;
  data: Job;
  sent_at: Date | null;
}
const outbox = async (): Promise<OutboxRow[]> =>
  (await pool.query<OutboxRow>('SELECT * FROM outbox_events ORDER BY id')).rows;

/** Waits until the condition holds, or fails when the time is up. */
async function waitFor(condition: () => boolean | Promise<boolean>, ms = 10_000, what = '') {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) assert.fail(`after ${ms} ms, not yet: ${what}`);
    await sleep(50);
  }
}

/** An email for the order, as paying would save it. */
async function emailFor(orderId: number): Promise<Job> {
  return { type: 'confirmation-email', order: (await findOrder(orderId))! };
}

/** Starts one of the shop's processes with the tests' environment plus the one it's given. */
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

/** A free port on 127.0.0.1. */
async function freePort(): Promise<number> {
  const free = createTcpServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as AddressInfo).port;
  free.close();
  return port;
}

async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await once(child, 'exit');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('paying saves the change and the events in the same transaction', async () => {
  const ids = [
    await saveNotification('https://93.184.215.14/notifications'),
    await saveNotification('https://93.184.215.15/notifications'),
  ];
  const id = await newOrder();
  const res = await pay(id);
  assert.equal(res.status, 200);
  assert.equal((await findOrder(id))!.status, 'paid');

  // Three unsent events: one notification for each URL and the email. Nobody has put them in the queue.
  const rows = await outbox();
  assert.deepEqual(rows.map((row) => row.type).sort(), [
    'confirmation-email',
    'payment-notice',
    'payment-notice',
  ]);
  for (const row of rows) {
    assert.equal(row.sent_at, null);
    assert.equal(row.data.type, row.type);
    assert.equal(row.data.order.id, id);
    assert.equal(row.data.order.status, 'paid');
  }
  const notices = rows.flatMap((row) => (row.data.type === 'payment-notice' ? [row.data] : []));
  assert.deepEqual(notices.map((notice) => notice.notificationId).sort(), ids);
  // A single payment: the same event id in both notifications.
  assert.equal(new Set(notices.map((notice) => notice.eventId)).size, 1);
  assert.match(notices[0]!.eventId, UUID);
  if (queue) assert.equal(await queue.count(), 0);

  // The same gateway notification again: neither another change nor another event.
  const again = await pay(id);
  assert.equal(again.status, 200);
  assert.equal((await outbox()).length, 3);
});

test("many payments at once don't end up waiting for a connection", async () => {
  // More payments at once than connections the pool has (10): each one uses only its transaction's.
  const ids: number[] = [];
  for (let i = 0; i < 30; i++) ids.push(await newOrder());
  const payments = Promise.all(ids.map((id) => pay(id)));
  const result = await Promise.race([payments, sleep(10_000, 'stuck')]);
  assert.notEqual(result, 'stuck', "the payments don't finish: the pool ran out of connections");
  for (const res of result as Response[]) assert.equal(res.status, 200);
  assert.equal((await outbox()).length, 30);
});

test('if the transaction fails, no event is left', async () => {
  // Directly: save an event and fail afterwards, in the same transaction.
  const email = await emailFor(21);
  await assert.rejects(
    db.transaction(async (tx) => {
      await saveOutbox(tx, email);
      throw new Error('something fails afterwards');
    }),
    /something fails afterwards/,
  );
  assert.deepEqual(await outbox(), []);

  // And in the route: if saving the event fails (here, a trigger that prevents it), the whole
  // payment is undone. The order stays pending and the gateway's event isn't written down, so when
  // the gateway retries it, it's processed.
  await pool.query(`
    CREATE FUNCTION prevent() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'outbox_events accepts no rows'; END $$;
    CREATE TRIGGER prevent BEFORE INSERT ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION prevent();
  `);
  const id = await newOrder();
  const eventId = `evt_${randomUUID()}`;
  try {
    const res = await pay(id, eventId);
    assert.equal(res.status, 500);
    assert.equal((await findOrder(id))!.status, 'pending');
    const { rowCount } = await pool.query('SELECT 1 FROM processed_events WHERE id = $1', [
      eventId,
    ]);
    assert.equal(rowCount, 0);
    assert.deepEqual(await outbox(), []);
  } finally {
    await pool.query('DROP TRIGGER prevent ON outbox_events; DROP FUNCTION prevent()');
  }
  const retry = await pay(id, eventId);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { received: eventId, repeated: false });
  assert.equal((await findOrder(id))!.status, 'paid');
  assert.equal((await outbox()).length, 1);
});

test('relay enqueues the events and marks them as sent', { skip: noRedis }, async () => {
  const notificationId = await saveNotification('https://93.184.215.14/notifications');
  const id = await newOrder();
  assert.equal((await pay(id)).status, 200);

  // One at a time: the limit rules.
  assert.equal(await relay(1, toTestQueue), 1);
  assert.equal(await queue.count(), 1);
  assert.equal(await relay(50, toTestQueue), 1);
  assert.equal(await relay(50, toTestQueue), 0);

  for (const row of await outbox()) assert.ok(row.sent_at instanceof Date);
  const jobs = await queue.getJobs(['waiting']);
  assert.equal(jobs.length, 2);
  const email = jobs.find((j) => j.data.type === 'confirmation-email')!;
  const notice = jobs.find((j) => j.data.type === 'payment-notice')!;
  // Each job with its id: the email, by the order; the notification, by the payment and the URL.
  assert.equal(email.id, `email-${id}`);
  assert.ok(notice.data.type === 'payment-notice');
  assert.equal(notice.id, `notice-${notice.data.eventId}-${notificationId}`);
  assert.equal(email.opts.attempts, 5);
});

test("if Redis doesn't answer or fails, relay marks nothing", async () => {
  const id = await newOrder();
  assert.equal((await pay(id)).status, 200);

  // Redis fails: the transaction is undone, and the event stays unsent.
  await assert.rejects(
    relay(50, async () => {
      throw new Error('Redis is down');
    }),
    /Redis is down/,
  );
  assert.equal((await outbox())[0]!.sent_at, null);

  // Redis doesn't answer: relay doesn't wait longer than QUEUE_WAIT.
  const startedAt = performance.now();
  await assert.rejects(
    relay(50, () => new Promise(() => {})),
    /doesn't answer/,
  );
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed >= QUEUE_WAIT - 50 && elapsed < QUEUE_WAIT + 1000, `${elapsed} ms`);
  assert.equal((await outbox())[0]!.sent_at, null);

  // The row hasn't stayed locked: the next round takes it.
  const written: Job[] = [];
  assert.equal(await relay(50, async (job) => void written.push(job)), 1);
  assert.equal(written.length, 1);
  assert.ok((await outbox())[0]!.sent_at instanceof Date);
});

test('with a slow Redis, each round marks what has arrived and the next one goes on', async () => {
  // 50 events, and a queue that takes 100 ms for each one: they don't all fit in QUEUE_WAIT (2 s).
  const base = (await findOrder(21))!;
  await db.transaction(async (tx) => {
    for (let i = 1; i <= 50; i++) {
      await saveOutbox(tx, { type: 'confirmation-email', order: { ...base, id: 1000 + i } });
    }
  });
  const inQueue = new Set<number>();
  const slow = async (job: Job) => {
    await sleep(100);
    inQueue.add(job.order.id);
  };
  const sentOnes = async () =>
    (await outbox()).filter((row) => row.sent_at !== null).map((row) => row.data.order.id);

  let rounds = 0;
  let before = 0;
  while (before < 50) {
    assert.ok(++rounds <= 5, `${before} of 50 after ${rounds - 1} rounds`);
    const relayed = await relay(50, slow);
    const now = (await sentOnes()).length;
    // Each round moves forward, and marks exactly what reached the queue in that round.
    assert.ok(relayed > 0, `round ${rounds} marked none`);
    assert.equal(now, before + relayed);
    // What hasn't reached the queue is never marked as sent.
    for (const id of await sentOnes())
      assert.ok(inQueue.has(id), `${id} marked without being in the queue`);
    before = now;
  }
  assert.ok(rounds >= 2, 'with 100 ms per event, 50 do not fit in one round');
});

test("two relayers don't take the same event", async () => {
  for (const orderId of [21, 22, 23, 24, 25, 1]) {
    const email = await emailFor(orderId);
    await db.transaction((tx) => saveOutbox(tx, email));
  }
  // The first takes three and waits (Redis is slow) with them locked.
  let release = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  let started = () => {};
  const hasStarted = new Promise<void>((resolve) => (started = resolve));
  const firstOnes: number[] = [];
  const first = relay(3, async (job) => {
    firstOnes.push(job.order.id);
    started();
    await released;
  });
  await hasStarted;

  // The second, at the same time: it skips the three locked ones (SKIP LOCKED) and takes the others.
  const secondOnes: number[] = [];
  assert.equal(await relay(50, async (job) => void secondOnes.push(job.order.id)), 3);
  // And a third finds nothing free.
  assert.equal(await relay(50, async () => assert.fail('none is left')), 0);

  release();
  assert.equal(await first, 3);
  assert.equal(firstOnes.length, 3);
  assert.deepEqual(
    [...firstOnes, ...secondOnes].sort((a, b) => a - b),
    [1, 21, 22, 23, 24, 25],
  );
  assert.ok((await outbox()).every((row) => row.sent_at !== null));
});

test("the relayer doesn't overlap with itself and stops when told to", async () => {
  await db.transaction(async (tx) => saveOutbox(tx, await emailFor(21)));
  // Each round takes 150 ms and fails (the event stays unsent), and another starts every 20 ms.
  let atOnce = 0;
  let most = 0;
  let rounds = 0;
  const relayer = relayEverySecond(async () => {
    atOnce++;
    rounds++;
    most = Math.max(most, atOnce);
    await sleep(150);
    atOnce--;
    throw new Error('Redis is down');
  }, 20);
  await waitFor(() => rounds >= 3, 5000, 'three rounds');
  await relayer.stop();
  // stop() waits for the round that is halfway, and then starts none.
  assert.equal(atOnce, 0);
  const done = rounds;
  await sleep(200);
  assert.equal(rounds, done);
  assert.equal(most, 1);
  assert.equal((await outbox())[0]!.sent_at, null);
});

test(
  'if the API goes down after paying, the email arrives all the same',
  { skip: noRedis },
  async () => {
    const id = await newOrder();
    // The real API, with Redis: it pays and, as soon as it answers, it's killed (SIGKILL: without
    // shutting down properly). Before (steps 37 to 40), whatever hadn't reached the queue was lost here.
    const port = await freePort();
    const api = start('src/server.ts', { PORT: String(port), REDIS_URL: url! });
    try {
      await waitFor(() => api.output().includes('The shop is listening'), 10_000, 'the API starts');
      const res = await pay(id, undefined, `http://127.0.0.1:${port}`);
      assert.equal(res.status, 200);
      api.child.kill('SIGKILL');
      await once(api.child, 'exit');
    } finally {
      await stop(api.child);
    }
    // The API has put nothing in the queue: the email is in outbox_events, unsent.
    assert.equal(await queue.count(), 0);
    assert.equal((await outbox())[0]!.sent_at, null);

    // The worker relays it when it starts, and does the job (without SMTP_URL, the log says so).
    const worker = start('scripts/worker.ts', { REDIS_URL: url! });
    try {
      await waitFor(
        async () => (await queue.getJob(`email-${id}`))?.finishedOn !== undefined,
        10_000,
        'the email, done',
      );
      assert.equal(await (await queue.getJob(`email-${id}`))!.getState(), 'completed');
      assert.ok((await outbox())[0]!.sent_at instanceof Date);
      assert.match(worker.output(), new RegExp(`"orderId":${id}[,}].*no SMTP_URL`));
      // And it shuts down properly: the relayer stops, like the worker.
      worker.child.kill('SIGTERM');
      const [code] = await once(worker.child, 'exit');
      assert.equal(code, 0, worker.output());
    } finally {
      await stop(worker.child);
    }
  },
);

test('an event relayed twice does not send two emails', { skip: noRedis }, async () => {
  await saveNotification('https://93.184.215.14/notifications');
  const id = await newOrder();
  assert.equal((await pay(id)).status, 200);

  // The relayer puts both jobs in the queue and goes down before the COMMIT: the events stay
  // unsent, and the next round enqueues them again.
  let turn = 0;
  await assert.rejects(
    relay(50, async (job) => {
      await toTestQueue(job);
      if (++turn === 2) throw new Error('the relayer goes down');
    }),
    /goes down/,
  );
  assert.equal(await queue.count(), 2);
  assert.equal(await relay(50, toTestQueue), 2);
  // The same job id: BullMQ doesn't write down the second one.
  assert.equal(await queue.count(), 2);

  // And even if the job is already done: BullMQ keeps the last 1000 done, and with them their id.
  const worker = createWorker({ url });
  try {
    await waitFor(
      async () => (await queue.getJob(`email-${id}`))?.finishedOn !== undefined,
      10_000,
      'the email, done',
    );
  } finally {
    await worker.close();
  }
  await pool.query('UPDATE outbox_events SET sent_at = NULL');
  assert.equal(await relay(50, toTestQueue), 2);
  const emails = (
    await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'])
  ).filter((j) => j.data.type === 'confirmation-email');
  assert.equal(emails.length, 1);
  assert.equal(await emails[0]!.getState(), 'completed');
  assert.equal(emails[0]!.attemptsMade, 1);
});

test('a repeated notification arrives with the same X-Event-Id', { skip: noRedis }, async () => {
  // The delivery company, pretend, on 127.0.0.1: it writes down what it receives and answers 204.
  const received: IncomingMessage['headers'][] = [];
  const server = createServer((request, response) => {
    received.push(request.headers);
    request.resume();
    response.writeHead(204).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  await saveNotification(`http://127.0.0.1:${port}/notifications`);
  const id = await newOrder();
  assert.equal((await pay(id)).status, 200);
  const [notice] = (await outbox()).filter((row) => row.type === 'payment-notice');
  assert.ok(notice?.data.type === 'payment-notice');

  const worker = createWorker({ url, options: { devHosts: ['127.0.0.1'] } });
  try {
    assert.equal(await relay(50, toTestQueue), 2);
    await waitFor(() => received.length === 1, 10_000, 'the notification arrives');
    // BullMQ no longer remembers the job (the last 1000 done are gone, say), and the event is
    // relayed again: the company receives the notification twice, with the same X-Event-Id, and
    // by it knows it is the same one.
    const done = (await queue.getJobs(['completed'])).find(
      (j) => j.data.type === 'payment-notice',
    )!;
    await waitFor(async () => (await done.getState()) === 'completed', 5000, 'done');
    await done.remove();
    await pool.query('UPDATE outbox_events SET sent_at = NULL WHERE id = $1', [notice.id]);
    assert.equal(await relay(50, toTestQueue), 1);
    await waitFor(() => received.length === 2, 10_000, 'the repeated notification arrives');
    assert.equal(received[0]!['x-event-id'], notice.data.eventId);
    assert.equal(received[1]!['x-event-id'], notice.data.eventId);
  } finally {
    await worker.close();
    server.closeAllConnections();
    server.close();
  }
});
