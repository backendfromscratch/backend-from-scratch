import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { config } from './config.ts';
import { log } from './log.ts';

serve({ fetch: app.fetch, port: config.PORT, hostname: '127.0.0.1' }, (info) => {
  log.info(`La tienda escucha en http://localhost:${info.port}`);
});
