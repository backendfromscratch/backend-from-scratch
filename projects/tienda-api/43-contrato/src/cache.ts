// La caché (Fase 9, lección 2): lo que se pide mucho y cambia poco (el catálogo), guardado un rato
// en Redis, para no preguntar a PostgreSQL lo mismo en cada petición. Es otro Redis, no el de la
// cola (CACHE_URL, no REDIS_URL): la cola no puede perder nada, y la caché puede perderlo todo, así
// que cada uno va configurado al revés (compose.yaml).
// Sin CACHE_URL (sin Docker, como hasta la Fase 8), no hay caché: todo se lee de la base de datos.
import { createClient } from 'redis';
import { config } from './config.ts';
import { log } from './log.ts';

// #region ttl
// Cuánto dura una clave en la caché: los segundos pedidos, más hasta un 10 % al azar. Si todas
// duraran lo mismo, las que se guardan a la vez (al arrancar, o después de borrar las listas)
// caducarían a la vez, y en ese instante todas las peticiones irían juntas a PostgreSQL: una
// estampida. Con 60 segundos, cada una caduca en algún momento entre el 60 y el 66, repartidas.
// azar: Math.random, que da un número entre 0 y 1; en los tests, uno fijo.
export function duracion(segundos: number, azar: () => number = Math.random): number {
  return Math.round(segundos * 1000 * (1 + 0.1 * azar()));
}
// #endregion ttl

export interface Cache {
  deCache<T>(clave: string, segundos: number, leer: () => Promise<T>): Promise<T>;
  olvidar(...claves: string[]): Promise<void>;
  // Abre la conexión, si no está abierta, y se cumple la primera vez que la caché está lista para
  // usarse: conectada, y con lo viejo ya borrado (al-volver). Sin caché, enseguida. Hasta entonces,
  // todo se lee de la base de datos. Para los tests, que la esperan antes de mirar.
  conectar(): Promise<void>;
  cerrar(): Promise<void>;
}

/** Una caché en el Redis de esa dirección (redis://servidor:6379), o ninguna, sin dirección. */
export function crearCache(url: string | undefined): Cache {
  if (!url) {
    return {
      deCache: (_clave, _segundos, leer) => leer(),
      olvidar: async () => {},
      conectar: async () => {},
      cerrar: async () => {},
    };
  }

  // #region cliente
  // Su propio cliente, no el de conectarRedis (almacen-redis.ts): a una caché no se la espera. El
  // cliente normal, con Redis caído, guarda cada orden en una cola hasta que vuelve, y la petición
  // esperaría con ella.
  //   disableOfflineQueue: sin conexión, la orden falla al momento, sin esperar en una cola.
  //   connectTimeout: un segundo para conectarse; después, otro intento, y así hasta que vuelva.
  // Eso cubre una caché caída (la conexión se corta). No cubre una colgada: un Redis parado, o una
  // red que pierde las respuestas. La conexión sigue abierta, el cliente manda la orden y espera
  // la respuesta sin límite: node-redis tiene un timeout por orden, pero solo cuenta mientras la
  // orden espera a salir, no después de mandarla. Por eso cada orden va con su propio reloj
  // (aTiempo, más abajo).
  const cliente = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1000 },
  });
  // #endregion cliente

  // #region caida
  // Si la caché falla (se corta la conexión, o una orden no contesta a tiempo), se da por caída: al
  // log una vez, y mientras siga caída, ni se le pregunta. Todo va a PostgreSQL, sin esperar, y sin
  // amontonar órdenes que no van a contestar. Cada segundo, como mucho, se le manda un PING: si
  // contesta, vuelve (al-volver, más abajo). caida empieza en true: hasta que se conecta, tampoco
  // se le pregunta.
  let caida = true;
  let avisada = false;
  let ultimaPrueba = 0;
  const marcarCaida = (motivo: string) => {
    caida = true;
    if (avisada) return;
    avisada = true;
    log.warn({ motivo }, 'la caché no contesta: se lee de la base de datos');
  };
  // Sin nadie que escuche los 'error', Node pararía la API.
  cliente.on('error', (error: Error) => marcarCaida(error.message));
  cliente.on('ready', () => void volver());
  let marcarLista: () => void;
  const conectada = new Promise<void>((resolver) => (marcarLista = resolver));

  // La conexión se abre la primera vez que se usa la caché, no al cargar este fichero, como la cola
  // (cola.ts). Un script que carga datos.ts sin usar la caché (crear-admin) no abre ninguna, y
  // termina en cuanto acaba: una conexión abierta, o un cliente que lo intenta otra vez cada poco,
  // no dejaría terminar a Node. La primera vez cuenta como caída (caida empieza en true): esa
  // lectura va a PostgreSQL, y las siguientes usan la caché en cuanto esté lista.
  let abierta = false;
  function abrir() {
    if (abierta) return;
    abierta = true;
    cliente.connect().catch(() => {});
  }

  // Una orden con un límite de 200 ms (Redis contesta en menos de un milisegundo: si tarda más, algo
  // va mal, y es mejor preguntar a PostgreSQL). Si no llega a tiempo, falla con un error. La orden
  // sigue esperando dentro del cliente, pero la petición ya no la espera.
  async function aTiempo<T>(orden: () => Promise<T>): Promise<T> {
    let reloj: NodeJS.Timeout | undefined;
    const tarde = new Promise<never>((_, rechazar) => {
      reloj = setTimeout(() => rechazar(new Error('no contesta en 200 ms')), 200);
    });
    try {
      return await Promise.race([orden(), tarde]);
    } finally {
      clearTimeout(reloj);
    }
  }

  // Lo que usan deCache y olvidar: la orden, si la caché no está caída, y a tiempo.
  async function preguntar<T>(orden: () => Promise<T>): Promise<T> {
    abrir();
    if (caida) {
      probar();
      throw new Error('la caché está caída');
    }
    try {
      return await aTiempo(orden);
    } catch (error) {
      marcarCaida((error as Error).message);
      throw error;
    }
  }

  function probar() {
    if (!cliente.isReady || Date.now() - ultimaPrueba < 1000) return;
    ultimaPrueba = Date.now();
    aTiempo(() => cliente.ping()).then(volver, () => {});
  }
  // #endregion caida

  // Borra esas claves: las exactas, con DEL; las que llevan *, con SCAN y DEL (olvidar, más abajo).
  async function borrar(claves: string[]): Promise<void> {
    const exactas = claves.filter((clave) => !clave.includes('*'));
    if (exactas.length > 0) await cliente.del(exactas);
    for (const patron of claves.filter((clave) => clave.includes('*'))) {
      for await (const lote of cliente.scanIterator({ MATCH: patron, COUNT: 100 })) {
        if (lote.length > 0) await cliente.del(lote);
      }
    }
  }

  // #region al-volver
  // Al volver, la caché no sabe qué se perdió: mientras estaba caída, la tienda ha podido cambiar
  // productos sin borrarlos de ella (olvidar ni le pregunta), y Redis guarda lo que tenía (un corte
  // de red, un docker pause). Así que, antes de usarla otra vez, borra todo lo de productos
  // (productos:*: en esta caché solo hay catálogo, datos.ts), con el mismo SCAN y DEL de olvidar y
  // el mismo límite de 200 ms. Si no lo consigue, sigue caída, y el próximo PING lo intenta otra
  // vez. Pasa también la primera vez que se conecta: lo que hubiera de antes de arrancar esta API
  // (o de otra copia), fuera. FLUSHDB no: borraría todo lo de ese Redis, también lo que no es suyo.
  let volviendo = false;
  async function volver() {
    if (volviendo) return;
    volviendo = true;
    try {
      await aTiempo(() => borrar(['productos:*']));
    } catch (error) {
      marcarCaida((error as Error).message);
      return;
    } finally {
      volviendo = false;
    }
    caida = false;
    marcarLista();
    if (avisada) log.info('la caché contesta otra vez');
    avisada = false;
  }
  // #endregion al-volver

  return {
    conectar() {
      abrir();
      return conectada;
    },
    // #region cache-aside
    // Cache-aside: primero, la caché. Si tiene la clave, eso es la respuesta, y PostgreSQL ni se
    // entera. Si no, se lee de la base de datos (leer), se guarda en la caché para los próximos,
    // con su caducidad, y se devuelve. Se guarda en JSON: Redis guarda texto.
    // Si la caché falla, se lee de la base de datos, igual que sin caché: más lento, nunca un error.
    async deCache<T>(clave: string, segundos: number, leer: () => Promise<T>): Promise<T> {
      let guardado: string | null;
      try {
        guardado = await preguntar(() => cliente.get(clave));
      } catch (error) {
        log.debug({ clave, motivo: (error as Error).message }, 'caché: no se puede leer');
        return leer();
      }
      if (guardado !== null) return JSON.parse(guardado) as T;
      const valor = await leer();
      // Lo que no existe (undefined, un producto que no está) no se guarda: se pregunta cada vez.
      if (valor === undefined) return valor;
      // Se guarda sin esperar: la respuesta ya está, y no tiene por qué esperar a Redis. PX: la
      // caducidad, en milisegundos. Pasado ese tiempo, Redis borra la clave solo.
      preguntar(() => cliente.set(clave, JSON.stringify(valor), { PX: duracion(segundos) })).catch(
        (error: Error) => log.debug({ clave, motivo: error.message }, 'caché: no se puede guardar'),
      );
      return valor;
    },
    // #endregion cache-aside

    // #region olvidar
    // Borra esas claves de la caché, para que la próxima lectura vaya a la base de datos. Se llama
    // después de cambiar algo en PostgreSQL (después del COMMIT): si se borrara antes, otra petición
    // podría volver a guardar el dato viejo entre el borrado y el cambio. Aun así, una lectura que
    // empezó antes del cambio puede guardar lo viejo justo después del borrado: por eso todo
    // caduca, y lo viejo dura, como mucho, su TTL.
    // Una clave con * es un patrón, como en redis-cli: productos:lista:* son todas las listas. Redis
    // no sabe borrar por patrón: SCAN las busca, de cien en cien, y DEL las borra. Recorrer las
    // claves cuesta poco en una caché pequeña como esta; con millones, se usaría otra forma (una
    // versión en el nombre de las claves de lista, que cambia al invalidar, y las viejas caducan).
    // Todo, con un solo límite de 200 ms. Si la caché falla, el cambio en la base de datos ya está
    // hecho y no se deshace, y la respuesta no espera: la caché queda caída, y al volver borra todo
    // lo de productos (al-volver).
    async olvidar(...claves: string[]): Promise<void> {
      try {
        await preguntar(() => borrar(claves));
      } catch (error) {
        log.debug({ claves, motivo: (error as Error).message }, 'caché: no se puede borrar');
      }
    },
    // #endregion olvidar

    // Cierra la conexión sin esperar a las órdenes que van de camino: en una caché, perderlas no
    // importa, y con una caché colgada no llegarían nunca.
    async cerrar() {
      cliente.destroy();
    },
  };
}

// La caché de la tienda: la de CACHE_URL, o ninguna. servidor.ts la cierra al apagarse.
export const cache = crearCache(config.CACHE_URL);
export const { deCache, olvidar } = cache;
