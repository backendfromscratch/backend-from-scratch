import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { app } from './app.ts';
import { config } from './config.ts';
import { log } from './log.ts';

// #region server
// ws does the WebSocket work. noServer: it doesn't open another port; the connections arrive
// through the same one as the API, and Hono decides on which route they're accepted (/echo).
const webSockets = new WebSocketServer({ noServer: true });

serve(
  { fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1', websocket: { server: webSockets } },
  (info) => {
    log.info(`The shop is listening on http://localhost:${info.port}`);
  },
);
// #endregion server
