// Comprueba que una respuesta cumple el contrato: el documento OpenAPI que la propia API publica en
// /v2/openapi.json. Es el mismo validador que usa la API en producción (src/contrato-respuestas.ts).
import assert from 'node:assert/strict';
import { crearValidador, documentoContrato } from '../src/contrato-respuestas.ts';

// El documento y el validador se crean una vez: compilar los esquemas es lo caro.
const validar = crearValidador(documentoContrato());

/**
 * Lanza un AssertionError que lista cada campo que no cumple, si la respuesta no es lo que el
 * contrato dice para ese método, esa ruta (como la escribe el documento: /pedidos/{id}) y ese
 * estado. Lee una copia: la respuesta sigue pudiéndose leer después.
 */
export async function cumpleContrato(res: Response, metodo: string, ruta: string): Promise<void> {
  const tipo = res.headers.get('content-type') ?? '';
  const cuerpo = /json/.test(tipo) ? await res.clone().json() : undefined;
  const fallos = validar(metodo, ruta, res.status, cuerpo);
  assert.deepEqual(
    fallos,
    [],
    `${metodo.toUpperCase()} ${ruta} → ${res.status} no cumple el contrato:\n` +
      fallos
        .map((fallo) => `  ${fallo.donde || '(raíz)'}: ${fallo.mensaje} [${fallo.regla}]`)
        .join('\n'),
  );
}
