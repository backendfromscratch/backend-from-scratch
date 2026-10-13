// La misma ruta con Fastify, para comparar. Arráncala con: node comparar/fastify.ts
import Fastify from 'fastify';
import { productos } from '../src/datos.ts';

export const app = Fastify();

app.get('/productos', async () => productos);

if (import.meta.main) {
  await app.listen({ port: 3002, host: '127.0.0.1' });
  console.log('Fastify escucha en http://localhost:3002');
}
