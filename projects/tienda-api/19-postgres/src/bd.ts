// La conexión con PostgreSQL. La usan el servidor, los scripts y los ejemplos.
import { Pool } from 'pg';

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
