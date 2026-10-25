// Lo que comparten los tests de punta a punta (Fase 10, lección 2): dónde está la tienda y su
// bandeja de correo, y una espera con tiempo máximo. A diferencia de los otros tests, estos no
// importan nada de src/: hablan con la tienda por HTTP, como cualquier cliente, y la tienda tiene
// que estar arrancada (docker compose up -d --build --wait).
import { setTimeout as dormir } from 'node:timers/promises';

export const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
// La API de Mailpit, la bandeja donde llegan los correos de práctica.
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
// Con la cookie de la sesión, la tienda exige Origin (lección 7 de la Fase 6). Es la web desde la
// que la tienda acepta peticiones (ORIGENES_PERMITIDOS), no la dirección a la que llamamos.
export const ORIGEN = 'http://localhost:3000';

/** Repite `intento` cada segundo hasta que devuelve algo, o lanza un error a los `maximo` ms. */
export async function esperar<T>(
  descripcion: string,
  intento: () => Promise<T | undefined>,
  maximo = 30_000,
): Promise<T> {
  const limite = Date.now() + maximo;
  while (Date.now() < limite) {
    const resultado = await intento();
    if (resultado !== undefined) return resultado;
    await dormir(1000);
  }
  throw new Error(`Pasaron ${maximo / 1000} segundos y no llegó: ${descripcion}`);
}
