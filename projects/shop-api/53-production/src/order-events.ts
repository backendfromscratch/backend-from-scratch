// The notices of the changes in the orders, for the route that follows them live (SSE, v2.ts).
// Up to lesson 2 of Phase 9 they were an EventEmitter: a notice in this process's memory. With two
// copies of the API (docker compose up --scale api=2, Phase 9, lesson 3), each one has its own
// memory: if Ana follows her order on one copy and cancels it through the other, the notice stays
// in the other, and she never gets it. It was the only thing in the shop that lived in a single
// process: the sessions are in PostgreSQL (Phase 6) and the attempt limits, in Redis (Phase 7).
// With REDIS_URL, the notices go through Redis, with publish/subscribe (pub/sub): each copy
// subscribes to a channel, and what one publishes on it reaches all the ones that listen. Without
// REDIS_URL (a single API, without Docker), it is still an EventEmitter: with one process, that is
// enough.
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from 'redis';
import { z } from 'zod';
import { config } from './config.ts';
import type { Order } from './data.ts';
import { log } from './log.ts';

export interface OrderChanges {
  /** Announces that the order has changed. It waits for nothing and never throws. */
  emit(order: Order): void;
  /**
   * Calls fn with each order that changes. onLost, if given, when changes may have been lost (Redis
   * came back after a cut): whoever follows an order has to read its status again.
   * Returns the function that stops listening.
   */
  listen(fn: (order: Order) => void, onLost?: () => void): () => void;
  /** How many are listening now in this process: one open connection, one. */
  listeners(): number;
  // Opens the connections, if they aren't open, and resolves when it can publish and Redis has
  // confirmed the subscription to the channel; without Redis, right away. For the tests: what is
  // published before that doesn't reach this copy.
  ready(): Promise<void>;
  close(): Promise<void>;
}

// #region order-shape
// What a message from the channel must have to be an order: the same fields as Order (data.ts),
// with their types. Here, and not with the API's schemas (schemas.ts), which load data.ts, which
// loads this file.
const orderSchema = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  quantity: z.number().int(),
  status: z.enum(['pending', 'paid', 'shipped', 'cancelled']),
  createdAt: z.string(),
  customerId: z.number().int().nullable(),
}) satisfies z.ZodType<Order>;
// #endregion order-shape

/** The notices, through the channel of that Redis (redis://server:6379), or in memory, without an address. */
export function createOrderChanges(url: string | undefined, channel: string): OrderChanges {
  // Those who listen in this process, always in an EventEmitter: each connection that follows an
  // order. No limit on listeners: each open connection is one, and there can be many.
  const local = new EventEmitter<{ change: [Order]; lost: [] }>();
  local.setMaxListeners(0);
  const subscribe = (fn: (order: Order) => void, onLost?: () => void) => {
    local.on('change', fn);
    if (onLost) local.on('lost', onLost);
    return () => {
      local.off('change', fn);
      if (onLost) local.off('lost', onLost);
    };
  };
  const listeners = () => local.listenerCount('change');

  if (!url) {
    return {
      emit: (order) => void local.emit('change', order),
      listen: subscribe,
      listeners,
      ready: async () => {},
      close: async () => {},
    };
  }

  // #region two-connections
  // Two connections to Redis. A connection subscribed to a channel is only good for receiving: while
  // it listens, no other commands can be sent to it. So one publishes and the other, its own
  // (duplicate(): another connection, with the same options), listens.
  //   disableOfflineQueue: without a connection, publishing fails at once, without keeping the
  //     notice in a queue for when it comes back. An old notice that arrives late can arrive after a
  //     newer one from another copy (paid after cancelled), and would show as current a status that
  //     no longer is. What is lost this way doesn't recover by itself: when Redis comes back, the
  //     route closes the open streams (lost, further down), and whoever follows the order connects
  //     again and reads its status.
  //   The one that listens does keep its command, SUBSCRIBE, until there is a connection: it is the
  //     only one it sends. After that, each time the client reconnects, it subscribes again on its own.
  // Creating a client opens no connection: connect() does (open, further down).
  const publisher = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000 },
  });
  const subscriber = publisher.duplicate({ disableOfflineQueue: false });
  // #endregion two-connections

  // #region outage
  // If the connection is cut, the client says so with an 'error' on every attempt to reconnect,
  // several times a second: to the log, once. When it comes back (both connections ready), to the
  // log again, and to whoever listens on this copy, with lost: what was published in the meantime
  // hasn't reached it, and there is no way to know what it was. Without anyone listening to
  // 'error', Node would stop the API.
  // This copy only learns of its own outages. If another copy's connection is cut, what that one
  // publishes is lost without this one knowing; with Redis down, which is the usual case, all of
  // them are cut.
  let warned = false;
  for (const client of [publisher, subscriber]) {
    client.on('error', (error: Error) => {
      if (warned) return;
      warned = true;
      log.warn(
        { reason: error.message },
        'Redis is not answering: the order notices cannot go through Redis, and whoever follows an order gets no changes',
      );
    });
    client.on('ready', () => {
      if (!warned || !publisher.isReady || !subscriber.isReady) return;
      warned = false;
      log.info('Redis is answering again: the order notices go through Redis again');
      local.emit('lost');
    });
  }
  // #endregion outage

  // #region listen-channel
  // Each message on the channel should be an order in JSON. All its fields are text, numbers or
  // null (the date goes as text, createdAt), so JSON.parse leaves it exactly as it was. But the
  // channel isn't only the shop's: anyone with access to that Redis can publish on it. What isn't an
  // order (text, null, an object with other fields) is ignored: whoever listens only gets orders,
  // and the route can read order.id without fear. To the log, without making noise (debug).
  function receive(message: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = undefined;
    }
    const order = orderSchema.safeParse(parsed);
    if (!order.success) {
      log.debug(
        { channel, message: message.slice(0, 100) },
        'a notice on the channel that is not an order',
      );
      return;
    }
    local.emit('change', order.data);
  }
  // #endregion listen-channel

  // #region open
  // The connections are opened the first time they are needed (emit, listen or ready), not when this
  // file is loaded, like the queue's (queue.ts). A script that loads data.ts without notifying
  // anyone (create-admin) opens none, and ends as soon as it is done: with an open connection, Node
  // would never end. The API opens them with the first change or with the first connection that
  // follows an order.
  let opened: Promise<void> | undefined;
  let closed = false;
  // It resolves the first time the publisher is ready, and then everConnected becomes true. Until
  // then, a notice waits for it (emit, further down); afterwards, never.
  let firstConnection: Promise<void> = Promise.resolve();
  let everConnected = false;
  function open(): Promise<void> {
    if (!opened) {
      // Just once, even if there have been failed attempts before: it waits for the first connection.
      firstConnection = new Promise<void>((resolve) =>
        publisher.once('ready', () => {
          everConnected = true;
          resolve();
        }),
      );
      for (const client of [publisher, subscriber]) client.connect().catch(() => {});
      const subscribed = subscriber.subscribe(channel, receive);
      opened = Promise.all([subscribed, firstConnection]).then(() => {
        log.info({ channel }, 'the API listens to the channel of the order notices');
      });
      // If the subscription fails for good (Redis rejects it, for example because of its
      // permissions), this copy will get no notices: to the log. On closing, no: it is expected. And
      // without this catch, a failure with nobody waiting for ready would stop Node.
      opened.catch((error: Error) => {
        if (closed) return;
        log.warn(
          { channel, reason: error.message },
          'cannot listen to the channel of the order notices: whoever follows an order on this copy will get no changes',
        );
      });
    }
    return opened;
  }
  // #endregion open

  return {
    // #region emit
    // The copy that makes the change doesn't notify its own listeners directly: it publishes it to
    // Redis and hears about it through Redis, like all the others. That way there is a single path,
    // and nobody receives it twice (if it notified its own and also received it from Redis, whoever
    // follows the order on this copy would get it repeated). It costs a trip to Redis, under a
    // millisecond.
    // Without waiting: the response to the request that changed the order needn't wait for Redis,
    // and a hung Redis (it receives the command and doesn't answer) would leave it waiting forever:
    // node-redis's time limit doesn't count after the command is sent (cache.ts). If it fails, to the
    // log, without throwing: the change is already saved in PostgreSQL.
    // Only the first time, while the connection is being opened, does the notice wait for it to be
    // ready, one second at most, the same connectTimeout; otherwise, it is lost. After that, it never
    // waits: with the connection cut, publishing fails at once (two-connections), and the notice is
    // lost now instead of going out late, when it comes back, maybe after a newer one from another
    // copy.
    emit(order) {
      void open();
      const publish = () =>
        publisher
          .publish(channel, JSON.stringify(order))
          .catch((error: Error) =>
            log.debug({ order: order.id, reason: error.message }, 'order notice lost'),
          );
      if (everConnected) {
        void publish();
        return;
      }
      // A race between the first connection and a one-second clock: whichever comes first.
      const late = sleep(1000).then(() =>
        Promise.reject(new Error('Redis does not answer in 1 s')),
      );
      Promise.race([firstConnection, late]).then(publish, (error: Error) =>
        log.debug({ order: order.id, reason: error.message }, 'order notice lost'),
      );
    },
    // #endregion emit
    listen(fn, onLost) {
      void open();
      return subscribe(fn, onLost);
    },
    listeners,
    ready: open,
    // Closes both connections without waiting for what is on its way: they are notices, not data,
    // and with a hung Redis it would never arrive. If they were never opened, there is nothing to close.
    async close() {
      closed = true;
      if (!opened) return;
      publisher.destroy();
      subscriber.destroy();
    },
  };
}

// The shop's notices: through the ORDERS_CHANNEL channel in the Redis of REDIS_URL, or in memory.
export const orderChanges = createOrderChanges(config.REDIS_URL, config.ORDERS_CHANNEL);
