import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { apagando, apagar } from './apagado.ts';
import { app } from './app.ts';
import { pool } from './bd.ts';
import { cache } from './cache.ts';
import { cerrarCola } from './cola.ts';
import { config } from './config.ts';
import { cambiosDePedidos } from './eventos-pedidos.ts';
import { cerrarLimites } from './limites.ts';
import { log } from './log.ts';

// #region servidor
// ws hace el trabajo de WebSocket. noServer: no abre otro puerto; las conexiones llegan por el
// mismo que la API, y es Hono quien decide en qué ruta se aceptan (/eco).
const webSockets = new WebSocketServer({ noServer: true });

// hostname: la dirección en la que escucha, 127.0.0.1 salvo en un contenedor (config.ts). serve
// crea un servidor de node:http (HTTP/1.1; HTTP/2 habría que pedirlo), y apagar lo trata como tal.
const servidor = serve(
  { fetch: app.fetch, port: config.PORT, hostname: config.HOST, websocket: { server: webSockets } },
  (info) => {
    log.info(`La tienda escucha en http://localhost:${info.port}`);
  },
) as Server;
// #endregion servidor

// #region apagar
// Apagarse bien. docker stop manda la señal SIGTERM, y Ctrl + C, SIGINT (Fase 1). En un
// contenedor, el servidor es el proceso 1, y Linux no termina el proceso 1 por una señal que nadie
// escucha: sin esto, docker stop esperaría 10 segundos y lo mataría con SIGKILL, cortando lo que
// estuviera a medias. Desde la Fase 9 (lección 4), sin cortar a nadie (apagado.ts): deja de
// aceptar conexiones, termina las peticiones que tiene, cierra los flujos de eventos y los
// WebSocket y, al final, estas conexiones, en este orden: PostgreSQL y las de Redis (la cola, los
// avisos de los pedidos, la caché y los límites). Como mucho 8 segundos, por debajo de los 10 que
// espera docker stop.
const recursos = [
  { cerrar: () => pool.end() },
  { cerrar: cerrarCola },
  cambiosDePedidos,
  cache,
  { cerrar: cerrarLimites },
];
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(senal, async () => {
    // Una segunda señal distinta (SIGINT después de SIGTERM) no empieza otro apagado. Ctrl + C dos veces
    // lo corta en seco: con process.once, la segunda ya no tiene quien la escuche.
    if (apagando()) return;
    log.info(`${senal}: la tienda se apaga`);
    await apagar(servidor, recursos, 8000);
    log.info('la tienda se ha apagado');
    process.exit(0);
  });
}
// #endregion apagar
