// Las claves de API (migración 007): cómo se identifica un programa, como el de la empresa de
// reparto. Una clave es como una sesión que no caduca y que no viaja en una cookie, sino en
// Authorization: Bearer <clave>.
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { bd } from './bd.ts';
import { clavesApi } from './esquema.ts';

export interface ClaveApi {
  id: number;
  nombre: string;
}

// #region crear-clave
// Todas empiezan por tienda_: quien encuentre una en un log o en un repositorio sabe de dónde es (y
// GitHub puede reconocerlas y avisar, como hace con las de otras empresas). Detrás, 32 bytes al azar.
export const PREFIJO_CLAVE = 'tienda_';

// Devuelve la clave una sola vez: la tabla solo guarda su hash. Si se pierde, se crea otra.
export async function crearClave(nombre: string): Promise<{ id: number; clave: string }> {
  const clave = PREFIJO_CLAVE + randomBytes(32).toString('base64url');
  const [fila] = await bd
    .insert(clavesApi)
    .values({ nombre, hash: hashDeClave(clave) })
    .returning({ id: clavesApi.id });
  return { id: fila!.id, clave };
}

// SHA-256, como el id de las sesiones: la clave es al azar y larga, no hace falta un hash lento.
const hashDeClave = (clave: string) => createHash('sha256').update(clave).digest();
// #endregion crear-clave

// #region buscar-clave
// La clave que corresponde a ese texto, o undefined. Una sola consulta la busca por su hash y
// apunta que se ha usado ahora (UPDATE … RETURNING).
export async function claveDe(clave: string): Promise<ClaveApi | undefined> {
  const [fila] = await bd
    .update(clavesApi)
    .set({ usadaEn: sql`now()` })
    .where(eq(clavesApi.hash, hashDeClave(clave)))
    .returning({ id: clavesApi.id, nombre: clavesApi.nombre });
  return fila;
}
// #endregion buscar-clave
