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
import { metrics, type ObservableGauge, type ObservableResult } from '@opentelemetry/api';

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
// no contesta en esperaMs, esta vez no se observa nada (mejor eso que un cero falso, o una recogida
// que no acaba). Ojo: eso no deja un hueco en la gráfica. El SDK manda los valores acumulados desde
// que arrancó (temporalidad acumulada), y para un indicador eso es el último que se observó: con
// Redis congelado, Prometheus sigue recibiendo el número de antes, como si nada. Devuelve la
// función que deja de observar.
export function observarCola(
  cola: { getWaitingCount(): Promise<number> },
  { esperaMs = 2000 }: { esperaMs?: number } = {},
): () => void {
  const esperando = medidor.createObservableGauge('tienda.cola.esperando', {
    description: 'Trabajos esperando en la cola',
  });
  return observarConPrisa(esperando, () => cola.getWaitingCount(), esperaMs);
}

// Lo que comparten los indicadores que preguntan a otro servidor (este y el de la antigüedad de
// los eventos salientes, más abajo). Una lectura a la vez: con Redis congelado, getWaitingCount se
// queda esperando en la cola de órdenes de la conexión hasta que vuelva, y una por recogida se
// acumularían. Mientras haya una sin acabar, no se empieza otra y no se observa nada (el SDK
// repite el último valor).
function observarConPrisa(
  indicador: ObservableGauge,
  leerValor: () => Promise<number>,
  esperaMs: number,
): () => void {
  let leyendo = false;
  const leer = async (resultado: ObservableResult) => {
    if (leyendo) return;
    leyendo = true;
    const parar = new AbortController();
    const limite = dormir(esperaMs, undefined, { signal: parar.signal }).catch(() => undefined);
    try {
      const lectura = leerValor().finally(() => {
        leyendo = false;
      });
      // Si el tiempo se acaba antes, la lectura sigue en marcha (y leyendo, en true) hasta que
      // conteste; su resultado, o su error, ya no le importa a nadie.
      lectura.catch(() => {});
      const valor = await Promise.race([lectura, limite]);
      if (valor !== undefined) resultado.observe(valor);
    } catch {
      // No contesta: sin valor.
      leyendo = false;
    } finally {
      parar.abort();
    }
  };
  indicador.addCallback(leer);
  return () => indicador.removeCallback(leer);
}
// #endregion cola-esperando

// #region salientes-antiguedad
// Cuántos segundos lleva esperando el evento saliente más antiguo sin enviar (Fase 10, lección 6).
// Es lo que nota el cliente cuando algo falla sin dar ningún error: el pago va bien, pero el correo
// no llega. Si el repartidor funciona, nunca pasa de unos pocos segundos; si crece, algo lo para.
// Se lee de PostgreSQL, no de Redis: así sigue diciendo la verdad cuando lo que ha fallado es el
// Redis de la cola. La lee la API (servidor.ts), con prisa, como la de la cola: una lectura a la
// vez y, si PostgreSQL no contesta en esperaMs, nada nuevo. Como en la de la cola, el SDK repite
// entonces el último valor: con PostgreSQL congelado, la antigüedad se queda quieta en vez de
// crecer, y esta alerta no salta (de eso avisan las otras: la lentitud y los errores). unit: 's', y
// Prometheus lo añade al nombre: tienda_salientes_antiguedad_seconds.
export const antiguedadSalientes = medidor.createObservableGauge('tienda.salientes.antiguedad', {
  description: 'Segundos que lleva esperando el evento saliente más antiguo sin enviar',
  unit: 's',
});

/** Empieza a observar la antigüedad con leer (antiguedadPendientes, en salientes.ts). */
export function observarSalientes(
  leer: () => Promise<number>,
  { esperaMs = 2000 }: { esperaMs?: number } = {},
): () => void {
  return observarConPrisa(antiguedadSalientes, leer, esperaMs);
}
// #endregion salientes-antiguedad
