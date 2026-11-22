import { zValidator } from '@hono/zod-validator';
import type { Context, ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { datosNoValidos } from '../problemas.ts';

// #region si-no-es-valido
// Del error de Zod solo hace falta la lista de problemas: dónde está cada uno y qué le pasa.
interface Resultado {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}

// Lo que se responde cuando una parte de la petición no cumple su esquema: 422, con cada
// problema. Lo usan validar (en v1) y el contrato de v2 (defaultHook, en v2.ts).
export function siNoEsValido(resultado: Resultado, c: Context) {
  if (!resultado.success && resultado.error) {
    const errores = resultado.error.issues.map((problema) => ({
      campo: problema.path.join('.'),
      problema: problema.message,
    }));
    return datosNoValidos(c, errores);
  }
}
// #endregion si-no-es-valido

// Comprueba una parte de la petición (el cuerpo JSON, la ruta o la query string) con un esquema.
export const validar = <Esquema extends ZodType, Donde extends keyof ValidationTargets>(
  donde: Donde,
  esquema: Esquema,
) => zValidator(donde, esquema, siNoEsValido);
