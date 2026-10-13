// The same route with Fastify, to compare. Start it with: node compare/fastify.ts
import Fastify from 'fastify';
import { products } from '../src/data.ts';

export const app = Fastify();

app.get('/products', async () => products);

if (import.meta.main) {
  await app.listen({ port: 3002, host: '127.0.0.1' });
  console.log('Fastify is listening on http://localhost:3002');
}
