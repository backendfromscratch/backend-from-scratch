// Arranca la API con el servidor de Node para Hono: escucha en el puerto 3000, solo en este ordenador.
import { serve } from '@hono/node-server';
import { app } from './app.ts';

serve({ fetch: app.fetch, port: 3000, hostname: '127.0.0.1' }, (info) => {
  console.log(`La tienda escucha en http://localhost:${info.port}`);
});
