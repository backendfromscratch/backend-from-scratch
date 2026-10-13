// La conexión con PostgreSQL. La usan el servidor, los scripts y los ejemplos.
import { Pool, type PoolClient } from 'pg';

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

// #region en-transaccion
// Ejecuta fn en una transacción: o se guarda todo lo que hace, o nada. BEGIN, las consultas y
// COMMIT tienen que ir por la misma conexión, así que fn recibe un cliente del pool y hace todo con
// él. Si fn lanza un error, ROLLBACK deshace lo que hubiera hecho, y el error sigue su camino.
export async function enTransaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    // La conexión vuelve al pool, pase lo que pase: si no, al final no quedaría ninguna libre.
    cliente.release();
  }
}
// #endregion en-transaccion
