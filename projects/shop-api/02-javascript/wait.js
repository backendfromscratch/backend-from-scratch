// async and await: waiting for something slow (here, reading a file) without stopping the program.
import { readFile } from 'node:fs/promises';

async function countProducts(file) {
  const text = await readFile(file, 'utf8');
  return JSON.parse(text).length;
}

console.log('Before reading the file');
const count = await countProducts('products.json');
console.log(`The file has ${count} products`);
