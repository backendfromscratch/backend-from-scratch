// Los avisos de los cambios de los pedidos, para la ruta que los sigue en directo (SSE, v2.ts).
// Hasta la lección 2 de la Fase 9 eran un EventEmitter: un aviso en la memoria de este proceso. Con
// dos copias de la API (docker compose up --scale api=2, Fase 9, lección 3), cada una tiene su
// memoria: si Ana sigue su pedido en una copia y lo cancela a través de la otra, el aviso se queda
// en la otra, y a ella no le llega nunca. Era lo único de la tienda que vivía en un solo proceso:
// las sesiones están en PostgreSQL (Fase 6) y los límites de intentos, en Redis (Fase 7).
// Con REDIS_URL, los avisos van por Redis, con publish/subscribe (pub/sub): cada copia se suscribe
// a un canal, y lo que una publica en él les llega a todas las que escuchan. Sin REDIS_URL (una sola
// API, sin Docker), sigue siendo un EventEmitter: con un solo proceso, basta.
import { EventEmitter } from 'node:events';
import { setTimeout as dormir } from 'node:timers/promises';
import { createClient } from 'redis';
import { z } from 'zod';
import { config } from './config.ts';
import type { Pedido } from './datos.ts';
import { log } from './log.ts';

export interface CambiosDePedidos {
  /** Avisa de que el pedido ha cambiado. No espera a nada y nunca lanza un error. */
  emitir(pedido: Pedido): void;
  /**
   * Llama a fn con cada pedido que cambia. alPerder, si está, cuando se han podido perder cambios
   * (Redis ha vuelto después de un corte): quien sigue un pedido tiene que leer otra vez su estado.
   * Devuelve la función que deja de escuchar.
   */
  escuchar(fn: (pedido: Pedido) => void, alPerder?: () => void): () => void;
  /** Cuántos escuchan ahora en este proceso: una conexión abierta, uno. */
  oyentes(): number;
  // Abre las conexiones, si no están abiertas, y se cumple cuando ya se puede publicar y Redis ha
  // confirmado la suscripción al canal; sin Redis, enseguida. Para los tests: lo que se publica
  // antes no le llega a esta copia.
  listo(): Promise<void>;
  cerrar(): Promise<void>;
}

// #region forma-del-pedido
// Lo que tiene que tener un mensaje del canal para ser un pedido: los mismos campos que Pedido
// (datos.ts), con sus tipos. Aquí, y no con los esquemas de la API (esquemas.ts), que cargan
// datos.ts, que carga este fichero.
const esquemaPedido = z.object({
  id: z.number().int(),
  productoId: z.number().int(),
  cantidad: z.number().int(),
  estado: z.enum(['pendiente', 'pagado', 'enviado', 'cancelado']),
  creadoEn: z.string(),
  clienteId: z.number().int().nullable(),
}) satisfies z.ZodType<Pedido>;
// #endregion forma-del-pedido

/** Los avisos, por el canal de ese Redis (redis://servidor:6379), o en memoria, sin dirección. */
export function crearCambiosDePedidos(url: string | undefined, canal: string): CambiosDePedidos {
  // Los que escuchan en este proceso, siempre en un EventEmitter: cada conexión que sigue un
  // pedido. Sin límite de oyentes: cada conexión abierta es uno, y puede haber muchas.
  const local = new EventEmitter<{ cambio: [Pedido]; perdidos: [] }>();
  local.setMaxListeners(0);
  const apuntar = (fn: (pedido: Pedido) => void, alPerder?: () => void) => {
    local.on('cambio', fn);
    if (alPerder) local.on('perdidos', alPerder);
    return () => {
      local.off('cambio', fn);
      if (alPerder) local.off('perdidos', alPerder);
    };
  };
  const oyentes = () => local.listenerCount('cambio');

  if (!url) {
    return {
      emitir: (pedido) => void local.emit('cambio', pedido),
      escuchar: apuntar,
      oyentes,
      listo: async () => {},
      cerrar: async () => {},
    };
  }

  // #region dos-conexiones
  // Dos conexiones a Redis. Una conexión suscrita a un canal solo sirve para recibir: mientras
  // escucha, no se le pueden mandar otras órdenes. Así que una publica y la otra, suya
  // (duplicate(): otra conexión, con las mismas opciones), escucha.
  //   disableOfflineQueue: sin conexión, publicar falla al momento, sin guardar el aviso en una cola
  //     para cuando vuelva. Un aviso viejo que llega tarde puede llegar después de uno más nuevo de
  //     otra copia (pagado después de cancelado), y enseñaría como actual un estado que ya no lo es.
  //     Lo que se pierde así no se recupera solo: cuando Redis vuelve, la ruta cierra los flujos
  //     abiertos (perdidos, más abajo), y quien sigue el pedido se conecta otra vez y lee su estado.
  //   La que escucha sí guarda su orden, SUBSCRIBE, hasta que haya conexión: es la única que manda.
  //     Después, cada vez que el cliente se vuelve a conectar, se suscribe otra vez solo.
  // Crear un cliente no abre ninguna conexión: eso lo hace connect() (abrir, más abajo).
  const publicador = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000 },
  });
  const suscriptor = publicador.duplicate({ disableOfflineQueue: false });
  // #endregion dos-conexiones

  // #region caida
  // Si se corta la conexión, el cliente lo dice con un 'error' en cada intento de volver a
  // conectarse, varias veces por segundo: al log, una vez. Cuando vuelve (las dos conexiones
  // listas), otra vez al log, y a quien escucha en esta copia, con perdidos: lo que se publicó
  // mientras tanto no le ha llegado, y no hay forma de saber qué era. Sin nadie que escuche los
  // 'error', Node pararía la API.
  // Esta copia solo se entera de sus cortes. Si se corta la conexión de otra copia, lo que esa
  // publique se pierde sin que esta lo sepa; con Redis caído, que es lo normal, se cortan todas.
  let avisado = false;
  for (const cliente of [publicador, suscriptor]) {
    cliente.on('error', (error: Error) => {
      if (avisado) return;
      avisado = true;
      log.warn(
        { motivo: error.message },
        'Redis no contesta: los avisos de los pedidos no pueden ir por Redis, y quien sigue un pedido no recibe los cambios',
      );
    });
    cliente.on('ready', () => {
      if (!avisado || !publicador.isReady || !suscriptor.isReady) return;
      avisado = false;
      log.info('Redis contesta otra vez: los avisos de los pedidos vuelven a ir por Redis');
      local.emit('perdidos');
    });
  }
  // #endregion caida

  // #region escuchar-canal
  // Cada mensaje del canal debería ser un pedido en JSON. Todos sus campos son texto, números o
  // null (la fecha va como texto, creadoEn), así que JSON.parse lo deja exactamente como era. Pero
  // el canal no es solo de la tienda: cualquiera con acceso a ese Redis puede publicar en él. Lo que
  // no sea un pedido (texto, null, un objeto con otros campos) se ignora: a quien escucha solo le
  // llegan pedidos, y la ruta puede leer pedido.id sin miedo. Al log, sin hacer ruido (debug).
  function recibir(mensaje: string) {
    let leido: unknown;
    try {
      leido = JSON.parse(mensaje);
    } catch {
      leido = undefined;
    }
    const pedido = esquemaPedido.safeParse(leido);
    if (!pedido.success) {
      log.debug(
        { canal, mensaje: mensaje.slice(0, 100) },
        'un aviso del canal que no es un pedido',
      );
      return;
    }
    local.emit('cambio', pedido.data);
  }
  // #endregion escuchar-canal

  // #region abrir
  // Las conexiones se abren la primera vez que hacen falta (emitir, escuchar o listo), no al cargar
  // este fichero, como la cola (cola.ts). Un script que carga datos.ts sin avisar a nadie
  // (crear-admin) no abre ninguna, y termina en cuanto acaba: con una conexión abierta, Node no
  // terminaría nunca. La API las abre con el primer cambio o con la primera conexión que sigue un
  // pedido.
  let abiertas: Promise<void> | undefined;
  let cerrado = false;
  // Se cumple la primera vez que el publicador está listo, y entonces yaConecto pasa a true. Hasta
  // entonces, un aviso lo espera (emitir, más abajo); después, nunca.
  let primeraConexion: Promise<void> = Promise.resolve();
  let yaConecto = false;
  function abrir(): Promise<void> {
    if (!abiertas) {
      // Una sola vez, aunque antes haya habido intentos fallidos: se espera a la primera conexión.
      primeraConexion = new Promise<void>((resolver) =>
        publicador.once('ready', () => {
          yaConecto = true;
          resolver();
        }),
      );
      for (const cliente of [publicador, suscriptor]) cliente.connect().catch(() => {});
      const suscrito = suscriptor.subscribe(canal, recibir);
      abiertas = Promise.all([suscrito, primeraConexion]).then(() => {
        log.info({ canal }, 'la API escucha el canal de los avisos de los pedidos');
      });
      // Si la suscripción falla del todo (Redis la rechaza, por ejemplo por sus permisos), esta copia
      // no recibirá ningún aviso: al log. Al cerrar, no: es lo esperado. Y sin este catch, un fallo
      // sin nadie que espere a listo pararía Node.
      abiertas.catch((error: Error) => {
        if (cerrado) return;
        log.warn(
          { canal, motivo: error.message },
          'no se puede escuchar el canal de los avisos: quien siga un pedido en esta copia no recibirá los cambios',
        );
      });
    }
    return abiertas;
  }
  // #endregion abrir

  return {
    // #region emitir
    // La copia que hace el cambio no avisa a los suyos directamente: lo publica en Redis y se entera
    // por Redis, como todas las demás. Así hay un solo camino, y nadie lo recibe dos veces (si
    // avisara a los suyos y además lo recibiera de Redis, a quien sigue el pedido en esta copia le
    // llegaría repetido). Cuesta un viaje a Redis, menos de un milisegundo.
    // Sin esperar: la respuesta de la petición que ha cambiado el pedido no tiene por qué esperar a
    // Redis, y un Redis colgado (que recibe la orden y no contesta) la dejaría esperando para
    // siempre: el límite de tiempo de node-redis no cuenta después de mandar la orden (cache.ts). Si
    // falla, al log, sin lanzar: el cambio ya está guardado en PostgreSQL.
    // Solo la primera vez, mientras la conexión se está abriendo, el aviso espera a que esté lista,
    // como mucho un segundo, el mismo connectTimeout; si no, se pierde. Después, nunca espera: con la
    // conexión cortada, publicar falla al momento (dos-conexiones), y el aviso se pierde ahora en vez
    // de salir tarde, cuando vuelva, quizá después de uno más nuevo de otra copia.
    emitir(pedido) {
      void abrir();
      const publicar = () =>
        publicador
          .publish(canal, JSON.stringify(pedido))
          .catch((error: Error) =>
            log.debug({ pedido: pedido.id, motivo: error.message }, 'aviso de pedido perdido'),
          );
      if (yaConecto) {
        void publicar();
        return;
      }
      // Una carrera entre la primera conexión y un reloj de un segundo: el que llegue antes.
      const tarde = dormir(1000).then(() => Promise.reject(new Error('Redis no contesta en 1 s')));
      Promise.race([primeraConexion, tarde]).then(publicar, (error: Error) =>
        log.debug({ pedido: pedido.id, motivo: error.message }, 'aviso de pedido perdido'),
      );
    },
    // #endregion emitir
    escuchar(fn, alPerder) {
      void abrir();
      return apuntar(fn, alPerder);
    },
    oyentes,
    listo: abrir,
    // Cierra las dos conexiones sin esperar a lo que va de camino: son avisos, no datos, y con un
    // Redis colgado no llegaría nunca. Si no se abrieron, no hay nada que cerrar.
    async cerrar() {
      cerrado = true;
      if (!abiertas) return;
      publicador.destroy();
      suscriptor.destroy();
    },
  };
}

// Los avisos de la tienda: por el canal de CANAL_PEDIDOS en el Redis de REDIS_URL, o en memoria.
export const cambiosDePedidos = crearCambiosDePedidos(config.REDIS_URL, config.CANAL_PEDIDOS);
