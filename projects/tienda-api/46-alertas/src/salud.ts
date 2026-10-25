// Las comprobaciones de /salud/lista (Fase 10, lección 6): a quién pregunta la tienda para saber si
// puede atender, y cómo. Las rutas están en app.ts.
import { pool } from './bd.ts';
import { cache } from './cache.ts';
import { config } from './config.ts';
import { pingRedis } from './limites.ts';

export type Resultado = 'ok' | 'falla' | 'sin-configurar';

// Un PING a la vez. Con Redis congelado, cada PING se queda esperando en la cola de órdenes de su
// conexión hasta que Redis vuelva: uno nuevo en cada llamada a /salud/lista se iría acumulando, uno
// por cada vez que pregunte la sonda. Así, mientras haya uno sin contestar, la siguiente llamada
// espera a ese mismo (con el límite de comprobar). Como los indicadores de metricas.ts.
function unoALaVez(pregunta: () => Promise<unknown>): () => Promise<unknown> {
  let enMarcha: Promise<unknown> | undefined;
  return () =>
    (enMarcha ??= pregunta().finally(() => {
      enMarcha = undefined;
    }));
}
const pingCola = unoALaVez(() => pingRedis());
const pingCache = unoALaVez(() => cache.ping());

// #region comprobaciones
// Una por dependencia. Cada una devuelve una promesa que se cumple si contesta, o 'sin-configurar'
// si la tienda funciona sin ella (sin REDIS_URL, los límites van en memoria y los trabajos se hacen
// en la API; sin CACHE_URL, no hay caché). En un objeto, para que los tests puedan cambiar una.
//   bd: SELECT 1, por el mismo pool que las peticiones.
//   cola: un PING al Redis de la cola (REDIS_URL), por la conexión de los límites, uno a la vez.
//   cache: un PING al Redis de la caché (CACHE_URL), uno a la vez.
export const comprobaciones = {
  bd: (): Promise<unknown> | 'sin-configurar' => pool.query('SELECT 1'),
  cola: (): Promise<unknown> | 'sin-configurar' =>
    config.REDIS_URL ? pingCola() : 'sin-configurar',
  cache: (): Promise<unknown> | 'sin-configurar' =>
    config.CACHE_URL ? pingCache() : 'sin-configurar',
};
// #endregion comprobaciones

// #region comprobar
// Una comprobación, con un tiempo máximo: si no contesta en esperaMs, falla. Una dependencia
// congelada (docker compose pause) no contesta nunca, y quien pregunta por la salud tiene que
// recibir una respuesta, no esperar con ella. La pregunta sigue en marcha, pero ya no se espera.
export async function comprobar(
  comprobacion: () => Promise<unknown> | 'sin-configurar',
  esperaMs = 500,
): Promise<Resultado> {
  let temporizador: NodeJS.Timeout | undefined;
  try {
    const respuesta = comprobacion();
    if (respuesta === 'sin-configurar') return 'sin-configurar';
    respuesta.catch(() => {});
    const tarde = new Promise<never>((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new Error('no contesta a tiempo')), esperaMs);
    });
    await Promise.race([respuesta, tarde]);
    return 'ok';
  } catch {
    return 'falla';
  } finally {
    clearTimeout(temporizador);
  }
}
// #endregion comprobar

// #region lista
// ¿Puede atender esta copia? Las tres a la vez (no una detrás de otra: tres esperas de 500 ms
// serían 1,5 s). Falla si falla PostgreSQL o el Redis de la cola: sin la base de datos no hay
// tienda, y sin ese Redis no se puede iniciar sesión (los límites se cierran) ni sale ningún
// trabajo. La caché se dice, pero no cuenta: sin ella, todo se lee de PostgreSQL, más lento.
export async function comprobarTodo() {
  const [bd, cola, cache] = await Promise.all([
    comprobar(comprobaciones.bd),
    comprobar(comprobaciones.cola),
    comprobar(comprobaciones.cache),
  ]);
  const lista = bd !== 'falla' && cola !== 'falla';
  return { lista, comprobaciones: { bd, cola, cache } };
}
// #endregion lista
