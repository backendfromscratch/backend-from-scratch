// Las métricas de la tienda (Fase 10, lección 5). Una métrica es un número que se mide a lo largo
// del tiempo: cuántas peticiones, cuánto tardan, cuántos pedidos pagados. Prometheus las guarda y
// Grafana las dibuja. Las de cada petición las mide @hono/otel (app.ts); aquí, las que solo la
// tienda sabe: lo que pasa en el negocio y dentro de ella.
// Cuidado con los atributos: cada combinación distinta de valores es una serie que Prometheus
// guarda para siempre. Por eso solo llevan lo que tiene pocos valores, como la plantilla de una
// ruta (/pedidos/{id}) o el código de estado, y nunca una URL entera, un id ni un email: con uno
// por pedido o por cliente, las series crecerían sin parar (cardinalidad).
// Sin instrumentación (instrumentacion.ts), el medidor no hace nada y estas llamadas no cuestan.
import { setTimeout as dormir } from 'node:timers/promises';
import { metrics, type ObservableResult } from '@opentelemetry/api';

const medidor = metrics.getMeter('tienda');

// #region contadores
// Un contador solo sube: se suma 1 cada vez que pasa algo. Prometheus añade _total al nombre y
// cambia los puntos por guiones bajos: tienda_pedidos_pagados_total.
export const metricas = {
  // Un pedido que de verdad ha pasado a pagado (v2.ts). Un evento repetido, o un pago de un pedido
  // cancelado, no cambia nada y no cuenta.
  pedidosPagados: medidor.createCounter('tienda.pedidos.pagados', {
    description: 'Pedidos que han pasado a pagado',
  }),
  // Una respuesta que no tiene la forma que promete el contrato (contrato-respuestas.ts). Atributo
  // ruta: la plantilla del contrato (/pedidos/{id}).
  respuestasFueraDeContrato: medidor.createCounter('tienda.respuestas.fuera_de_contrato', {
    description: 'Respuestas que no cumplen el contrato de la API',
  }),
};
// #endregion contadores

// #region cola-esperando
// Un indicador (gauge) no suma: dice cuánto vale algo ahora, y puede subir y bajar. Los trabajos
// que esperan en la cola son uno: si crecen, el trabajador no da abasto. No se guarda nada: cada
// vez que se recogen las métricas, se le pregunta a la cola. Y se le pregunta con prisa: si Redis
// no contesta en esperaMs, no se informa ningún valor (mejor un hueco en la gráfica que un cero
// falso, o una recogida que no acaba). Devuelve la función que deja de observar.
export function observarCola(
  cola: { getWaitingCount(): Promise<number> },
  { esperaMs = 2000 }: { esperaMs?: number } = {},
): () => void {
  const esperando = medidor.createObservableGauge('tienda.cola.esperando', {
    description: 'Trabajos esperando en la cola',
  });
  const leer = async (resultado: ObservableResult) => {
    const parar = new AbortController();
    const limite = dormir(esperaMs, undefined, { signal: parar.signal }).catch(() => undefined);
    try {
      const cuenta = await Promise.race([cola.getWaitingCount(), limite]);
      if (cuenta !== undefined) resultado.observe(cuenta);
    } catch {
      // Redis no contesta: sin valor.
    } finally {
      parar.abort();
    }
  };
  esperando.addCallback(leer);
  return () => esperando.removeCallback(leer);
}
// #endregion cola-esperando
