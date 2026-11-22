// #region verificar-firma
import type { MiddlewareHandler } from 'hono';
import { config } from '../config.ts';
import { firmaValida } from '../firma.ts';
import { problema, tipo } from '../problemas.ts';

// Comprueba la firma antes que nada: con el cuerpo como texto, byte a byte como llegó. Si se
// leyera como JSON y se volviera a escribir, un espacio de más cambiaría la firma. Si no vale,
// 400 y no 401: un 401 exige WWW-Authenticate, que dice cómo identificarse, y una firma no tiene
// un esquema así.
export const verificarFirma: MiddlewareHandler = async (c, next) => {
  const cuerpo = await c.req.text();
  if (!firmaValida(cuerpo, c.req.header('X-Firma'), config.WEBHOOK_SECRET)) {
    return problema(c, {
      type: tipo('firma-no-valida'),
      title: 'La firma no es válida',
      status: 400,
      detail: 'La cabecera X-Firma no corresponde a este cuerpo',
    });
  }
  await next();
};
// #endregion verificar-firma
