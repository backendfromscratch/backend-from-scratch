// Apagarse sin cortar a nadie (Fase 9, lección 4). Para desplegar sin cortes, desplegar.sh cambia
// las copias de la API de una en una, y Docker le manda SIGTERM a la que se va. Lo que hace
// entonces, en este orden:
//   1. Deja de aceptar conexiones nuevas. nginx, al intentar la siguiente en esta copia, no puede
//      conectar, y la pasa a la otra: una conexión rechazada es una petición que no ha llegado, y
//      nginx la repite en la otra copia, aunque sea un POST. Siempre que Docker no pase los puertos
//      por docker-proxy (su «userland proxy», encendido si no se cambia; el README dice cómo
//      apagarlo): con él, el puerto sigue aceptando conexiones hasta que el proceso sale, y las
//      corta, y nginx no repite un POST que ya ha mandado (502).
//   2. Termina las peticiones que tiene a medias: las que una parada en seco cortaría (los 502 de
//      la Fase 8, lección 6).
//   3. Cierra las conexiones que no terminan nunca: los flujos de eventos de los pedidos y los
//      WebSocket. Sus clientes se vuelven a conectar solos, y llegan a la otra copia.
//   4. Cuando ya no queda ninguna conexión, cierra la base de datos y Redis.
// Todo, como mucho en limiteMs: docker stop espera 10 segundos y después mata el proceso.
import { setMaxListeners } from 'node:events';
import type { Server } from 'node:http';
import { setTimeout as dormir } from 'node:timers/promises';
import { log } from './log.ts';

// #region aviso
const controlador = new AbortController();
// Cada flujo de eventos y cada WebSocket abierto escucha esta señal, y puede haber muchos: sin
// esto, Node avisaría de una posible fuga a partir de 10.
setMaxListeners(0, controlador.signal);

/** Salta al empezar a apagarse. La escuchan la ruta de los eventos de un pedido y /eco. */
export const alApagar: AbortSignal = controlador.signal;

/** ¿Se está apagando? Desde ese momento, /salud contesta 503. */
export function apagando(): boolean {
  return alApagar.aborted;
}
// #endregion aviso

/** Algo que hay que cerrar al final: el pool de PostgreSQL, una conexión con Redis… */
export interface Recurso {
  cerrar(): Promise<void>;
}

// #region apagar
export async function apagar(
  servidor: Server,
  recursos: Recurso[],
  limiteMs: number,
): Promise<void> {
  const hasta = Date.now() + limiteMs;
  controlador.abort();

  // 1 y 2. close() deja de aceptar conexiones, y llama a su función cuando se ha cerrado la última.
  const cerrado = new Promise<boolean>((resolver) => servidor.close(() => resolver(true)));
  // Una conexión keep-alive (HTTP/1.1 la deja abierta para la siguiente petición) no se cierra
  // sola. close() cierra las que esperan sin hacer nada, pero no las que tienen una petición a
  // medias: al terminarla, se quedan esperando otra. Así que lo que aún llegue por ellas se
  // contesta con Connection: close (el cliente no vuelve a usar la conexión), y cada 100 ms se
  // cierran las que han quedado libres. prependListener: antes que la tienda, que es quien escribe
  // la respuesta; después, las cabeceras ya podrían haber salido.
  servidor.prependListener('request', (_peticion, respuesta) =>
    respuesta.setHeader('Connection', 'close'),
  );
  const libres = setInterval(() => servidor.closeIdleConnections(), 100);
  const aTiempo = await Promise.race([cerrado, dormir(limiteMs, false, { ref: false })]);
  clearInterval(libres);
  if (!aTiempo) {
    // Lo que no ha terminado a tiempo se corta: mejor eso que el SIGKILL de docker stop.
    log.warn(`pasados ${limiteMs} ms, quedan peticiones a medias: se cortan`);
    servidor.closeAllConnections();
  }

  // 4. Uno detrás de otro, sin pasar del límite: uno que no contesta (un Redis colgado) no retiene
  // a los demás. Si uno falla, al log, y se sigue con el siguiente.
  for (const recurso of recursos) {
    const queda = Math.max(hasta - Date.now(), 0);
    try {
      await Promise.race([recurso.cerrar(), dormir(queda, undefined, { ref: false })]);
    } catch (error) {
      log.warn({ motivo: (error as Error).message }, 'algo no se ha cerrado bien al apagarse');
    }
  }
}
// #endregion apagar
