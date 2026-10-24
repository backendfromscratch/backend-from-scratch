// Los eventos salientes (Fase 9, lección 7), el patrón outbox (bandeja de salida). Hasta la
// lección 6, pagar un pedido eran dos escrituras en dos sitios: el pedido, en PostgreSQL, y después
// sus trabajos (los avisos y el correo), en la cola de Redis. Si la API se caía entre una y otra, o
// Redis no contestaba, el pedido quedaba pagado y sus trabajos no estaban en ninguna parte.
// Ahora los trabajos se guardan en PostgreSQL, en la tabla eventos_salientes y en la misma
// transacción que el pago: o se guardan los dos, o ninguno. Un repartidor, en el trabajador, lee
// los que no se han enviado, los pone en la cola y apunta que ya están.
import { setTimeout as dormir } from 'node:timers/promises';
import { context, propagation, ROOT_CONTEXT } from '@opentelemetry/api';
import { asc, inArray, isNull, sql } from 'drizzle-orm';
import { bd, type Transaccion } from './bd.ts';
import { encolar, type Trabajo } from './cola.ts';
import { eventosSalientes } from './esquema.ts';
import { log } from './log.ts';

// #region guardar-saliente
// Guarda un trabajo para después, dentro de la transacción tx: con su COMMIT, se guarda con todo lo
// demás; con un ROLLBACK, desaparece con todo lo demás. Nada va todavía a Redis.
// Desde la Fase 10 (lección 4), con la traza en la que se guarda (la del pago), en contexto:
// propagation.inject la escribe como la cabecera traceparent del estándar W3C, la misma que viaja
// entre servicios por HTTP. Sin trazas, no escribe nada, y contexto queda en NULL.
export async function guardarSaliente(tx: Transaccion, trabajo: Trabajo): Promise<void> {
  const portador: { traceparent?: string } = {};
  propagation.inject(context.active(), portador);
  await tx
    .insert(eventosSalientes)
    .values({ tipo: trabajo.tipo, datos: trabajo, contexto: portador.traceparent ?? null });
}
// #endregion guardar-saliente

// #region en-su-traza
// Lo contrario: hace algo dentro de la traza que guardó el evento. propagation.extract lee el
// traceparent, y context.with hace que lo que pase dentro (el span de BullMQ al apuntar el trabajo)
// sea hijo del span del pago. Un evento sin contexto (sin trazas, o de antes de la migración 012)
// empieza una traza nueva.
function enSuTraza<T>(contexto: string | null, hacer: () => Promise<T>): Promise<T> {
  if (!contexto) return hacer();
  return context.with(propagation.extract(ROOT_CONTEXT, { traceparent: contexto }), hacer);
}
// #endregion en-su-traza

// #region repartir
// Cuánto espera el repartidor a Redis, como mucho, en cada vuelta. Mientras espera tiene una
// transacción abierta y sus filas bloqueadas, y un Redis colgado no contestaría nunca (el límite de
// tiempo de cada orden del cliente de Redis no sirve para una que ya ha salido: Fase 9, lección 2).
export const ESPERA_COLA = 2000; // ms

// Una vuelta del repartidor. En una transacción:
//   1. Lee hasta limite eventos sin enviar, los más antiguos primero. FOR UPDATE los bloquea hasta
//      el final de la transacción, y SKIP LOCKED se salta los que ya ha bloqueado otro: con dos
//      trabajadores, cada uno coge los suyos, y nunca el mismo.
//   2. Los pone en la cola, uno detrás de otro, mientras no pase ESPERA_COLA desde el primero.
//   3. Apunta como enviados (enviado_en) los que Redis ha confirmado, y COMMIT. Devuelve cuántos.
// Si se acaba el tiempo (Redis va lento), la vuelta se queda con los que ya han llegado y deja los
// demás para la siguiente: así, aunque Redis tarde, cada vuelta avanza. Si no ha llegado ninguno
// (Redis no contesta), o Redis da un error, lanza el error, la transacción termina con ROLLBACK y
// los eventos siguen sin enviar: la siguiente vuelta los vuelve a intentar. Nunca se apunta como
// enviado lo que Redis no ha confirmado.
// Se encola dentro de la transacción, y no después del COMMIT, a propósito: si se apuntaran como
// enviados primero y se encolaran después, un trabajador que se cae entre las dos cosas los
// perdería, el mismo problema de antes. El precio es el contrario: si se cae después de encolar y
// antes del COMMIT (o Redis contesta tarde, cuando ya se ha dejado el evento para otra vuelta), la
// siguiente vuelta lo encola otra vez. Llegan al menos una vez, alguna vez dos (at-least-once), y
// por eso cada trabajo lleva su id: BullMQ no apunta dos veces el mismo (idDelTrabajo, en cola.ts).
// aLaCola: en los tests, otra cola, o una que falla, tarda o no contesta.
export async function repartir(
  limite = 50,
  aLaCola: (trabajo: Trabajo) => Promise<void> = encolar,
): Promise<number> {
  return bd.transaction(async (tx) => {
    // #region sin-dueno
    // Si el trabajador desaparece con la transacción abierta (se apaga su máquina, se corta la
    // red), PostgreSQL no se entera hasta que TCP da la conexión por perdida, y eso puede tardar
    // horas: hasta entonces, sus filas siguen bloqueadas y nadie las reparte. Con esto, una
    // transacción que pasa 5 segundos sin mandar nada se corta y suelta sus filas. 5 segundos, más
    // que ESPERA_COLA: mientras espera a Redis, la transacción tampoco manda nada. SET LOCAL: solo
    // para esta transacción, no para la conexión, que vuelve al pool.
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '5s'`);
    // #endregion sin-dueno
    // #region leer-pendientes
    const filas = await tx
      .select()
      .from(eventosSalientes)
      .where(isNull(eventosSalientes.enviadoEn))
      .orderBy(asc(eventosSalientes.creadoEn))
      .limit(limite)
      .for('update', { skipLocked: true });
    if (filas.length === 0) return 0;
    // #endregion leer-pendientes

    // #region encolar-a-tiempo
    // Uno detrás de otro, cada uno contra el mismo plazo: el que no llega a tiempo, y los que
    // quedan detrás, se dejan para la siguiente vuelta. Cada uno, en la traza de su pago.
    const plazo = dormir(ESPERA_COLA, 'tarde' as const, { ref: false });
    const enviados: number[] = [];
    for (const fila of filas) {
      const resultado = await Promise.race([
        enSuTraza(fila.contexto, () => aLaCola(fila.datos)).then(() => 'en-cola' as const),
        plazo,
      ]);
      if (resultado === 'tarde') break;
      enviados.push(fila.id);
    }
    if (enviados.length === 0) throw new Error(`la cola no contesta en ${ESPERA_COLA} ms`);
    if (enviados.length < filas.length) {
      log.warn(
        { enviados: enviados.length, de: filas.length },
        'la cola va lenta: el resto, en la siguiente vuelta',
      );
    }
    // #endregion encolar-a-tiempo

    // #region apuntar-enviados
    // clock_timestamp(): la hora de ahora, después de encolar. now() sería la del BEGIN.
    await tx
      .update(eventosSalientes)
      .set({ enviadoEn: sql`clock_timestamp()` })
      .where(inArray(eventosSalientes.id, enviados));
    return enviados.length;
    // #endregion apuntar-enviados
  });
}
// #endregion repartir

// #region repartir-cada-segundo
// El repartidor, en marcha: una vuelta al empezar y otra cada intervaloMs (un segundo). Si una
// vuelta sale llena (hay más esperando), la siguiente empieza enseguida. Cada vuelta empieza cuando
// ha terminado la anterior, nunca a la vez: con setTimeout, después de cada una, y no setInterval.
// parar() no empieza ninguna más y espera a la que está a medias: al apagarse
// (scripts/trabajador.ts), antes de cerrar la cola y PostgreSQL. Una vuelta dura como mucho
// ESPERA_COLA más lo que tarde PostgreSQL.
export function repartirCadaSegundo(
  aLaCola: (trabajo: Trabajo) => Promise<void> = encolar,
  intervaloMs = 1000,
): { enMarcha(): boolean; parar(): Promise<void> } {
  const LIMITE = 50;
  let parado = false;
  let siguiente: NodeJS.Timeout | undefined;
  let vuelta: Promise<void>;

  async function unaVuelta() {
    try {
      let repartidos;
      do {
        repartidos = await repartir(LIMITE, aLaCola);
        // Repartidos: en la cola o, sin Redis, haciéndose ya en este proceso (encolar).
        if (repartidos > 0) log.info({ eventos: repartidos }, 'eventos salientes repartidos');
      } while (repartidos === LIMITE && !parado);
    } catch (error) {
      log.warn(
        { motivo: (error as Error).message },
        'los eventos salientes no han llegado a la cola: se reintentará',
      );
    }
    if (!parado) siguiente = setTimeout(() => (vuelta = unaVuelta()), intervaloMs);
  }

  vuelta = unaVuelta();
  return {
    // Si sigue repartiendo: hasta parar(). Lo pregunta el latido del trabajador.
    enMarcha: () => !parado,
    async parar() {
      parado = true;
      clearTimeout(siguiente);
      await vuelta;
    },
  };
}
// #endregion repartir-cada-segundo
