// async y await: esperar a algo que tarda (aquí, leer un fichero) sin parar el programa.
import { readFile } from 'node:fs/promises';

async function contarProductos(fichero) {
  const texto = await readFile(fichero, 'utf8');
  return JSON.parse(texto).length;
}

console.log('Antes de leer el fichero');
const cuantos = await contarProductos('productos.json');
console.log(`El fichero tiene ${cuantos} productos`);
