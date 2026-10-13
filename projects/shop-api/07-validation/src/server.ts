// Starts the API with Hono's server for Node: it listens on port 3000, only on this computer.
import { serve } from '@hono/node-server';
import { app } from './app.ts';

serve({ fetch: app.fetch, port: 3000, hostname: '127.0.0.1' }, (info) => {
  console.log(`The shop is listening on http://localhost:${info.port}`);
});
