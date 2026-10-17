import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { app } from './app.ts';
import { config } from './config.ts';
import { pool } from './db.ts';
import { log } from './log.ts';

// #region server
// ws does the WebSocket work. noServer: it doesn't open another port; the connections arrive
// through the same one as the API, and Hono decides on which route they're accepted (/echo).
const webSockets = new WebSocketServer({ noServer: true });

// hostname: the address it listens on, 127.0.0.1 except in a container (config.ts).
const server = serve(
  { fetch: app.fetch, port: config.PORT, hostname: config.HOST, websocket: { server: webSockets } },
  (info) => {
    log.info(`The shop is listening on http://localhost:${info.port}`);
  },
);
// #endregion server

// #region shut-down
// Shutting down properly. docker stop sends the SIGTERM signal, and Ctrl + C, SIGINT (Phase 1). In
// a container, the server is process 1, and Linux doesn't end process 1 with a signal nobody
// listens to: without this, docker stop would wait 10 seconds and kill it with SIGKILL, cutting off
// whatever was halfway done. This way, it stops accepting connections, finishes the requests it
// has and closes the connections to PostgreSQL.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log.info(`${signal}: the shop is shutting down`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    // A connection that never ends (an order's events, a WebSocket) doesn't hold it for more than
    // 5 seconds.
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
// #endregion shut-down
