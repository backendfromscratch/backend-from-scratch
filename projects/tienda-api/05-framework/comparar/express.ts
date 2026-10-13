// La misma ruta con Express, para comparar. Arráncala con: node comparar/express.ts
import express from 'express';
import { productos } from '../src/datos.ts';

export const app = express();

app.get('/productos', (req, res) => {
  res.json(productos);
});

if (import.meta.main) {
  app.listen(3001, '127.0.0.1', () => console.log('Express escucha en http://localhost:3001'));
}
