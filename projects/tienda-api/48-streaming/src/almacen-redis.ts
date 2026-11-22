// El almacén de los límites de intentos en Redis (Fase 7, lección 7). Con dos copias de la API
// (docker compose up --scale api=2), cada una con su memoria, cada copia llevaría su propia cuenta:
// diez intentos en una y diez en la otra. Redis es un servidor aparte que guarda datos en memoria,
// muy rápido, y las dos copias le preguntan al mismo: una sola cuenta. Cumple la misma interfaz
// que el almacén en memoria (AlmacenLimites, limites.ts), así que el limitador no cambia.
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import type { AlmacenLimites } from './limites.ts';

// #region conectar
/** Un cliente de Redis para esa dirección: redis://servidor:puerto/base */
export function conectarRedis(url: string) {
  const cliente = createClient({ url });
  // Si Redis se cae, el cliente avisa con un 'error' y vuelve a conectarse solo. Sin nadie que lo
  // escuche, Node pararía el servidor (como el pool de PostgreSQL, en bd.ts).
  cliente.on('error', (error: Error) => console.error('Redis:', error.message));
  // Mientras se conecta, las órdenes que lleguen esperan en una cola. Y con Redis congelado (la
  // conexión abierta, sin respuestas), cada orden espera su respuesta sin límite: quien la usa pone
  // el suyo (los límites, desde la Fase 10: aTiempo, en limites.ts).
  cliente.connect().catch(() => {});
  return cliente;
}
// #endregion conectar

export type ClienteRedis = ReturnType<typeof conectarRedis>;

// #region almacen-redis
// Ninguna ventana de la tienda pasa de una hora: una clave que nadie toca en un día sobra.
const UN_DIA = 24 * 60 * 60 * 1000;

// Los intentos de cada clave, en un conjunto ordenado de Redis (sorted set): cada intento es un
// miembro, y su puntuación, el instante en ms. Redis los guarda ordenados por la puntuación, así
// que «borrar los anteriores a desde» o «dar todos, del más antiguo al más nuevo» es una orden.
// prefijo: delante de cada clave, para no mezclarlas con otros datos del mismo Redis.
export function crearAlmacenRedis(cliente: ClienteRedis, prefijo = 'limites:'): AlmacenLimites {
  return {
    async intentos(clave, desde) {
      // MULTI: las dos órdenes, juntas y en orden, sin que se cuele otra entre ellas.
      const [, intentos] = await cliente
        .multi()
        .zRemRangeByScore(prefijo + clave, '-inf', desde) // los que salieron de la ventana, fuera
        .zRangeWithScores(prefijo + clave, 0, -1) // los que quedan
        .execTyped();
      return intentos.map((intento) => intento.score);
    },
    async apuntar(clave, instante) {
      await cliente
        .multi()
        // El miembro, único: dos intentos en el mismo milisegundo son dos intentos.
        .zAdd(prefijo + clave, { score: instante, value: `${instante}-${randomUUID()}` })
        .pExpire(prefijo + clave, UN_DIA)
        .execTyped();
    },
  };
}
// Cada función es atómica, pero comprobar y apuntar (limites.ts) son dos viajes a Redis: entre uno
// y otro, la otra copia de la API puede apuntar un intento. En el peor caso se cuela alguno de más,
// justo en el límite; para frenar la fuerza bruta, basta. Si hiciera falta exacto, un script de
// Lua haría las dos cosas dentro de Redis, de una vez.
// #endregion almacen-redis
