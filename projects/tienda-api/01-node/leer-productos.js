// Lee un fichero del disco, algo que una página web no puede hacer y Node.js sí.
import { readFile } from 'node:fs/promises';

const texto = await readFile('productos.json', 'utf8');
const productos = JSON.parse(texto);

console.log(`La tienda tiene ${productos.length} productos:`);
for (const producto of productos) {
  console.log(`- ${producto.nombre}: ${producto.precio} €`);
}
