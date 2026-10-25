// Several copies of the API (Phase 9, lesson 3). Each copy is a process with its own memory: what
// one keeps, the other doesn't see. The only thing in the shop that lived in a process's memory was
// the notices of the changes in the orders (order-events.ts), and with REDIS_URL they go through
// Redis. The tests that need Redis use the one in REDIS_URL_TESTS (test/.env): without that
// variable, they are skipped.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import {
  type AddressInfo,
  connect as connectTcp,
  createServer as createTcpServer,
  type Socket,
} from 'node:net';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Order, OrderStatus } from '../src/data.ts';
import { type OrderChanges, createOrderChanges } from '../src/order-events.ts';
import { connectRedis } from '../src/redis-store.ts';
import { useDb } from './db.ts';
import { ANA, asUser } from './identities.ts';

let ana: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
});

const url = process.env.REDIS_URL_TESTS;
const withoutRedis = url
  ? false
  : 'without Redis: set REDIS_URL_TESTS in test/.env (redis://localhost:6379/1) to try it';

// A channel for this run of the tests, not shop:orders. Redis channels don't belong to a database
// (the /1 in the URL): they belong to the whole server. That way, tests run at the same time in
// another folder, against the same Redis, don't send their notices to these.
const channel = `shop:orders:tests:${randomUUID()}`;

const anOrder = (status: OrderStatus, id = 7): Order => ({
  id,
  productId: 1,
  quantity: 2,
  status,
  createdAt: '2026-10-21T09:00:00.000Z',
  customerId: 3,
});

/** Subscribes to the changes and collects the ones that arrive. */
function subscribeTo(changes: OrderChanges) {
  const received: Order[] = [];
  const stop = changes.listen((order) => received.push(order));
  return { received, stop };
}

/** Waits until the condition holds, or fails after the time. */
async function waitFor(condition: () => boolean, ms: number, what: string) {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) assert.fail(`after ${ms} ms, still not: ${what}`);
    await sleep(20);
  }
}

/** Two copies of the API, each with its own connection to Redis, like two processes. */
async function twoCopies(urlOfEach: [string, string] = [url!, url!]) {
  const copies = urlOfEach.map((u) => createOrderChanges(u, channel));
  await Promise.all(copies.map((copy) => copy.ready()));
  return {
    a: copies[0]!,
    b: copies[1]!,
    close: () => Promise.all(copies.map((copy) => copy.close())),
  };
}

// #region in-memory
test('without REDIS_URL, the changes arrive in the same process', async () => {
  const changes = createOrderChanges(undefined, channel);
  const { received } = subscribeTo(changes);
  changes.emit(anOrder('paid'));
  // Right away, without waiting for anything: it is an EventEmitter, as up to lesson 2.
  assert.deepEqual(received, [anOrder('paid')]);
  assert.equal(changes.listeners(), 1);
  await changes.close();
});
// #endregion in-memory

// #region from-one-copy-to-another
test(
  'with REDIS_URL, a change emitted on one copy reaches another',
  { skip: withoutRedis },
  async () => {
    const { a, b, close } = await twoCopies();
    try {
      const inB = subscribeTo(b);
      a.emit(anOrder('cancelled'));
      await waitFor(() => inB.received.length === 1, 2000, 'the change reaches the other copy');
      // The same order, with the same shape: it travels as JSON, and all its fields are text or numbers.
      assert.deepEqual(inB.received, [anOrder('cancelled')]);
    } finally {
      await close();
    }
  },
);
// #endregion from-one-copy-to-another

test('stopping listening receives no more changes', async (t) => {
  for (const [mode, urlOfTheMode] of [
    ['in memory', undefined],
    ['with Redis', url],
  ] as const) {
    await t.test(mode, { skip: mode === 'with Redis' && withoutRedis }, async () => {
      const changes = createOrderChanges(urlOfTheMode, channel);
      await changes.ready();
      try {
        const follows = subscribeTo(changes);
        const leaves = subscribeTo(changes);
        assert.equal(changes.listeners(), 2);
        leaves.stop();
        assert.equal(changes.listeners(), 1);
        changes.emit(anOrder('paid'));
        // When it reaches the one that follows, it would already have reached the other.
        await waitFor(() => follows.received.length === 1, 2000, 'the change reaches the follower');
        assert.deepEqual(leaves.received, []);
      } finally {
        await changes.close();
      }
    });
  }
});

// #region only-once
test('the copy that makes the change receives it just once', { skip: withoutRedis }, async () => {
  const { a, b, close } = await twoCopies();
  try {
    const inA = subscribeTo(a);
    const inB = subscribeTo(b);
    a.emit(anOrder('paid'));
    a.emit(anOrder('cancelled'));
    await waitFor(() => inA.received.length >= 2 && inB.received.length >= 2, 2000, 'they arrive');
    // A while longer, in case it arrived repeated.
    await sleep(200);
    // Through Redis, like the others: once each, and in the order they were emitted.
    assert.deepEqual(inA.received, [anOrder('paid'), anOrder('cancelled')]);
    assert.deepEqual(inB.received, inA.received);
  } finally {
    await close();
  }
});
// #endregion only-once

// #region not-an-order
test(
  'a message on the channel that is not an order is ignored',
  { skip: withoutRedis },
  async () => {
    const { a, b, close } = await twoCopies();
    const other = connectRedis(url!);
    try {
      const inB = subscribeTo(b);
      // Like the events route (v2.ts): an async function that reads the id. If null reached it, the
      // error of reading null.id, with nobody to catch it, would stop Node.
      const ids: number[] = [];
      b.listen(async (order) => {
        ids.push(order.id);
      });
      // Anyone with access to that Redis can publish on the channel: text, JSON that isn't an object,
      // an empty object, or one with an id but without the rest.
      for (const message of ['this is not JSON', 'null', '{}', '{"id":7,"status":5}']) {
        await other.publish(channel, message);
      }
      a.emit(anOrder('paid'));
      await waitFor(() => inB.received.length === 1, 2000, 'the order arrives');
      assert.deepEqual(inB.received, [anOrder('paid')]);
      assert.deepEqual(ids, [7]);
    } finally {
      await other.close();
      await close();
    }
  },
);
// #endregion not-an-order

/**
 * A go-between for the client and the tests' Redis, to cut the network for a while: cut() closes
 * the connections and stops accepting others; reopen() accepts them again, on the same port.
 */
async function redisWithCut(target: string) {
  const { hostname, port, pathname } = new URL(target);
  const connections = new Set<Socket>();
  let listeningPort = 0;
  const openServer = () =>
    createTcpServer((incoming) => {
      const outgoing = connectTcp(Number(port || 6379), hostname);
      for (const connection of [incoming, outgoing]) {
        connections.add(connection);
        connection.on('error', () => {});
        connection.on('close', () => {
          incoming.destroy();
          outgoing.destroy();
        });
      }
      incoming.pipe(outgoing).pipe(incoming);
    }).listen(listeningPort, '127.0.0.1');
  let server = openServer();
  await once(server, 'listening');
  listeningPort = (server.address() as AddressInfo).port;
  return {
    url: `redis://127.0.0.1:${listeningPort}${pathname}`,
    cut() {
      server.close();
      for (const connection of connections) connection.destroy();
      connections.clear();
    },
    async reopen() {
      server = openServer();
      await once(server, 'listening');
    },
  };
}

// #region cut
test('after a cut with Redis, the copy receives again', { skip: withoutRedis }, async () => {
  const network = await redisWithCut(url!);
  // b listens through the go-between; a publishes directly.
  const { a, b, close } = await twoCopies([url!, network.url]);
  try {
    const inB = subscribeTo(b);
    // What happens while it is cut doesn't reach it: on coming back, it tells whoever listens that
    // changes may have been lost.
    let lostNotices = 0;
    b.listen(
      () => {},
      () => lostNotices++,
    );
    a.emit(anOrder('paid'));
    await waitFor(() => inB.received.length === 1, 2000, 'before the cut');
    network.cut();
    await sleep(200);
    await network.reopen();
    // The client connects again on its own, and subscribes to the channel again on its own. Until it
    // does, what is published doesn't reach it (Redis doesn't keep a channel's messages): it is
    // repeated until one arrives.
    await waitFor(
      () => {
        a.emit(anOrder('cancelled'));
        return inB.received.length > 1;
      },
      5000,
      'after the cut',
    );
    assert.deepEqual(inB.received.at(-1), anOrder('cancelled'));
    await waitFor(() => lostNotices === 1, 2000, 'the notice of lost changes');
  } finally {
    await close();
    network.cut();
  }
});
// #endregion cut

// #region cut-publish
test(
  'with the connection cut, emit fails at once: nothing goes out late',
  { skip: withoutRedis },
  async () => {
    const network = await redisWithCut(url!);
    // a publishes through the go-between; b listens directly.
    const { a, b, close } = await twoCopies([network.url, url!]);
    const warnings: string[] = [];
    const onWarning = (warning: Error) => warnings.push(warning.name);
    process.on('warning', onWarning);
    try {
      const inB = subscribeTo(b);
      a.emit(anOrder('pending', 8));
      await waitFor(() => inB.received.length === 1, 2000, 'before the cut');
      // a's connection is cut, and while it is cut, a announces a change twenty times. If those
      // notices waited for the connection to come back, they would go out late, maybe after a newer
      // one from another copy, and each one would leave two listeners waiting in the client.
      network.cut();
      await sleep(100);
      for (let i = 0; i < 20; i++) a.emit(anOrder('paid', 8));
      await network.reopen();
      // The connection is back: what is announced now does arrive (repeated until one arrives).
      await waitFor(
        () => {
          a.emit(anOrder('cancelled', 9));
          return inB.received.some((order) => order.id === 9);
        },
        5000,
        'after the cut',
      );
      await sleep(200);
      // None of the twenty went out, neither before nor after coming back.
      assert.deepEqual(
        inB.received.filter((order) => order.id === 8),
        [anOrder('pending', 8)],
      );
      assert.deepEqual(warnings, []);
    } finally {
      process.off('warning', onWarning);
      await close();
      network.cut();
    }
  },
);
// #endregion cut-publish

/** A free port on 127.0.0.1: nobody is listening on it. */
async function freePort(): Promise<number> {
  const free = createTcpServer().listen(0, '127.0.0.1');
  await once(free, 'listening');
  const port = (free.address() as AddressInfo).port;
  free.close();
  await once(free, 'close');
  return port;
}

/**
 * Starts a copy of the API on a free port, with the tests' environment plus the one given (without
 * REDIS_URL, SMTP_URL or CACHE_URL unless they are set), and collects what it writes to the log.
 * waitForText: the log text that says it is ready.
 */
async function startApi(
  environment: Record<string, string>,
  waitForText = 'The shop is listening',
) {
  const port = await freePort();
  const { REDIS_URL: _r, SMTP_URL: _s, CACHE_URL: _c, ...base } = process.env;
  const child: ChildProcessWithoutNullStreams = spawn('node', ['src/server.ts'], {
    env: {
      ...base,
      LOG_LEVEL: 'info',
      PORT: String(port),
      ORDERS_CHANNEL: channel,
      ...environment,
    },
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  try {
    await waitFor(() => output.includes(waitForText), 10_000, `the API starts (${waitForText})`);
  } catch (error) {
    child.kill();
    throw error;
  }
  return { process: child, output: () => output, url: `http://127.0.0.1:${port}` };
}

async function stop(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) return;
  child.kill();
  await once(child, 'exit');
}

type Reader = ReadableStreamDefaultReader<string>;

/** Opens an order's event stream on that copy. */
async function follow(api: string, id: number): Promise<Reader> {
  const res = await fetch(`${api}/v2/orders/${id}/events`, { headers: ana });
  assert.equal(res.status, 200);
  return res.body!.pipeThrough(new TextDecoderStream()).getReader();
}

/** The next event in the stream (up to a blank line), or fails if it doesn't arrive in time. */
async function nextEvent(reader: Reader, ms = 3000): Promise<Order> {
  let text = '';
  const until = Date.now() + ms;
  while (!text.includes('\n\n')) {
    const read = await Promise.race([reader.read(), sleep(until - Date.now(), 'late' as const)]);
    if (read === 'late') assert.fail(`after ${ms} ms, no event arrives`);
    if (read.done) throw new Error('The stream has closed');
    text += read.value;
  }
  return JSON.parse(text.match(/^data: (.*)$/m)![1]!) as Order;
}

const cancel = (api: string, id: number) =>
  // With a limit: if the response waited for a hung Redis, the test fails instead of staying
  // waiting.
  fetch(`${api}/v2/orders/${id}/cancellation`, {
    method: 'POST',
    headers: ana,
    signal: AbortSignal.timeout(3000),
  });

// #region stream-other-copy
test(
  'the event stream receives a change made by another copy',
  { skip: withoutRedis },
  async () => {
    // Two copies of the API, two processes, with the same Redis: like docker compose up --scale api=2.
    const [a, b] = await Promise.all([
      startApi({ REDIS_URL: url! }),
      startApi({ REDIS_URL: url! }),
    ]);
    try {
      // Ana follows order 22 on copy a, and cancels it through copy b. Copy a subscribes to the
      // channel with the first one that listens, and says so in the log.
      const reader = await follow(a.url, 22);
      assert.equal((await nextEvent(reader)).status, 'pending');
      await waitFor(() => a.output().includes('listens to the channel'), 2000, 'copy a listens');
      assert.equal((await cancel(b.url, 22)).status, 200);
      const change = await nextEvent(reader);
      assert.equal(change.id, 22);
      assert.equal(change.status, 'cancelled');
      await reader.cancel();

      // And a change made on the same copy arrives once, not twice.
      const same = await follow(a.url, 21);
      await nextEvent(same);
      assert.equal((await cancel(a.url, 21)).status, 200);
      assert.equal((await nextEvent(same)).status, 'cancelled');
      await assert.rejects(nextEvent(same, 300), /no event arrives/);
      await same.cancel();
    } finally {
      await Promise.all([stop(a.process), stop(b.process)]);
    }
  },
);
// #endregion stream-other-copy

// #region stream-closes
test(
  'if Redis is cut and comes back, the event stream closes so the client connects again',
  { skip: withoutRedis },
  async () => {
    const network = await redisWithCut(url!);
    const api = await startApi({ REDIS_URL: network.url });
    try {
      const reader = await follow(api.url, 20);
      assert.equal((await nextEvent(reader)).status, 'paid');
      await waitFor(() => api.output().includes('listens to the channel'), 2000, 'the API listens');
      // While it is cut, the changes don't arrive. On coming back, the API doesn't know what was
      // lost: it closes the response, and EventSource connects again on its own and gets the current
      // status.
      network.cut();
      await sleep(200);
      await network.reopen();
      await assert.rejects(nextEvent(reader, 5000), /The stream has closed/);
      assert.match(api.output(), /Redis is answering again/);
    } finally {
      await stop(api.process);
      network.cut();
    }
  },
);
// #endregion stream-closes

// #region redis-down
test('with Redis down, cancelling answers all the same, and the log says so once', async () => {
  // Nobody is listening on that port: Redis isn't there.
  const api = await startApi({ REDIS_URL: `redis://127.0.0.1:${await freePort()}` });
  try {
    for (const id of [23, 24]) {
      const since = performance.now();
      const res = await cancel(api.url, id);
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as Order).status, 'cancelled');
      assert.ok(performance.now() - since < 1000, `${performance.now() - since} ms`);
    }
    // The client tries again every so often, and fails each time: the warning comes out just once.
    await sleep(1000);
    const warnings = api.output().match(/order notices cannot go through Redis/g) ?? [];
    assert.equal(warnings.length, 1, api.output());
  } finally {
    await stop(api.process);
  }
});
// #endregion redis-down

/** The first complete RESP command in the text: its name and how many characters it takes. */
function readCommand(text: string): { name: string; length: number } | undefined {
  const header = /^\*(\d+)\r\n/.exec(text);
  if (!header) return undefined;
  let position = header[0].length;
  const parts: string[] = [];
  for (let i = 0; i < Number(header[1]); i++) {
    const size = /^\$(\d+)\r\n/.exec(text.slice(position));
    if (!size) return undefined;
    const from = position + size[0].length;
    const to = from + Number(size[1]);
    if (text.length < to + 2) return undefined;
    parts.push(text.slice(from, to));
    position = to + 2;
  }
  return { name: parts[0]!.toUpperCase(), length: position };
}

/**
 * A fake Redis that hangs halfway, like a stopped Redis (docker pause): it answers +OK to what the
 * client sends on connecting, and the first command of the notices (SUBSCRIBE or PUBLISH) it
 * receives and doesn't answer, nor anything else on that connection. To the client, the connection
 * is fine.
 */
async function hungRedis() {
  const connections = new Set<Socket>();
  const received: string[] = [];
  const server = createTcpServer((connection) => {
    connections.add(connection);
    let rest = '';
    let mute = false;
    connection.on('data', (chunk) => {
      rest += chunk.toString('latin1');
      for (;;) {
        const command = readCommand(rest);
        if (!command) break;
        rest = rest.slice(command.length);
        received.push(command.name);
        if (['SUBSCRIBE', 'PUBLISH'].includes(command.name)) mute = true;
        if (!mute) connection.write('+OK\r\n');
      }
    });
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `redis://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close() {
      for (const connection of connections) connection.destroy();
      server.close();
    },
  };
}

// #region redis-hung
test('with Redis hung, cancelling does not wait either', async () => {
  const hung = await hungRedis();
  const api = await startApi({ REDIS_URL: hung.url });
  try {
    const since = performance.now();
    const res = await cancel(api.url, 25);
    assert.equal(res.status, 200);
    assert.ok(performance.now() - since < 1000, `${performance.now() - since} ms`);
    // The notice went out towards Redis: it is Redis that doesn't answer, and the response doesn't wait for it.
    await waitFor(() => hung.received.includes('PUBLISH'), 2000, 'PUBLISH reaches Redis');
  } finally {
    await stop(api.process);
    hung.close();
  }
});
// #endregion redis-hung
