// Los avisos a la empresa de reparto (lección 7): cuando un pedido pasa a pagado, la tienda manda
// un POST firmado a la URL que dio la empresa. Es un webhook, como el de la pasarela de pago de la
// Fase 4, pero al revés: ahora la tienda es quien avisa.
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
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

// #region avisar
// Un aviso a cada URL guardada, firmado con su secreto. La URL se comprueba otra vez al mandar (en
// enviarJson): lo que apuntaba a internet cuando se guardó puede apuntar a otro sitio hoy.
export async function avisarDePago(pedido: Pedido, opciones?: Opciones): Promise<void> {
  for (const { url, secreto } of await bd.select().from(avisos)) {
    const cuerpo = JSON.stringify({ tipo: 'pedido.pagado', pedido });
    const resultado = await enviarJson(
      url,
      cuerpo,
      { 'X-Firma': firmar(cuerpo, secreto) },
      opciones,
    );
    if ('error' in resultado) log.warn({ url, motivo: resultado.error }, 'aviso no entregado');
  }
}
// #endregion avisar
