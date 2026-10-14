// La configuración llega de las variables de entorno (Fase 1, lección 7). Se comprueba al
// arrancar: si falta algo, el servidor no arranca y dice qué falta.
import { z } from 'zod';

// #region esquema-config
const esquemaConfig = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ADMIN_TOKEN: z.string({ error: 'Falta ADMIN_TOKEN' }).min(16, 'ADMIN_TOKEN es demasiado corto'),
  // El secreto con el que la pasarela de pago firma los webhooks (lección 7).
  WEBHOOK_SECRET: z
    .string({ error: 'Falta WEBHOOK_SECRET' })
    .min(16, 'WEBHOOK_SECRET es demasiado corto'),
  // El proveedor de identidad (lección 4): su dirección (el emisor), el id y el secreto que te dio
  // al registrar la tienda, y la URL de la tienda a la que vuelve el navegador.
  OIDC_EMISOR: z.url({ error: 'Falta OIDC_EMISOR, o no es una URL' }),
  OIDC_CLIENTE_ID: z.string({ error: 'Falta OIDC_CLIENTE_ID' }).min(1, 'Falta OIDC_CLIENTE_ID'),
  OIDC_CLIENTE_SECRETO: z
    .string({ error: 'Falta OIDC_CLIENTE_SECRETO' })
    .min(16, 'OIDC_CLIENTE_SECRETO es demasiado corto'),
  OIDC_VUELTA: z.url({ error: 'Falta OIDC_VUELTA, o no es una URL' }),
});
// #endregion esquema-config

const resultado = esquemaConfig.safeParse(process.env);
if (!resultado.success) {
  for (const problema of resultado.error.issues) {
    console.error(`Configuración: ${problema.path.join('.')}: ${problema.message}`);
  }
  process.exit(1);
}

export const config = resultado.data;
