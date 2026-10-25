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

// #region conexion-prestada
// Lo mismo con una conexión prestada, la que una petición o el repartidor están usando (Fase 10,
// lección 6). El pool solo escucha los 'error' de las que esperan en él: mientras una está
// prestada, nadie. Si PostgreSQL la corta entonces (se reinicia, o idle_in_transaction_session_timeout
// cierra una transacción que lleva 5 s sin decir nada, en salientes.ts), el 'error' no tenía quien
// lo escuchara y Node paraba el proceso entero. Ahora se escucha en cada conexión nueva: la consulta
// que estuviera esperando falla con su error, como cualquier otra, y el proceso sigue. (Una que
// espera en el pool lo dice dos veces: aquí y en el pool.on('error') de arriba.)
// console.warn, y no el log de la tienda (log.ts): este fichero lo usan también scripts que no
// tienen la configuración de la API (migrar, cargar-datos), y log.ts la exige.
pool.on('connect', (cliente) => {
  cliente.on('error', (error) => {
    console.warn('PostgreSQL ha cortado una conexión:', error.message);
  });
});
// #endregion conexion-prestada

// #region drizzle
// Drizzle, sobre el mismo pool: no abre conexiones propias, usa las de pg. schema le da las tablas
// y sus relaciones (esquema.ts). Las transacciones las hace bd.transaction(), que hace lo mismo que
// el enTransaccion de la lección 8: un cliente del pool, BEGIN, y COMMIT o ROLLBACK.
export const bd = drizzle({ client: pool, schema: esquema });
// #endregion drizzle

// #region transaccion
// Lo que recibe la función de bd.transaction(async (tx) => …): tx tiene las mismas consultas que
// bd, pero todas van por la conexión de la transacción. Con este tipo, una función puede pedir que
// la llamen dentro de una (guardarSaliente, en salientes.ts).
export type Transaccion = Parameters<Parameters<typeof bd.transaction>[0]>[0];
// #endregion transaccion
