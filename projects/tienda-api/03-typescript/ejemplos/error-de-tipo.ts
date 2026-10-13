import type { Producto } from '../src/productos.ts';

// El precio es un texto, no un número: tsc lo marca como error, pero Node lo ejecuta igual.
const taza: Producto = { id: 2, nombre: 'Taza', precio: '8.5' };
console.log(taza.precio * 2);
