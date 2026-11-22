// Un embebedor de mentira para los tests (Fase 11, lección 5): el mismo papel que el modelo falso
// de la API de Claude (modelo-falso.ts). El de verdad descarga unos 135 MB y ocupa unos 400 MB de memoria;
// este no descarga nada, contesta al momento y siempre da el mismo vector para el mismo texto, así
// que los tests saben qué orden esperar.
//
// Cómo calcula el vector: una «bolsa de palabras». Cada palabra del texto (en minúsculas, sin
// tildes y de tres letras o más) cae, según su hash, en una de las 384 posiciones del vector, y
// suma 1 allí. Al final, el vector se normaliza (longitud 1), como los del modelo. Dos textos que
// comparten palabras tienen vectores cercanos; dos que no comparten ninguna, distancia 1. No
// entiende nada (para él, «frío» y «abrigo» no se parecen): solo sirve para probar el código.
import { createHash } from 'node:crypto';
import { DIMENSIONES, type Embebedor } from '../src/embeddings.ts';

export function palabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9ñ]+/)
    .filter((palabra) => palabra.length >= 3);
}

export function vectorFalso(texto: string): number[] {
  const vector = new Array<number>(DIMENSIONES).fill(0);
  for (const palabra of palabras(texto)) {
    const posicion = createHash('sha256').update(palabra).digest().readUInt32BE(0) % DIMENSIONES;
    vector[posicion]! += 1;
  }
  const longitud = Math.hypot(...vector);
  // Sin ninguna palabra, un vector cualquiera de longitud 1: uno de ceros no tiene dirección, y
  // pgvector no sabría medir su distancia.
  if (longitud === 0) return vector.map((_, i) => (i === 0 ? 1 : 0));
  return vector.map((x) => x / longitud);
}

/** El embebedor de mentira, que apunta cada lista de textos que le piden. */
export function crearEmbebedorFalso(): Embebedor & { pedidos: string[][] } {
  const pedidos: string[][] = [];
  return {
    pedidos,
    async vectores(textos) {
      pedidos.push(textos);
      return textos.map(vectorFalso);
    },
  };
}
