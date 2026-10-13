import type { Product } from '../src/products.ts';

// The price is text, not a number: tsc marks it as an error, but Node runs it anyway.
const mug: Product = { id: 2, name: 'Mug', price: '8.5' };
console.log(mug.price * 2);
