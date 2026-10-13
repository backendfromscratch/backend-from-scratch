// #region validar
import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

// Comprueba una parte de la petición (el cuerpo JSON, la ruta o la query string) con un esquema.
// Si no cumple, responde 422 con cada problema y la ruta no llega a ejecutarse: el servidor ha
// podido leer la petición, pero los datos no valen (Fase 2, lección 3).
export const validar = <Esquema extends ZodType, Donde extends keyof ValidationTargets>(
  donde: Donde,
  esquema: Esquema,
) =>
  zValidator(donde, esquema, (resultado, c) => {
    if (!resultado.success) {
      const detalles = resultado.error.issues.map((problema) => ({
        campo: problema.path.join('.'),
        problema: problema.message,
      }));
      return c.json({ error: 'Los datos no son válidos', detalles }, 422);
    }
  });
// #endregion validar
