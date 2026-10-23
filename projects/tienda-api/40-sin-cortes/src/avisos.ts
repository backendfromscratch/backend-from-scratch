// Los avisos a la empresa de reparto (lección 7): cuando un pedido pasa a pagado, la tienda manda
// un POST firmado a la URL que dio la empresa. Es un webhook, como el de la pasarela de pago de la
// Fase 4, pero al revés: ahora la tienda es quien avisa. Desde la Fase 9, cada aviso es un trabajo
// de la cola (cola.ts): lo manda el trabajador, y si falla, lo vuelve a intentar.
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import type { Pedido } from './datos.ts';
import { avisos } from './esquema.ts';
import { firmar } from './firma.ts';
import { log } from './log.ts';
import { enviarJson, type Opciones } from './url-segura.ts';

// #region guardar-aviso
// Guarda la URL (ya comprobada) de una clave, con un secreto nuevo para firmar, y lo devuelve: la
// empresa lo necesita para comprobar las firmas. Si ya tenía una, la cambia (ON CONFLICT … DO UPDATE).
export async function guardarAviso(claveId: number, url: string): Promise<string> {
  const secreto = randomBytes(32).toString('base64url');
  await bd
    .insert(avisos)
    .values({ claveId, url, secreto })
    .onConflictDoUpdate({
      target: avisos.claveId,
      set: { url, secreto, cambiadoEn: sql`now()` },
    });
  return secreto;
}
// #endregion guardar-aviso

/** Los avisos guardados, por su id (el de la clave de la empresa): uno por cada URL. */
export async function avisosGuardados(): Promise<number[]> {
  const filas = await bd.select({ id: avisos.claveId }).from(avisos);
  return filas.map((fila) => fila.id);
}

// #region avisar
// Un aviso, a una URL guardada, firmado con su secreto. La URL y el secreto se leen ahora, no
// cuando se pagó: si la empresa los ha cambiado mientras el trabajo esperaba, vale lo de ahora. La
// URL se comprueba otra vez al mandar (en enviarJson): lo que apuntaba a internet cuando se guardó
// puede apuntar a otro sitio hoy.
// X-Id-Evento: el mismo en cada reintento. Si el aviso llega dos veces (la empresa lo recibió, pero
// su respuesta se perdió y la tienda lo vuelve a mandar), la empresa ve el mismo id y no lo procesa
// otra vez, como hace la tienda con los avisos de la pasarela (Fase 4).
// Si no llega, lanza un error: así la cola sabe que ha fallado y lo reintenta más tarde.
export async function avisarUno(
  avisoId: number,
  pedido: Pedido,
  idEvento: string,
  opciones?: Opciones,
): Promise<void> {
  const [aviso] = await bd.select().from(avisos).where(eq(avisos.claveId, avisoId));
  if (!aviso) {
    // La empresa ha quitado su URL: no hay a quién avisar, y reintentarlo no lo cambiaría.
    log.info({ avisoId }, 'aviso sin URL: ya no existe, no se manda');
    return;
  }
  const cuerpo = JSON.stringify({ tipo: 'pedido.pagado', pedido });
  const resultado = await enviarJson(
    aviso.url,
    cuerpo,
    { 'X-Firma': firmar(cuerpo, aviso.secreto), 'X-Id-Evento': idEvento },
    opciones,
  );
  if ('error' in resultado) throw new Error(`aviso no entregado: ${resultado.error}`);
  // Una respuesta que no es 2xx tampoco cuenta: la empresa lo ha recibido, pero no lo ha guardado.
  if (resultado.status < 200 || resultado.status > 299) {
    throw new Error(`aviso no entregado: la empresa responde ${resultado.status}`);
  }
}
// #endregion avisar
