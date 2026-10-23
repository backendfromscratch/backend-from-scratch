import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { app } from './app.ts';
import { pool } from './bd.ts';
import { config } from './config.ts';
import { cambiosDePedidos } from './eventos-pedidos.ts';
import { log } from './log.ts';

// #region servidor
// ws hace el trabajo de WebSocket. noServer: no abre otro puerto; las conexiones llegan por el
// mismo que la API, y es Hono quien decide en qué ruta se aceptan (/eco).
const webSockets = new WebSocketServer({ noServer: true });

// hostname: la dirección en la que escucha, 127.0.0.1 salvo en un contenedor (config.ts).
const servidor = serve(
  { fetch: app.fetch, port: config.PORT, hostname: config.HOST, websocket: { server: webSockets } },
  (info) => {
    log.info(`La tienda escucha en http://localhost:${info.port}`);
  },
);
// #endregion servidor

// #region apagar
// Apagarse bien. docker stop manda la señal SIGTERM, y Ctrl + C, SIGINT (Fase 1). En un
// contenedor, el servidor es el proceso 1, y Linux no termina el proceso 1 por una señal que nadie
// escucha: sin esto, docker stop esperaría 10 segundos y lo mataría con SIGKILL, cortando lo que
// estuviera a medias. Así, deja de aceptar conexiones, acaba las peticiones que tiene y cierra
// las conexiones con PostgreSQL y, desde la Fase 9, las de los avisos de los pedidos con Redis.
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(senal, () => {
    log.info(`${senal}: la tienda se apaga`);
    servidor.close(async () => {
      await Promise.all([pool.end(), cambiosDePedidos.cerrar()]);
      process.exit(0);
    });
    // Una conexión que no acaba nunca (los eventos de un pedido, un WebSocket) no lo retiene más
    // de 5 segundos.
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
// #endregion apagar
