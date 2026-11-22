// Lo que cuesta cada llamada al modelo (Fase 11, lección 7). La API lo dice en cada respuesta, en
// usage: cuántos tokens ha leído el modelo (y cuántos de ellos han salido de la caché o se han
// guardado en ella) y cuántos ha escrito. Con los precios de config.ts, eso son dólares.
// Las cuentas son funciones puras; apuntarLlamada, al final, las lleva al log y a las métricas.
import type Anthropic from '@anthropic-ai/sdk';
import { config, type Precio, PRECIOS } from '../config.ts';
import { log } from '../log.ts';
import { metricas } from '../metricas.ts';

// #region uso
// Los tokens de una llamada, o de varias sumadas, con los nombres de la tienda:
//   entrada         los que el modelo lee y no salen de la caché (input_tokens);
//   salida          los que escribe, también lo que piensa (output_tokens);
//   lecturaCache    los que lee de la caché (cache_read_input_tokens);
//   escrituraCache  los que lee y se guardan en la caché (cache_creation_input_tokens).
// Ojo: entrada no es todo lo que lee el modelo. Con la caché funcionando, las instrucciones y las
// herramientas pasan de entrada a lecturaCache: lo que lee es la suma de los tres.
export interface Uso {
  entrada: number;
  salida: number;
  lecturaCache: number;
  escrituraCache: number;
}

export const SIN_USO: Uso = { entrada: 0, salida: 0, lecturaCache: 0, escrituraCache: 0 };

// El uso de un mensaje del modelo. Los de la caché pueden llegar como null (el SDK los declara así):
// entonces, 0.
export const usoDe = (usage: Anthropic.Usage): Uso => ({
  entrada: usage.input_tokens,
  salida: usage.output_tokens,
  lecturaCache: usage.cache_read_input_tokens ?? 0,
  escrituraCache: usage.cache_creation_input_tokens ?? 0,
});

export const sumarUso = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  salida: a.salida + b.salida,
  lecturaCache: a.lecturaCache + b.lecturaCache,
  escrituraCache: a.escrituraCache + b.escrituraCache,
});

// Lo que cuenta para el presupuesto de un cliente (presupuesto.ts): todo lo que el modelo lee y
// escribe, salga o no de la caché. La caché abarata a la tienda, no estira el presupuesto: así, el
// presupuesto dice cuánto usa cada cliente el asistente, y no cambia si la caché falla.
export const tokensDe = (uso: Uso) =>
  uso.entrada + uso.lecturaCache + uso.escrituraCache + uso.salida;
// #endregion uso

// #region coste
// El precio de un modelo. config.ts no deja arrancar con un MODELO sin precio, así que, si la API
// contesta con otro nombre (no debería), vale el de MODELO.
export const precioDe = (modelo: string): Precio => PRECIOS[modelo] ?? PRECIOS[config.MODELO]!;

// Lo que cuesta un uso, en dólares: cada tipo de token por su precio, que va por millón de tokens.
// Redondeado a la cienmillonésima de dólar: una llamada corta cuesta unas diezmilésimas, y con más
// decimales solo saldría el ruido de las cuentas con decimales (0,1 + 0,2 = 0,30000000000000004).
//   coste = (entrada × precio.entrada + escrituraCache × precio.escrituraCache
//            + lecturaCache × precio.lecturaCache + salida × precio.salida) / 1 000 000
export function costeEnDolares(uso: Uso, precio: Precio): number {
  const dolares =
    (uso.entrada * precio.entrada +
      uso.escrituraCache * precio.escrituraCache +
      uso.lecturaCache * precio.lecturaCache +
      uso.salida * precio.salida) /
    1_000_000;
  return Math.round(dolares * 1e8) / 1e8;
}
// #endregion coste

// #region apuntar
// Después de cada llamada al modelo (la del asistente, cada vuelta, y la del trabajador que escribe
// descripciones): una línea en el log con los tokens y el coste, y las métricas. contexto va en la
// línea tal cual: el requestId de la petición (o el producto, en el trabajador), para encontrarla.
// Nunca la conversación: es del cliente. Devuelve el uso, para el presupuesto.
// Las métricas, con el modelo y el tipo de token como atributos: pocos valores cada uno, así que
// pocas series (la cardinalidad de metricas.ts). Nunca el cliente: una serie por cliente crecería
// sin parar. Lo de cada cliente lo cuenta su presupuesto, en Redis.
export function apuntarLlamada(mensaje: Anthropic.Message, contexto: Record<string, unknown>): Uso {
  const uso = usoDe(mensaje.usage);
  const costeUsd = costeEnDolares(uso, precioDe(mensaje.model));
  log.info(
    { ...contexto, modelo: mensaje.model, mensaje: mensaje.id, uso, costeUsd },
    'llamada al modelo',
  );
  const modelo = mensaje.model;
  metricas.iaTokens.add(uso.entrada, { modelo, tipo: 'entrada' });
  metricas.iaTokens.add(uso.salida, { modelo, tipo: 'salida' });
  metricas.iaTokens.add(uso.lecturaCache, { modelo, tipo: 'lectura_cache' });
  metricas.iaTokens.add(uso.escrituraCache, { modelo, tipo: 'escritura_cache' });
  metricas.iaCoste.add(costeUsd, { modelo });
  return uso;
}
// #endregion apuntar
