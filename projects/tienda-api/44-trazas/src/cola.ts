// La cola de trabajos (Fase 9, lección 1). Lo que una petición no tiene por qué esperar (avisar a
// la empresa de reparto, mandar un correo) se apunta en una cola y se contesta enseguida. Otro
// proceso, el trabajador (scripts/trabajador.ts), coge los trabajos de la cola y los hace. Si uno
// falla, la cola lo guarda y lo vuelve a intentar más tarde.
// La cola vive en Redis, el mismo de los límites de intentos, con BullMQ: quien apunta (la API) y
// quien hace (el trabajador) son dos procesos, y pueden estar en dos máquinas.
import { context, ROOT_CONTEXT } from '@opentelemetry/api';
import { type DefaultJobOptions, Queue, Worker } from 'bullmq';
import { BullMQOtel } from 'bullmq-otel';
import { type ClienteRedis, conectarRedis } from './almacen-redis.ts';
import { avisarUno } from './avisos.ts';
import { config } from './config.ts';
import { enviarConfirmacion } from './correo.ts';
import type { Pedido } from './datos.ts';
import { log } from './log.ts';
import type { Opciones } from './url-segura.ts';

// Los trabajos que hay: cada uno lleva lo que hace falta para hacerlo, en JSON. idEvento: el id del
// aviso, el mismo en cada intento (avisos.ts).
export type Trabajo =
  | { tipo: 'aviso-de-pago'; avisoId: number; pedido: Pedido; idEvento: string }
  | { tipo: 'correo-de-confirmacion'; pedido: Pedido };

export const NOMBRE_COLA = 'tienda';

// #region reintentos
// Cinco intentos en total. Entre uno y otro, una espera que se duplica (exponential): 1, 2, 4 y 8
// segundos. Un receptor caído un momento tiene tiempo de volver, y uno caído del todo no recibe
// una petición por segundo. Los trabajos hechos se olvidan pasados los 1000 últimos; los que
// fallan cinco veces se quedan (también los 1000 últimos), para mirar qué pasó.
export const OPCIONES_TRABAJOS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
} satisfies DefaultJobOptions;
// #endregion reintentos

// Hacer un trabajo: lo que el trabajador llama con cada uno que coge de la cola. Si lanza un error,
// el trabajo ha fallado.
export async function procesar(trabajo: Trabajo, opciones?: Opciones): Promise<void> {
  switch (trabajo.tipo) {
    case 'aviso-de-pago':
      return avisarUno(trabajo.avisoId, trabajo.pedido, trabajo.idEvento, opciones);
    case 'correo-de-confirmacion':
      await enviarConfirmacion(trabajo.pedido);
      return;
  }
}

// #region telemetria
// Las trazas de la cola (Fase 10, lección 4). Con telemetry, BullMQ hace un span al apuntar cada
// trabajo (add tienda.<tipo>) y otro al hacerlo (process tienda), y guarda en el trabajo, en Redis,
// la traza en la que se apuntó: el trabajador la lee y sigue en ella. Sin esto, la traza se corta
// en la cola. Va en la cola y en el trabajador; sin instrumentación (instrumentacion.ts), no hace
// nada. tienda: el nombre de quien hace los spans, el mismo que el de la cola.
const telemetria = () => new BullMQOtel({ tracerName: 'tienda' });
// #endregion telemetria

/** La cola de la tienda sobre una conexión a Redis: la de la API y el trabajador, y la de los tests. */
export function crearCola(conexion: ClienteRedis): Queue<Trabajo> {
  return new Queue<Trabajo>(NOMBRE_COLA, {
    connection: conexion,
    defaultJobOptions: OPCIONES_TRABAJOS,
    telemetry: telemetria(),
  });
}

// #region encolar
// La cola, si hay Redis, creada la primera vez que hace falta. Desde la lección 7 la usa el
// repartidor, en el trabajador (salientes.ts): la API ya no encola nada. La conexión es suya: la
// de los límites hace otro trabajo.
let cola: Queue<Trabajo> | undefined;
let conexionCola: ClienteRedis | undefined;
function laCola(url: string): Queue<Trabajo> {
  if (!cola) {
    // Fuera de la traza de quien la pide la primera vez (Fase 10, lección 4): al conectarse, BullMQ
    // carga sus scripts en Redis, unas cincuenta órdenes, y eso no es parte del pago que estaba
    // repartiendo. ROOT_CONTEXT: el contexto vacío, sin traza.
    cola = context.with(ROOT_CONTEXT, () => {
      conexionCola = conectarRedis(url);
      return crearCola(conexionCola);
    });
    // Los errores de la conexión (Redis caído), al log, como los del trabajador.
    cola.on('error', (error) => log.error({ motivo: error.message }, 'error de la cola'));
  }
  return cola;
}

// #region id-del-trabajo
// Cada trabajo, con su id (jobId). Si llega a la cola otro con un id que ya está, BullMQ no lo
// apunta: se queda con el que había, esté esperando, a medias o ya hecho. Desde la lección 7, un
// mismo trabajo puede llegar dos veces (salientes.ts: el repartidor lo encola y se cae antes de
// apuntarlo), y así se hace una sola. El correo, uno por pedido; el aviso, uno por pago y por URL.
// BullMQ recuerda los ids de los trabajos que guarda: los que esperan y los 1000 últimos hechos y
// fallidos (OPCIONES_TRABAJOS). Lo que se repita más tarde se haría otra vez: por eso los avisos
// llevan además X-Id-Evento (avisos.ts), para que la empresa reconozca uno repetido.
export function idDelTrabajo(trabajo: Trabajo): string {
  switch (trabajo.tipo) {
    case 'aviso-de-pago':
      return `aviso-${trabajo.idEvento}-${trabajo.avisoId}`;
    case 'correo-de-confirmacion':
      return `correo-${trabajo.pedido.id}`;
  }
}
// #endregion id-del-trabajo

// Apunta el trabajo en la cola y vuelve: no espera a que se haga. El nombre del trabajo es su tipo,
// y así se lee en el log y en Redis. destino: la cola; en los tests, la suya.
// Sin Redis (sin Docker, como hasta la Fase 8), se hace aquí mismo, ahora, sin esperarlo y sin
// reintentos: si falla, queda en el log y nada más.
export async function encolar(
  trabajo: Trabajo,
  destino = config.REDIS_URL ? laCola(config.REDIS_URL) : undefined,
): Promise<void> {
  if (destino) {
    await destino.add(trabajo.tipo, trabajo, { jobId: idDelTrabajo(trabajo) });
    return;
  }
  log.info({ tipo: trabajo.tipo }, 'sin REDIS_URL: el trabajo se hace en este proceso, sin cola');
  void procesar(trabajo).catch((error: Error) =>
    log.warn({ tipo: trabajo.tipo, motivo: error.message }, 'trabajo fallido, sin reintentos'),
  );
}
// #endregion encolar

// #region cerrar-cola
// Al apagarse la API (Fase 9, lección 4) o el trabajador: cierra la conexión de la cola, si se
// llegó a abrir. Con destroy(), sin esperar a Redis: close() le pide que cierre y espera su
// respuesta, y un Redis colgado no contestaría nunca. Cuando se llama, ya no queda nada que
// encolar: el repartidor ya ha parado.
export async function cerrarCola(): Promise<void> {
  conexionCola?.destroy();
}
// #endregion cerrar-cola

// #region trabajador
// El trabajador: coge los trabajos de la cola y los hace, hasta cinco a la vez (concurrency), así
// que un aviso que tarda no retrasa un correo. Si procesar lanza un error, BullMQ apunta el fallo
// y deja el trabajo esperando su próximo intento (OPCIONES_TRABAJOS). url y opciones: en los
// tests, su Redis y los nombres permitidos para los avisos.
export function crearTrabajador(ajustes: { url?: string | undefined; opciones?: Opciones } = {}): {
  enMarcha(): boolean;
  cerrar(): Promise<void>;
} {
  const url = ajustes.url ?? config.REDIS_URL;
  if (!url) throw new Error('El trabajador necesita REDIS_URL: la cola está en Redis');
  // Su propia conexión: BullMQ la copia para esperar trabajos (una espera que bloquea la conexión).
  const conexion = conectarRedis(url);
  const trabajador = new Worker<Trabajo>(
    NOMBRE_COLA,
    (trabajo) => procesar(trabajo.data, ajustes.opciones),
    { connection: conexion, concurrency: 5, telemetry: telemetria() },
  );
  trabajador.on('completed', (trabajo) =>
    log.info({ id: trabajo.id, tipo: trabajo.name }, 'trabajo hecho'),
  );
  trabajador.on('failed', (trabajo, error) => {
    if (!trabajo) return;
    const intentos = trabajo.opts.attempts ?? 1;
    log.warn(
      {
        id: trabajo.id,
        tipo: trabajo.name,
        intento: trabajo.attemptsMade,
        de: intentos,
        motivo: error.message,
      },
      trabajo.attemptsMade < intentos
        ? 'trabajo fallido: se reintentará'
        : 'trabajo fallido: sin más intentos',
    );
  });
  // Los errores de la conexión (Redis caído): BullMQ se vuelve a conectar solo.
  trabajador.on('error', (error) => log.error({ motivo: error.message }, 'error del trabajador'));
  return {
    // Si está cogiendo trabajos: en marcha, y sin estar apagándose. Lo pregunta el latido
    // (scripts/trabajador.ts).
    enMarcha: () => trabajador.isRunning() && !trabajador.closing,
    // close() deja de coger trabajos nuevos y espera a que acaben los que están a medias.
    async cerrar() {
      await trabajador.close();
      await conexion.close();
    },
  };
}
// #endregion trabajador
