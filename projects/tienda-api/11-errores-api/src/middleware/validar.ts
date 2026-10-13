// #region validar
import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { datosNoValidos } from '../problemas.ts';

// Comprueba una parte de la petición (el cuerpo JSON, la ruta o la query string) con un esquema.
// Si no cumple, responde 422 con cada problema, en el formato de todos los errores de la API, y
// la ruta no llega a ejecutarse.
export const validar = <Esquema extends ZodType, Donde extends keyof ValidationTargets>(
  donde: Donde,
  esquema: Esquema,
) =>
  zValidator(donde, esquema, (resultado, c) => {
    if (!resultado.success) {
      const errores = resultado.error.issues.map((problema) => ({
        campo: problema.path.join('.'),
        problema: problema.message,
      }));
      return datosNoValidos(c, errores);
    }
  });
// #endregion validar
