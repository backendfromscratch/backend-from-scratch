// Qué hace la tienda cuando falla la llamada al modelo (Fase 11, lección 1). El SDK lanza un error
// de una clase distinta para cada caso (RateLimitError para un 429, OverloadedError para un 529,
// AuthenticationError para un 401…), y aquí se decide qué ve el cliente mirando la clase, nunca el
// texto del mensaje, que puede cambiar:
//   - 503, con Retry-After: algo pasajero (un 429, un 529, un corte de red), que se arregla
//     esperando;
//   - 500: la API ha rechazado la petición de la tienda (un 400, un 401, un 404…). La tienda ha hecho
//     algo mal o está mal configurada: no es culpa del cliente, y va al log.
// Es una función pura: no responde nada, solo decide. La usa ruta.ts.
import Anthropic from '@anthropic-ai/sdk';

export type Fallo = { estado: 503; reintentarEn: number; detalle: string } | { estado: 500 };

// Los segundos que se proponen esperar cuando la API no lo dice.
export const ESPERA_POR_DEFECTO = 30;

// #region retry-after
// La cabecera retry-after de la API (segundos), redondeada hacia arriba. Si no está, o no es un
// número, ESPERA_POR_DEFECTO.
export function esperaDe(cabeceras: Headers | undefined): number {
  const segundos = Number(cabeceras?.get('retry-after') ?? '');
  return segundos > 0 ? Math.ceil(segundos) : ESPERA_POR_DEFECTO;
}
// #endregion retry-after

// #region fallo-del-modelo
// undefined: no es un error de la API (un fallo de programación de la tienda); que siga su camino
// hasta app.onError, como cualquier otro.
export function falloDelModelo(error: unknown): Fallo | undefined {
  // Un corte de red, o una respuesta que no llega a tiempo (APIConnectionTimeoutError es una clase de
  // APIConnectionError). Va el primero: en el SDK, APIConnectionError también es un APIError.
  if (error instanceof Anthropic.APIConnectionError) {
    return { estado: 503, reintentarEn: ESPERA_POR_DEFECTO, detalle: 'El modelo no contesta' };
  }
  // La llamada se ha cancelado (APIUserAbortError, que también es un APIError). En la tienda solo la
  // cancela el tiempo máximo del asistente (ASISTENTE_TIEMPO_MAXIMO_MS, en config.ts): el modelo no
  // ha terminado a tiempo.
  if (error instanceof Anthropic.APIUserAbortError) {
    return { estado: 503, reintentarEn: ESPERA_POR_DEFECTO, detalle: 'El modelo no contesta' };
  }
  // 429: la cuenta de la tienda ha hecho demasiadas peticiones (o ha llegado a su límite de gasto).
  // El límite es de la tienda, no del cliente: por eso no se le responde un 429, sino un 503.
  if (error instanceof Anthropic.RateLimitError) {
    return {
      estado: 503,
      reintentarEn: esperaDe(error.headers),
      detalle: 'El modelo está recibiendo demasiadas peticiones de la tienda',
    };
  }
  // 529 (sobrecargado, OverloadedError) y cualquier otro 5xx: un problema de la API, que suele
  // pasarse solo.
  if (error instanceof Anthropic.InternalServerError) {
    return {
      estado: 503,
      reintentarEn: esperaDe(error.headers),
      detalle: 'El modelo está sobrecargado',
    };
  }
  // Cualquier otra respuesta de error de la API: 400 (una petición mal hecha), 401 (la clave no
  // vale), 403, 404 (un modelo que no existe)…
  if (error instanceof Anthropic.APIError) return { estado: 500 };
  return undefined;
}
// #endregion fallo-del-modelo
