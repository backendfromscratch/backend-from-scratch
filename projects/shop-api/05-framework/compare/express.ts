// The same route with Express, to compare. Start it with: node compare/express.ts
import express from 'express';
import { products } from '../src/data.ts';

export const app = express();

app.get('/products', (req, res) => {
  res.json(products);
});

if (import.meta.main) {
  app.listen(3001, '127.0.0.1', () => console.log('Express is listening on http://localhost:3001'));
}
