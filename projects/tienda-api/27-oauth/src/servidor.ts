import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { app } from './app.ts';
import { config } from './config.ts';
import { log } from './log.ts';

// #region servidor
// ws hace el trabajo de WebSocket. noServer: no abre otro puerto; las conexiones llegan por el
// mismo que la API, y es Hono quien decide en qué ruta se aceptan (/eco).
const webSockets = new WebSocketServer({ noServer: true });

serve(
  { fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1', websocket: { server: webSockets } },
  (info) => {
    log.info(`La tienda escucha en http://localhost:${info.port}`);
  },
);
// #endregion servidor
