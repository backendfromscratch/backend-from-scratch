// Crea las tablas de la tienda y les pone los datos de ejemplo. Antes borra las que hubiera, con
// todo lo que tengan: sirve mientras se diseñan las tablas, cuando aún no hay datos que conservar.
// En la lección 6, las migraciones lo sustituyen. Ejecútalo con: npm run bd:crear
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

// La dirección de la base de datos, del .env: postgres://usuario:contraseña@servidor:puerto/base
const url = process.env.DATABASE_URL;
if (url === undefined) {
  console.error('Falta DATABASE_URL: copia .env.ejemplo como .env y pon la de tu base de datos');
  process.exit(1);
}

const leer = (fichero: string) => readFile(join(import.meta.dirname, '..', 'bd', fichero), 'utf8');

// #region crear
const cliente = new Client({ connectionString: url });
await cliente.connect();
try {
  await cliente.query(`
    DROP TABLE IF EXISTS
      pedidos, productos_categorias, categorias, productos, claves_idempotencia, eventos_procesados
  `);
  await cliente.query(await leer('esquema.sql'));
  await cliente.query(await leer('datos.sql'));
  // count(*) es un bigint, y pg lo devuelve como texto: ::int lo convierte en un número normal.
  const { rows } = await cliente.query(`
    SELECT
      (SELECT count(*)::int FROM productos) AS productos,
      (SELECT count(*)::int FROM categorias) AS categorias,
      (SELECT count(*)::int FROM pedidos) AS pedidos
  `);
  const { productos, categorias, pedidos } = rows[0];
  console.log(
    `Tablas creadas: ${productos} productos, ${categorias} categorías y ${pedidos} pedidos`,
  );
} finally {
  // Se cierra la conexión pase lo que pase: si no, el programa se quedaría esperando.
  await cliente.end();
}
// #endregion crear
