import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { app } from './app.ts';
import { cache } from './cache.ts';
import { config } from './config.ts';
import { pool } from './db.ts';
import { log } from './log.ts';
import { orderChanges } from './order-events.ts';
import { closeQueue } from './queue.ts';
import { closeLimits } from './rate-limits.ts';
import { shutDown, shuttingDown } from './shutdown.ts';

// #region server
// ws does the WebSocket work. noServer: it doesn't open another port; the connections arrive
// through the same one as the API, and Hono decides on which route they're accepted (/echo).
const webSockets = new WebSocketServer({ noServer: true });

// hostname: the address it listens on, 127.0.0.1 except in a container (config.ts). serve creates
// a node:http server (HTTP/1.1; HTTP/2 would have to be asked for), and shutDown treats it as one.
const server = serve(
  { fetch: app.fetch, port: config.PORT, hostname: config.HOST, websocket: { server: webSockets } },
  (info) => {
    log.info(`The shop is listening on http://localhost:${info.port}`);
  },
) as Server;
// #endregion server

// #region shut-down
// Shutting down properly. docker stop sends the SIGTERM signal, and Ctrl + C, SIGINT (Phase 1). In
// a container, the server is process 1, and Linux doesn't end process 1 with a signal nobody
// listens to: without this, docker stop would wait 10 seconds and kill it with SIGKILL, cutting off
// whatever was halfway done. Since Phase 9 (lesson 4), without cutting anyone off (shutdown.ts): it
// stops accepting connections, finishes the requests it has, closes the event streams and the
// WebSockets and, at the end, these connections, in this order: PostgreSQL and the Redis ones (the
// queue, the order notices, the cache and the limits). At most 8 seconds, below the 10 docker stop
// waits.
const resources = [
  { close: () => pool.end() },
  { close: closeQueue },
  orderChanges,
  cache,
  { close: closeLimits },
];
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    // A different second signal (SIGINT after SIGTERM) doesn't start another shutdown. Ctrl + C twice
    // cuts it short: with process.once, the second one has no listener left.
    if (shuttingDown()) return;
    log.info(`${signal}: the shop is shutting down`);
    await shutDown(server, resources, 8000);
    log.info('the shop has shut down');
    process.exit(0);
  });
}
// #endregion shut-down
