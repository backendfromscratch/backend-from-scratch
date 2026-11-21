// El presupuesto de cada cliente (Fase 11, lección 7): cuántos tokens puede gastar al día en el
// asistente. Los límites de preguntas (limites.ts) cuentan preguntas; pero una pregunta puede
// costar 2000 tokens o 20 000 (cinco vueltas con herramientas, una conversación larga), y lo que
// paga la tienda son tokens. Así que, además, cada cliente tiene un presupuesto diario, en tokens:
//   - antes de preguntar al modelo, se mira lo que lleva gastado hoy; si ya ha llegado al
//     presupuesto, 429 con Retry-After hasta medianoche (UTC), y el modelo ni se entera;
//   - después de cada llamada al modelo, se le suman sus tokens (asistente/coste.ts, tokensDe).
// Se mira antes y se cobra después, así que la última pregunta del día puede pasarse un poco: lo
// que cuesta una pregunta, como mucho (cinco vueltas, con TOKENS_MAXIMOS de salida cada una).
// El día es el de UTC, igual para todos: sencillo de contar en Redis, y sin preguntar a cada
// cliente su zona horaria.
import type { Context } from 'hono';
import { crearAlmacenPresupuestoRedis } from '../almacen-redis.ts';
import { config } from '../config.ts';
import { aTiempo, clienteRedis } from '../limites.ts';
import { log } from '../log.ts';
import { problema, tipo } from '../problemas.ts';

// #region almacen
// Dónde se apunta lo gastado: una cuenta por cliente y día. En Redis (almacen-redis.ts) con
// REDIS_URL, compartida por todas las copias de la API, como los límites; sin Redis, en la memoria
// de este servidor. caducaEn: el instante (en ms) a partir del cual esa cuenta ya no sirve.
export interface AlmacenPresupuesto {
  /** Los tokens apuntados en esa clave (0 si no hay ninguno). */
  gastados(clave: string): Promise<number>;
  /** Suma tokens a esa clave, que caduca en caducaEn (ms). */
  sumar(clave: string, tokens: number, caducaEn: number): Promise<void>;
}

export function crearAlmacenPresupuestoEnMemoria(reloj = Date.now): AlmacenPresupuesto {
  const porClave = new Map<string, { tokens: number; caducaEn: number }>();
  return {
    async gastados(clave) {
      const apunte = porClave.get(clave);
      return apunte !== undefined && apunte.caducaEn > reloj() ? apunte.tokens : 0;
    },
    async sumar(clave, tokens, caducaEn) {
      // Las cuentas que ya han caducado (las de días pasados), fuera: si no, crecerían sin parar.
      for (const [otra, apunte] of porClave) {
        if (apunte.caducaEn <= reloj()) porClave.delete(otra);
      }
      porClave.set(clave, { tokens: (porClave.get(clave)?.tokens ?? 0) + tokens, caducaEn });
    },
  };
}
// #endregion almacen

// #region dia
const UN_DIA = 24 * 60 * 60 * 1000;

// El día UTC de un instante (2026-11-21) y el instante de la medianoche UTC en que acaba. Date.UTC
// entiende el día 32 de un mes como el 1 del siguiente, así que fin de mes y de año salen solos.
export function diaUtc(instante: number): { dia: string; medianoche: number } {
  const fecha = new Date(instante);
  return {
    dia: fecha.toISOString().slice(0, 10),
    medianoche: Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate() + 1),
  };
}
// #endregion dia

// #region presupuesto
export interface EstadoPresupuesto {
  permitido: boolean;
  gastados: number; // los tokens de hoy
  maximo: number;
  reintentarEn: number; // si no se permite, los segundos que faltan para medianoche (UTC)
}

// El almacén no contesta (o no a tiempo): el presupuesto se cierra, y la ruta responde 503.
export class PresupuestoSinAlmacen extends Error {
  constructor(motivo: string) {
    super(`el presupuesto no puede preguntar a su almacén: ${motivo}`);
    this.name = 'PresupuestoSinAlmacen';
  }
}

// reloj: de dónde sale la hora (los tests le dan uno propio, para estar a un minuto de medianoche).
// espera: cuántos ms se espera al almacén, como mucho (aTiempo, en limites.ts).
export function crearPresupuesto({
  maximo,
  almacen,
  reloj = Date.now,
  espera = 200,
}: {
  maximo: number;
  almacen: AlmacenPresupuesto;
  reloj?: () => number;
  espera?: number;
}) {
  const clave = (clienteId: number, dia: string) => `${clienteId}:${dia}`;
  return {
    maximo,
    // Antes de preguntar al modelo. Si Redis no contesta en espera ms, o da un error, lanza
    // PresupuestoSinAlmacen: se cierra, como los límites del asistente, porque lo que protege es
    // dinero. Preguntas sin presupuesto mientras Redis está caído son justo el gasto que existe para
    // frenar.
    async comprobar(clienteId: number): Promise<EstadoPresupuesto> {
      const ahora = reloj();
      const { dia, medianoche } = diaUtc(ahora);
      let gastados: number;
      try {
        gastados = await aTiempo(() => almacen.gastados(clave(clienteId, dia)), espera);
      } catch (error) {
        throw new PresupuestoSinAlmacen((error as Error).message);
      }
      const permitido = gastados < maximo;
      const reintentarEn = permitido ? 0 : Math.ceil((medianoche - ahora) / 1000);
      return { permitido, gastados, maximo, reintentarEn };
    },
    // Después de cada llamada al modelo. La llamada ya está hecha (y pagada): si Redis falla ahora,
    // no tiene sentido negarle la respuesta al cliente. Solo un aviso en el log, con contexto (el
    // requestId), y esos tokens se quedan sin apuntar. La cuenta caduca un día después de su
    // medianoche: hasta entonces se puede mirar qué gastó cada cliente ayer.
    async cobrar(
      clienteId: number,
      tokens: number,
      contexto: Record<string, unknown> = {},
    ): Promise<void> {
      if (tokens <= 0) return;
      const { dia, medianoche } = diaUtc(reloj());
      try {
        await aTiempo(
          () => almacen.sumar(clave(clienteId, dia), tokens, medianoche + UN_DIA),
          espera,
        );
      } catch (error) {
        log.warn(
          { ...contexto, tokens, motivo: (error as Error).message },
          'no se ha podido apuntar lo gastado en el presupuesto del cliente',
        );
      }
    },
  };
}

export type Presupuesto = ReturnType<typeof crearPresupuesto>;
// #endregion presupuesto

// #region presupuesto-tienda
// El de la tienda: PRESUPUESTO_TOKENS_DIARIO (config.ts) por cliente. El almacén, en Redis con
// REDIS_URL (en Compose), por la misma conexión que los límites. Se exporta para los tests, que le
// cambian las funciones.
export const almacenPresupuesto = clienteRedis
  ? crearAlmacenPresupuestoRedis(clienteRedis)
  : crearAlmacenPresupuestoEnMemoria();

export const presupuesto = crearPresupuesto({
  maximo: config.PRESUPUESTO_TOKENS_DIARIO,
  almacen: almacenPresupuesto,
});
// #endregion presupuesto-tienda

// #region respuestas
// 429 Too Many Requests, como los límites de preguntas, pero con otro tipo: no es que pregunte muy
// deprisa, es que hoy ya ha gastado lo suyo. Retry-After: los segundos hasta medianoche (UTC).
export function presupuestoAgotado(c: Context, estado: EstadoPresupuesto) {
  return problema(
    c,
    {
      type: tipo('presupuesto-agotado'),
      title: 'Has gastado el presupuesto de hoy del asistente',
      status: 429,
      detail: `Hoy ya has usado ${estado.gastados} de tus ${estado.maximo} tokens del asistente: vuelve a partir de las 00:00 UTC, dentro de ${estado.reintentarEn} segundos`,
    },
    { 'Retry-After': String(estado.reintentarEn) },
  );
}

// 503: no se puede mirar el presupuesto (PresupuestoSinAlmacen). Retry-After: 5, como sinAlmacen
// (limites.ts): no es que haya gastado demasiado, es que la tienda no puede contarlo ahora.
export function presupuestoSinComprobar(c: Context) {
  return problema(
    c,
    {
      type: tipo('presupuesto-sin-comprobar'),
      title: 'No se puede comprobar el presupuesto',
      status: 503,
      detail: 'Ahora mismo el asistente no puede contestar. Vuelve a intentarlo en unos segundos',
    },
    { 'Retry-After': '5' },
  );
}
// #endregion respuestas
