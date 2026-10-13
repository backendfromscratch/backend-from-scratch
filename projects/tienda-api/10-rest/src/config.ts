// #region config
// La configuración llega de las variables de entorno (Fase 1, lección 7). Se comprueba al
// arrancar: si falta algo, el servidor no arranca y dice qué falta.
import { z } from 'zod';

const esquemaConfig = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ADMIN_TOKEN: z.string({ error: 'Falta ADMIN_TOKEN' }).min(16, 'ADMIN_TOKEN es demasiado corto'),
});

const resultado = esquemaConfig.safeParse(process.env);
if (!resultado.success) {
  for (const problema of resultado.error.issues) {
    console.error(`Configuración: ${problema.path.join('.')}: ${problema.message}`);
  }
  process.exit(1);
}

export const config = resultado.data;
// #endregion config
