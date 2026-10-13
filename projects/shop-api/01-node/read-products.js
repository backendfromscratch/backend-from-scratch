// Reads a file from the disk, something a web page can't do and Node.js can.
import { readFile } from 'node:fs/promises';

const text = await readFile('products.json', 'utf8');
const products = JSON.parse(text);

console.log(`The shop has ${products.length} products:`);
for (const product of products) {
  console.log(`- ${product.name}: ${product.price} €`);
}
