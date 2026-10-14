// La conexión con PostgreSQL. La usan el servidor, los scripts y los ejemplos.
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as esquema from './esquema.ts';

// #region pool
// La dirección de la base de datos, del .env: postgres://usuario:contraseña@servidor:puerto/base
const url = process.env.DATABASE_URL;
if (url === undefined) {
  console.error('Configuración: DATABASE_URL: Falta DATABASE_URL (mira .env.ejemplo)');
  process.exit(1);
}

// Un pool: unas cuantas conexiones abiertas que las peticiones se van prestando. Abrir una conexión
// cuesta (TCP, la contraseña, preparar la sesión); reutilizar una abierta, casi nada. Como mucho
// 10 a la vez: si llegan más consultas, esperan su turno.
export const pool = new Pool({ connectionString: url, max: 10 });

// Si PostgreSQL corta una conexión que estaba esperando en el pool (porque se reinicia, por
// ejemplo), el pool avisa con un 'error'. Sin nadie que lo escuche, Node pararía el servidor.
pool.on('error', (error) => {
  console.error('PostgreSQL ha cortado una conexión del pool:', error.message);
});
// #endregion pool

// #region drizzle
// Drizzle, sobre el mismo pool: no abre conexiones propias, usa las de pg. schema le da las tablas
// y sus relaciones (esquema.ts). Las transacciones las hace bd.transaction(), que hace lo mismo que
// el enTransaccion de la lección 8: un cliente del pool, BEGIN, y COMMIT o ROLLBACK.
export const bd = drizzle({ client: pool, schema: esquema });
// #endregion drizzle
