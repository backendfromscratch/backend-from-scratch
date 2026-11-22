// Shutting down without cutting anyone off (Phase 9, lesson 4). To deploy without downtime,
// deploy.sh changes the copies of the API one at a time, and Docker sends SIGTERM to the one that
// leaves. What it does then, in this order:
//   1. It stops accepting new connections. nginx, when it tries the next one on this copy, can't
//      connect, and moves it to the other copy: a refused connection is a request that never
//      arrived, and nginx repeats it on the other copy, even if it's a POST. As long as Docker
//      doesn't pass the ports through docker-proxy (its "userland proxy", on unless changed; the
//      README says how to turn it off): with it, the port keeps accepting connections until the
//      process exits, and cuts them, and nginx doesn't repeat a POST it already sent (502).
//   2. It finishes the requests it has half done: the ones a hard stop would cut (the 502s of
//      Phase 8, lesson 6).
//   3. It closes the connections that never end: the order event streams and the WebSockets. Their
//      clients connect again on their own, and reach the other copy.
//   4. When no connection is left, it closes the database and Redis.
// All of it, at most in limitMs: docker stop waits 10 seconds and then kills the process.
import { setMaxListeners } from 'node:events';
import type { Server } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { log } from './log.ts';

// #region notice
const controller = new AbortController();
// Every event stream and every open WebSocket listens to this signal, and there can be many:
// without this, Node would warn of a possible leak from 10 on.
setMaxListeners(0, controller.signal);

/** It fires when shutting down begins. The order events route and /echo listen to it. */
export const onShutdown: AbortSignal = controller.signal;

/** Is it shutting down? From that moment, /health answers 503. */
export function shuttingDown(): boolean {
  return onShutdown.aborted;
}
// #endregion notice

/** Something to close at the end: PostgreSQL's pool, a connection to Redis... */
export interface Resource {
  close(): Promise<void>;
}

// #region shut-down
export async function shutDown(
  server: Server,
  resources: Resource[],
  limitMs: number,
): Promise<void> {
  const until = Date.now() + limitMs;
  controller.abort();

  // 1 and 2. close() stops accepting connections, and calls its function when the last one closed.
  const closed = new Promise<boolean>((resolve) => server.close(() => resolve(true)));
  // A keep-alive connection (HTTP/1.1 leaves it open for the next request) doesn't close by
  // itself. close() closes the ones waiting idle, but not the ones with a request half done: when
  // it ends, they stay waiting for another. So whatever still arrives through them is answered
  // with Connection: close (the client doesn't use the connection again), and every 100 ms the ones
  // left free are closed. prependListener: before the shop, which is the one that writes the
  // response; afterwards, the headers might already have gone out.
  server.prependListener('request', (_request, response) =>
    response.setHeader('Connection', 'close'),
  );
  const idle = setInterval(() => server.closeIdleConnections(), 100);
  const onTime = await Promise.race([closed, sleep(limitMs, false, { ref: false })]);
  clearInterval(idle);
  if (!onTime) {
    // What didn't finish in time is cut: better that than docker stop's SIGKILL.
    log.warn(`after ${limitMs} ms, requests are still half done: they are cut`);
    server.closeAllConnections();
  }

  // 4. One after another, without going over the limit: one that doesn't answer (a hung Redis)
  // doesn't hold back the others. If one fails, it goes to the log, and the next one follows.
  for (const resource of resources) {
    const left = Math.max(until - Date.now(), 0);
    try {
      await Promise.race([resource.close(), sleep(left, undefined, { ref: false })]);
    } catch (error) {
      log.warn(
        { reason: (error as Error).message },
        'something did not close properly on shutdown',
      );
    }
  }
}
// #endregion shut-down
