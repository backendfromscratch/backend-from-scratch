// Por qué SHA-256 no sirve para guardar contraseñas, aunque sea un buen hash: es rápido, y aquí lo
// rápido juega a favor de quien ataca. Ejecútalo con: node ejemplos/hash-rapido.ts
// No necesita la base de datos.
import { createHash } from 'node:crypto';
import { hashear } from '../src/contrasenas.ts';

// #region sha256
// Un millón de contraseñas probadas con SHA-256, en un solo hilo de tu ordenador. Quien roba una
// base de datos de hashes hace esto mismo con cada contraseña de una lista, y con una tarjeta
// gráfica, miles de veces más deprisa.
const VECES = 1_000_000;
let inicio = performance.now();
for (let i = 0; i < VECES; i++) {
  createHash('sha256').update(`contraseña-${i}`).digest();
}
const sha256 = performance.now() - inicio;
console.log(`Un millón de hashes SHA-256: ${Math.round(sha256)} ms`);
// #endregion sha256

// #region argon2
// Un solo hash con argon2id, con los parámetros de la tienda.
inicio = performance.now();
await hashear('contraseña-0');
const argon2 = performance.now() - inicio;
console.log(`Un hash argon2id: ${Math.round(argon2)} ms`);

const cuantos = Math.round(argon2 / (sha256 / VECES));
console.log(`En lo que tarda un argon2id, SHA-256 calcula unos ${cuantos.toLocaleString('es')}.`);
// #endregion argon2

// #region sal
// La misma contraseña, dos veces: dos textos distintos, porque cada uno lleva su propia sal.
console.log('\nLa misma contraseña, dos veces:');
console.log(await hashear('una frase larga que solo sé yo'));
console.log(await hashear('una frase larga que solo sé yo'));
// #endregion sal
