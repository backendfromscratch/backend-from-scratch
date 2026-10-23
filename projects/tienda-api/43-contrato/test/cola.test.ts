// La cola (Fase 9, lección 1): pagar un pedido deja el trabajo lento (los avisos a la empresa de
// reparto y el correo de confirmación) en una cola de Redis, y un proceso aparte, el trabajador,
// lo hace. Desde la lección 7, a través de eventos_salientes: la API los guarda en PostgreSQL y el
// repartidor los encola (test/eventos.test.ts). Los tests que necesitan Redis usan el de
// REDIS_URL_TESTS (test/.env), como los del almacén de los límites: sin esa variable, se saltan.
// Cada uno vacía la cola al empezar.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { rm, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AddressInfo, createServer as crearServidorTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { Queue } from 'bullmq';
import { type ClienteRedis, conectarRedis } from '../src/almacen-redis.ts';
import { avisarUno } from '../src/avisos.ts';
import { pool } from '../src/bd.ts';
import {
  crearTrabajador,
  encolar,
  NOMBRE_COLA,
  OPCIONES_TRABAJOS,
  type Trabajo,
} from '../src/cola.ts';
import { crearClave } from '../src/claves.ts';
import { config } from '../src/config.ts';
import { buscarPedido } from '../src/datos.ts';
import { firmar } from '../src/firma.ts';
import { empezarLatido } from '../src/latido.ts';
import { repartir } from '../src/salientes.ts';
import { usarBd } from './bd.ts';

usarBd();

const url = process.env.REDIS_URL_TESTS;
const sinRedis = url
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// La cola de la tienda, vista desde los tests: para mirar qué trabajos hay y para meter alguno.
let cliente: ClienteRedis;
let cola: Queue<Trabajo>;

before(() => {
  if (!url) return;
  cliente = conectarRedis(url);
  cola = new Queue<Trabajo>(NOMBRE_COLA, {
    connection: cliente,
    defaultJobOptions: OPCIONES_TRABAJOS,
  });
});

after(async () => {
  await cola?.close();
  await cliente?.close();
});

/** Vacía la cola: los trabajos de otro test (o de otra ejecución) no cuentan. */
const vaciarCola = () => cola.obliterate({ force: true });

// Las URL de los avisos apuntan a 127.0.0.1, la de los receptores de prueba: en desarrollo, se
// permite ese nombre (como AVISOS_HOSTS_DESARROLLO=127.0.0.1 en .env).
const enDesarrollo = { hostsDeDesarrollo: ['127.0.0.1'] };

interface Recibida {
  cabeceras: IncomingMessage['headers'];
  cuerpo: string;
}

/**
 * Un receptor de avisos en 127.0.0.1: la empresa de reparto, de mentira. Apunta lo que recibe y
 * contesta lo que diga responder (que puede tardar, o no contestar nunca).
 */
async function receptor(
  responder: (vez: number, respuesta: ServerResponse) => void | Promise<void>,
) {
  const recibidas: Recibida[] = [];
  let contestadas = 0;
  const servidor = createServer(async (peticion, respuesta) => {
    let cuerpo = '';
    for await (const trozo of peticion) cuerpo += trozo;
    recibidas.push({ cabeceras: peticion.headers, cuerpo });
    await responder(recibidas.length, respuesta);
    if (respuesta.writableEnded) contestadas++;
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  return {
    url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/avisos`,
    recibidas,
    contestadas: () => contestadas,
    cerrar() {
      servidor.closeAllConnections();
      servidor.close();
    },
  };
}

/** Una clave de reparto con su URL de avisos, como la guarda PUT /v2/reparto/aviso. */
async function guardarAviso(urlAviso: string): Promise<number> {
  const { id } = await crearClave('Reparto de prueba');
  await pool.query(
    `INSERT INTO avisos (clave_id, url, secreto) VALUES ($1, $2, 'secreto-de-prueba')`,
    [id, urlAviso],
  );
  return id;
}

/** Espera hasta que se cumpla la condición, o falla pasado el tiempo. */
async function esperar(condicion: () => boolean | Promise<boolean>, ms = 10_000, que = '') {
  const hasta = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > hasta) assert.fail(`pasados ${ms} ms, aún no: ${que}`);
    await dormir(50);
  }
}

/** Un puerto libre en 127.0.0.1. */
async function puertoLibre(): Promise<number> {
  const libre = crearServidorTcp().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as AddressInfo).port;
  libre.close();
  return puerto;
}

/**
 * Arranca un proceso de la tienda (la API o el trabajador) con el entorno de los tests más el que
 * se le dé, sin REDIS_URL ni SMTP_URL salvo que se pongan. Junta lo que escribe en el log.
 */
function arrancar(fichero: string, entorno: Record<string, string>) {
  const { REDIS_URL: _r, SMTP_URL: _s, ...base } = process.env;
  const proceso: ChildProcessWithoutNullStreams = spawn('node', [fichero], {
    env: { ...base, LOG_LEVEL: 'info', ...entorno },
  });
  let salida = '';
  proceso.stdout.on('data', (trozo) => (salida += trozo));
  proceso.stderr.on('data', (trozo) => (salida += trozo));
  return { proceso, salida: () => salida };
}

/** La API en un puerto libre; vuelve cuando ya escucha. */
async function arrancarApi(entorno: Record<string, string>) {
  const puerto = await puertoLibre();
  const api = arrancar('src/servidor.ts', { PORT: String(puerto), ...entorno });
  await esperar(() => api.salida().includes('La tienda escucha'), 10_000, 'la API arranca');
  return { ...api, url: `http://127.0.0.1:${puerto}` };
}

/** La pasarela de pago avisa de que el pedido está pagado (scripts/pasarela.ts). */
async function pagar(tienda: string, pedidoId: number) {
  const cuerpo = JSON.stringify({ id: `evt_${randomUUID()}`, tipo: 'pago.completado', pedidoId });
  return fetch(`${tienda}/v2/webhooks/pagos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firma': firmar(cuerpo, config.WEBHOOK_SECRET),
    },
    body: cuerpo,
  });
}

async function parar(proceso: ChildProcessWithoutNullStreams) {
  if (proceso.exitCode !== null) return;
  proceso.kill();
  await once(proceso, 'exit');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('sin REDIS_URL, pagar manda el aviso y el correo en el mismo proceso', async () => {
  const reparto = await receptor((_vez, respuesta) => void respuesta.writeHead(204).end());
  await guardarAviso(reparto.url);
  const api = await arrancarApi({ AVISOS_HOSTS_DESARROLLO: '127.0.0.1' });
  try {
    // El 21, pendiente, es de Carmen.
    const res = await pagar(api.url, 21);
    assert.equal(res.status, 200);
    await esperar(() => reparto.recibidas.length === 1, 10_000, 'el aviso llega');
    const [{ cabeceras, cuerpo }] = reparto.recibidas as [Recibida];
    assert.equal(JSON.parse(cuerpo).pedido.estado, 'pagado');
    assert.match(String(cabeceras['x-id-evento']), UUID);
    // Sin SMTP_URL, el correo no sale, y el log lo dice.
    await esperar(() => api.salida().includes('sin SMTP_URL'), 10_000, 'el correo');
    assert.match(api.salida(), /sin REDIS_URL/);
    assert.match(api.salida(), /"pedidoId":21[,}].*sin SMTP_URL/);
  } finally {
    await parar(api.proceso);
    reparto.cerrar();
    await pool.query('DELETE FROM avisos');
  }
});

test(
  'pagar deja un aviso por cada URL y un correo, y el repartidor los encola',
  { skip: sinRedis },
  async () => {
    await vaciarCola();
    const ids = [
      await guardarAviso('https://93.184.215.14/avisos'),
      await guardarAviso('https://93.184.215.15/avisos'),
    ];
    const api = await arrancarApi({ REDIS_URL: url! });
    try {
      // El 23, pendiente, también de Carmen.
      const res = await pagar(api.url, 23);
      assert.equal(res.status, 200);
      // Desde la lección 7, la API no encola nada: los trabajos esperan en eventos_salientes.
      assert.equal(await cola.count(), 0);
      assert.equal(await repartir(50, (trabajo) => encolar(trabajo, cola)), 3);
      // Nadie los hace (no hay trabajador): esperan en la cola.
      const trabajos = await cola.getJobs(['waiting']);
      const avisos = trabajos.filter((t) => t.data.tipo === 'aviso-de-pago');
      const correos = trabajos.filter((t) => t.data.tipo === 'correo-de-confirmacion');
      assert.equal(trabajos.length, 3);
      assert.deepEqual(
        avisos.map((t) => t.data.tipo === 'aviso-de-pago' && t.data.avisoId).sort(),
        ids,
      );
      assert.equal(correos.length, 1);
      for (const trabajo of trabajos) {
        assert.equal(trabajo.data.pedido.id, 23);
        assert.equal(trabajo.data.pedido.estado, 'pagado');
        assert.equal(trabajo.opts.attempts, 5);
        assert.deepEqual(trabajo.opts.backoff, { type: 'exponential', delay: 1000 });
      }
      // Un solo evento, el pago del 23: el mismo id para las dos URL.
      const eventos = new Set(
        avisos.map((t) => t.data.tipo === 'aviso-de-pago' && t.data.idEvento),
      );
      assert.equal(eventos.size, 1);
      assert.match(String([...eventos][0]), UUID);
      assert.doesNotMatch(api.salida(), /sin REDIS_URL/);
      assert.equal((await buscarPedido(23))!.estado, 'pagado');
    } finally {
      await parar(api.proceso);
      await vaciarCola();
      await pool.query('DELETE FROM avisos');
    }
  },
);

test('el aviso lleva X-Id-Evento, el mismo en cada reintento', { skip: sinRedis }, async () => {
  await vaciarCola();
  // La primera vez, la empresa de reparto falla (500); la segunda, contesta bien.
  const reparto = await receptor(
    (vez, respuesta) => void respuesta.writeHead(vez === 1 ? 500 : 204).end(),
  );
  const avisoId = await guardarAviso(reparto.url);
  const trabajador = crearTrabajador({ url, opciones: enDesarrollo });
  try {
    const pedido = (await buscarPedido(13))!;
    const idEvento = randomUUID();
    const trabajo = await cola.add('aviso-de-pago', {
      tipo: 'aviso-de-pago',
      avisoId,
      pedido,
      idEvento,
    });
    await esperar(async () => (await trabajo.getState()) === 'completed', 10_000, 'el reintento');
    assert.equal(reparto.recibidas.length, 2);
    for (const { cabeceras, cuerpo } of reparto.recibidas) {
      assert.equal(cabeceras['x-id-evento'], idEvento);
      assert.equal(cabeceras['x-firma'], firmar(cuerpo, 'secreto-de-prueba'));
      assert.deepEqual(JSON.parse(cuerpo), { tipo: 'pedido.pagado', pedido });
    }
  } finally {
    await trabajador.cerrar();
    reparto.cerrar();
    await vaciarCola();
    await pool.query('DELETE FROM avisos');
  }
});

test('un aviso que falla lanza un error (BullMQ lo reintenta)', async () => {
  const reparto = await receptor((_vez, respuesta) => void respuesta.writeHead(500).end());
  const avisoId = await guardarAviso(reparto.url);
  try {
    const pedido = (await buscarPedido(13))!;
    await assert.rejects(avisarUno(avisoId, pedido, randomUUID(), enDesarrollo), /500/);
    // Una URL interna no se manda nunca (SSRF, Fase 6): también es un fallo.
    await assert.rejects(
      avisarUno(avisoId, pedido, randomUUID(), { hostsDeDesarrollo: [] }),
      /https/,
    );
    assert.equal(reparto.recibidas.length, 1);
    // Un aviso que ya no existe (la empresa lo ha quitado) no es un fallo: no hay a quién avisar.
    await avisarUno(999_999, pedido, randomUUID(), enDesarrollo);
    // Los reintentos: 5 intentos, esperando 1, 2, 4 y 8 segundos entre uno y otro.
    assert.equal(OPCIONES_TRABAJOS.attempts, 5);
    assert.deepEqual(OPCIONES_TRABAJOS.backoff, { type: 'exponential', delay: 1000 });
  } finally {
    reparto.cerrar();
    await pool.query('DELETE FROM avisos');
  }
});

test(
  'un aviso que no contesta se reintenta y el correo sale igual',
  { skip: sinRedis },
  async () => {
    await vaciarCola();
    // Recibe el aviso y no contesta nunca.
    const reparto = await receptor(() => {});
    const avisoId = await guardarAviso(reparto.url);
    const trabajador = crearTrabajador({ url, opciones: enDesarrollo });
    try {
      const pedido = (await buscarPedido(15))!;
      const aviso = await cola.add('aviso-de-pago', {
        tipo: 'aviso-de-pago',
        avisoId,
        pedido,
        idEvento: randomUUID(),
      });
      const correo = await cola.add('correo-de-confirmacion', {
        tipo: 'correo-de-confirmacion',
        pedido,
      });
      // El correo no espera al aviso: el trabajador hace varios trabajos a la vez.
      await esperar(async () => (await correo.getState()) === 'completed', 4000, 'el correo');
      assert.equal(await aviso.getState(), 'active');
      // A los 5 segundos sin respuesta, el aviso se corta y queda para otro intento.
      await esperar(async () => (await aviso.getState()) === 'delayed', 10_000, 'el reintento');
      const fallido = (await cola.getJob(aviso.id!))!;
      assert.equal(fallido.attemptsMade, 1);
      assert.match(fallido.failedReason, /no contesta a tiempo/);
    } finally {
      await trabajador.cerrar();
      reparto.cerrar();
      await vaciarCola();
      await pool.query('DELETE FROM avisos');
    }
  },
);

test(
  'el trabajador late mientras coge trabajos, y deja de latir al apagarse',
  { skip: sinRedis },
  async () => {
    const fichero = join(tmpdir(), `latido-${randomUUID()}`);
    const trabajador = crearTrabajador({ url });
    const pararLatido = empezarLatido(() => trabajador.enMarcha(), { fichero, cadaMs: 50 });
    let cerrado = false;
    try {
      // El primer latido, enseguida; después otro, y otro.
      const primero = (await stat(fichero)).mtimeMs;
      await esperar(async () => (await stat(fichero)).mtimeMs > primero, 2000, 'otro latido');
      // Al apagarse (cerrar, como con SIGTERM): ya no coge trabajos, y el fichero se queda como estaba.
      await trabajador.cerrar();
      cerrado = true;
      assert.equal(trabajador.enMarcha(), false);
      const ultimo = (await stat(fichero)).mtimeMs;
      await dormir(300);
      assert.equal((await stat(fichero)).mtimeMs, ultimo);
    } finally {
      pararLatido();
      if (!cerrado) await trabajador.cerrar();
      await rm(fichero, { force: true });
    }
  },
);

test(
  'el trabajador se cierra con SIGTERM sin cortar el trabajo en curso',
  { skip: sinRedis },
  async () => {
    await vaciarCola();
    // Tarda un segundo y medio en contestar: da tiempo a mandar SIGTERM con el trabajo a medias.
    const reparto = await receptor(async (_vez, respuesta) => {
      await dormir(1500);
      respuesta.writeHead(204).end();
    });
    const avisoId = await guardarAviso(reparto.url);
    const trabajador = arrancar('scripts/trabajador.ts', {
      REDIS_URL: url!,
      AVISOS_HOSTS_DESARROLLO: '127.0.0.1',
    });
    try {
      const pedido = (await buscarPedido(17))!;
      const trabajo = await cola.add('aviso-de-pago', {
        tipo: 'aviso-de-pago',
        avisoId,
        pedido,
        idEvento: randomUUID(),
      });
      await esperar(() => reparto.recibidas.length === 1, 10_000, 'el trabajador coge el aviso');
      trabajador.proceso.kill('SIGTERM');
      const [codigo] = await once(trabajador.proceso, 'exit');
      assert.equal(codigo, 0, trabajador.salida());
      // Terminó el aviso antes de salir: la empresa contestó y el trabajo quedó hecho.
      assert.equal(reparto.contestadas(), 1);
      assert.equal(await trabajo.getState(), 'completed');
      assert.match(trabajador.salida(), /SIGTERM: el trabajador/);
    } finally {
      await parar(trabajador.proceso);
      reparto.cerrar();
      await vaciarCola();
      await pool.query('DELETE FROM avisos');
    }
  },
);
