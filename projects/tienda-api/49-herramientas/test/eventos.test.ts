// Los eventos salientes (Fase 9, lección 7): pagar un pedido ya no pone nada en la cola. Guarda el
// cambio del pedido y lo que hay que hacer después (los avisos y el correo) en la misma
// transacción, en la tabla eventos_salientes. Un repartidor, en el trabajador, los pasa a la cola.
// Los tests que necesitan Redis usan el de REDIS_URL_TESTS (test/.env): sin ella, se saltan.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import { type AddressInfo, createServer as crearServidorTcp } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { Queue } from 'bullmq';
import { app } from '../src/app.ts';
import { type ClienteRedis, conectarRedis } from '../src/almacen-redis.ts';
import { bd, pool } from '../src/bd.ts';
import { crearClave } from '../src/claves.ts';
import {
  crearTrabajador,
  encolar,
  NOMBRE_COLA,
  OPCIONES_TRABAJOS,
  type Trabajo,
} from '../src/cola.ts';
import { config } from '../src/config.ts';
import { buscarPedido } from '../src/datos.ts';
import { firmar } from '../src/firma.ts';
import { ESPERA_COLA, guardarSaliente, repartir, repartirCadaSegundo } from '../src/salientes.ts';
import { usarBd } from './bd.ts';
import { CARMEN, comoUsuario } from './identidades.ts';

let carmen: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
});

const url = process.env.REDIS_URL_TESTS;
const sinRedis = url
  ? false
  : 'sin Redis: pon REDIS_URL_TESTS en test/.env (redis://localhost:6379/1) para probarlo';

// La cola de la tienda, vista desde los tests.
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

// Cada test empieza sin eventos, sin avisos guardados y con la cola vacía.
beforeEach(async () => {
  await pool.query('DELETE FROM eventos_salientes');
  await pool.query('DELETE FROM avisos');
  await cola?.obliterate({ force: true });
});

/** Encola en la cola de los tests (el Redis de REDIS_URL_TESTS), con encolar de verdad. */
const aLaColaDeTests = (trabajo: Trabajo) => encolar(trabajo, cola);

/** Crea un pedido pendiente de Carmen y devuelve su id. */
async function pedidoNuevo(): Promise<number> {
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...carmen },
    body: '{"productoId":1,"cantidad":1}',
  });
  assert.equal(res.status, 201);
  return (await res.json()).id;
}

/** La pasarela avisa de que el pedido está pagado, con un webhook firmado. */
function pagar(pedidoId: number, idEvento = `evt_${randomUUID()}`, tienda?: string) {
  const cuerpo = JSON.stringify({ id: idEvento, tipo: 'pago.completado', pedidoId });
  const peticion = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Firma': firmar(cuerpo, config.WEBHOOK_SECRET),
    },
    body: cuerpo,
  };
  return tienda
    ? fetch(`${tienda}/v2/webhooks/pagos`, peticion)
    : app.request('/v2/webhooks/pagos', peticion);
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

interface FilaSaliente {
  id: string;
  tipo: string;
  datos: Trabajo;
  enviado_en: Date | null;
}
const salientes = async (): Promise<FilaSaliente[]> =>
  (await pool.query<FilaSaliente>('SELECT * FROM eventos_salientes ORDER BY id')).rows;

/** Espera hasta que se cumpla la condición, o falla pasado el tiempo. */
async function esperar(condicion: () => boolean | Promise<boolean>, ms = 10_000, que = '') {
  const hasta = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > hasta) assert.fail(`pasados ${ms} ms, aún no: ${que}`);
    await dormir(50);
  }
}

/** Un correo para el pedido, como lo guardaría pagar. */
async function correoDe(pedidoId: number): Promise<Trabajo> {
  return { tipo: 'correo-de-confirmacion', pedido: (await buscarPedido(pedidoId))! };
}

/** Arranca un proceso de la tienda con el entorno de los tests más el que se le dé. */
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

/** Un puerto libre en 127.0.0.1. */
async function puertoLibre(): Promise<number> {
  const libre = crearServidorTcp().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as AddressInfo).port;
  libre.close();
  return puerto;
}

async function parar(proceso: ChildProcessWithoutNullStreams) {
  if (proceso.exitCode !== null || proceso.signalCode !== null) return;
  proceso.kill();
  await once(proceso, 'exit');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('pagar guarda el cambio y el evento en la misma transacción', async () => {
  const ids = [
    await guardarAviso('https://93.184.215.14/avisos'),
    await guardarAviso('https://93.184.215.15/avisos'),
  ];
  const id = await pedidoNuevo();
  const res = await pagar(id);
  assert.equal(res.status, 200);
  assert.equal((await buscarPedido(id))!.estado, 'pagado');

  // Tres eventos sin enviar: un aviso por cada URL y el correo. Nadie los ha puesto en la cola.
  const filas = await salientes();
  assert.deepEqual(filas.map((fila) => fila.tipo).sort(), [
    'aviso-de-pago',
    'aviso-de-pago',
    'correo-de-confirmacion',
  ]);
  for (const fila of filas) {
    assert.equal(fila.enviado_en, null);
    assert.equal(fila.datos.tipo, fila.tipo);
    assert.equal(fila.datos.pedido.id, id);
    assert.equal(fila.datos.pedido.estado, 'pagado');
  }
  const avisos = filas.flatMap((fila) => (fila.datos.tipo === 'aviso-de-pago' ? [fila.datos] : []));
  assert.deepEqual(avisos.map((aviso) => aviso.avisoId).sort(), ids);
  // Un solo pago: el mismo id de evento en los dos avisos.
  assert.equal(new Set(avisos.map((aviso) => aviso.idEvento)).size, 1);
  assert.match(avisos[0]!.idEvento, UUID);
  if (cola) assert.equal(await cola.count(), 0);

  // El mismo aviso de la pasarela otra vez: ni otro cambio ni otro evento.
  const otra = await pagar(id);
  assert.equal(otra.status, 200);
  assert.equal((await salientes()).length, 3);
});

test('muchos pagos a la vez no se quedan esperando una conexión', async () => {
  // Más pagos a la vez que conexiones tiene el pool (10): cada uno usa solo la de su transacción.
  const ids: number[] = [];
  for (let i = 0; i < 30; i++) ids.push(await pedidoNuevo());
  const pagos = Promise.all(ids.map((id) => pagar(id)));
  const resultado = await Promise.race([pagos, dormir(10_000, 'atascados')]);
  assert.notEqual(
    resultado,
    'atascados',
    'los pagos no terminan: el pool se ha quedado sin conexiones',
  );
  for (const res of resultado as Response[]) assert.equal(res.status, 200);
  assert.equal((await salientes()).length, 30);
});

test('si la transacción falla, no queda evento', async () => {
  // Directamente: guardar un evento y fallar después, en la misma transacción.
  const correo = await correoDe(21);
  await assert.rejects(
    bd.transaction(async (tx) => {
      await guardarSaliente(tx, correo);
      throw new Error('algo falla después');
    }),
    /algo falla después/,
  );
  assert.deepEqual(await salientes(), []);

  // Y en la ruta: si guardar el evento falla (aquí, un trigger que lo impide), el pago entero se
  // deshace. El pedido sigue pendiente y el evento de la pasarela no queda apuntado, así que cuando
  // la pasarela lo reintenta, se procesa.
  await pool.query(`
    CREATE FUNCTION impedir() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'eventos_salientes no acepta filas'; END $$;
    CREATE TRIGGER impedir BEFORE INSERT ON eventos_salientes
      FOR EACH ROW EXECUTE FUNCTION impedir();
  `);
  const id = await pedidoNuevo();
  const idEvento = `evt_${randomUUID()}`;
  try {
    const res = await pagar(id, idEvento);
    assert.equal(res.status, 500);
    assert.equal((await buscarPedido(id))!.estado, 'pendiente');
    const { rowCount } = await pool.query('SELECT 1 FROM eventos_procesados WHERE id = $1', [
      idEvento,
    ]);
    assert.equal(rowCount, 0);
    assert.deepEqual(await salientes(), []);
  } finally {
    await pool.query('DROP TRIGGER impedir ON eventos_salientes; DROP FUNCTION impedir()');
  }
  const reintento = await pagar(id, idEvento);
  assert.equal(reintento.status, 200);
  assert.deepEqual(await reintento.json(), { recibido: idEvento, repetido: false });
  assert.equal((await buscarPedido(id))!.estado, 'pagado');
  assert.equal((await salientes()).length, 1);
});

test('repartir encola los eventos y los marca enviados', { skip: sinRedis }, async () => {
  const avisoId = await guardarAviso('https://93.184.215.14/avisos');
  const id = await pedidoNuevo();
  assert.equal((await pagar(id)).status, 200);

  // De uno en uno: el límite manda.
  assert.equal(await repartir(1, aLaColaDeTests), 1);
  assert.equal(await cola.count(), 1);
  assert.equal(await repartir(50, aLaColaDeTests), 1);
  assert.equal(await repartir(50, aLaColaDeTests), 0);

  for (const fila of await salientes()) assert.ok(fila.enviado_en instanceof Date);
  const trabajos = await cola.getJobs(['waiting']);
  assert.equal(trabajos.length, 2);
  const correo = trabajos.find((t) => t.data.tipo === 'correo-de-confirmacion')!;
  const aviso = trabajos.find((t) => t.data.tipo === 'aviso-de-pago')!;
  // Cada trabajo con su id: el correo, por el pedido; el aviso, por el pago y la URL.
  assert.equal(correo.id, `correo-${id}`);
  assert.ok(aviso.data.tipo === 'aviso-de-pago');
  assert.equal(aviso.id, `aviso-${aviso.data.idEvento}-${avisoId}`);
  assert.equal(correo.opts.attempts, 5);
});

test('si Redis no contesta o falla, repartir no marca nada', async () => {
  const id = await pedidoNuevo();
  assert.equal((await pagar(id)).status, 200);

  // Redis falla: la transacción se deshace, y el evento sigue sin enviar.
  await assert.rejects(
    repartir(50, async () => {
      throw new Error('Redis caído');
    }),
    /Redis caído/,
  );
  assert.equal((await salientes())[0]!.enviado_en, null);

  // Redis no contesta: repartir no espera más de ESPERA_COLA.
  const inicio = performance.now();
  await assert.rejects(
    repartir(50, () => new Promise(() => {})),
    /no contesta/,
  );
  const tardado = performance.now() - inicio;
  assert.ok(tardado >= ESPERA_COLA - 50 && tardado < ESPERA_COLA + 1000, `${tardado} ms`);
  assert.equal((await salientes())[0]!.enviado_en, null);

  // La fila no se ha quedado bloqueada: la siguiente vuelta la coge.
  const apuntados: Trabajo[] = [];
  assert.equal(await repartir(50, async (trabajo) => void apuntados.push(trabajo)), 1);
  assert.equal(apuntados.length, 1);
  assert.ok((await salientes())[0]!.enviado_en instanceof Date);
});

test('con Redis lento, cada vuelta apunta lo que ha llegado y la siguiente sigue', async () => {
  // 50 eventos, y una cola que tarda 100 ms en cada uno: en ESPERA_COLA (2 s) no caben todos.
  const base = (await buscarPedido(21))!;
  await bd.transaction(async (tx) => {
    for (let i = 1; i <= 50; i++) {
      await guardarSaliente(tx, {
        tipo: 'correo-de-confirmacion',
        pedido: { ...base, id: 1000 + i },
      });
    }
  });
  const enCola = new Set<number>();
  const lenta = async (trabajo: Trabajo) => {
    await dormir(100);
    enCola.add(trabajo.pedido.id);
  };
  const enviados = async () =>
    (await salientes()).filter((fila) => fila.enviado_en !== null).map((f) => f.datos.pedido.id);

  let vueltas = 0;
  let antes = 0;
  while (antes < 50) {
    assert.ok(++vueltas <= 5, `${antes} de 50 tras ${vueltas - 1} vueltas`);
    const repartidos = await repartir(50, lenta);
    const ahora = (await enviados()).length;
    // Cada vuelta avanza, y apunta exactamente lo que ha llegado a la cola en esa vuelta.
    assert.ok(repartidos > 0, `la vuelta ${vueltas} no ha apuntado ninguno`);
    assert.equal(ahora, antes + repartidos);
    // Nunca se apunta como enviado lo que no ha llegado a la cola.
    for (const id of await enviados())
      assert.ok(enCola.has(id), `${id} apuntado sin estar en la cola`);
    antes = ahora;
  }
  assert.ok(vueltas >= 2, 'con 100 ms por evento, no caben 50 en una vuelta');
});

test('dos repartidores no cogen el mismo evento', async () => {
  for (const pedidoId of [21, 22, 23, 24, 25, 1]) {
    const correo = await correoDe(pedidoId);
    await bd.transaction((tx) => guardarSaliente(tx, correo));
  }
  // El primero coge tres y se queda esperando (Redis va lento) con ellas bloqueadas.
  let soltar = () => {};
  const suelta = new Promise<void>((resolver) => (soltar = resolver));
  let empezado = () => {};
  const haEmpezado = new Promise<void>((resolver) => (empezado = resolver));
  const delPrimero: number[] = [];
  const primero = repartir(3, async (trabajo) => {
    delPrimero.push(trabajo.pedido.id);
    empezado();
    await suelta;
  });
  await haEmpezado;

  // El segundo, a la vez: se salta las tres bloqueadas (SKIP LOCKED) y coge las otras tres.
  const delSegundo: number[] = [];
  assert.equal(await repartir(50, async (trabajo) => void delSegundo.push(trabajo.pedido.id)), 3);
  // Y un tercero ya no encuentra nada libre.
  assert.equal(await repartir(50, async () => assert.fail('no queda ninguno')), 0);

  soltar();
  assert.equal(await primero, 3);
  assert.equal(delPrimero.length, 3);
  assert.deepEqual(
    [...delPrimero, ...delSegundo].sort((a, b) => a - b),
    [1, 21, 22, 23, 24, 25],
  );
  assert.ok((await salientes()).every((fila) => fila.enviado_en !== null));
});

test('el repartidor no se solapa consigo mismo y para cuando se le dice', async () => {
  await bd.transaction(async (tx) => guardarSaliente(tx, await correoDe(21)));
  // Cada vuelta tarda 150 ms y falla (el evento sigue sin enviar), y empieza otra cada 20 ms.
  let aLaVez = 0;
  let maximo = 0;
  let vueltas = 0;
  const repartidor = repartirCadaSegundo(async () => {
    aLaVez++;
    vueltas++;
    maximo = Math.max(maximo, aLaVez);
    await dormir(150);
    aLaVez--;
    throw new Error('Redis caído');
  }, 20);
  await esperar(() => vueltas >= 3, 5000, 'tres vueltas');
  await repartidor.parar();
  // parar() espera a la vuelta que está a medias, y después no empieza ninguna.
  assert.equal(aLaVez, 0);
  const hechas = vueltas;
  await dormir(200);
  assert.equal(vueltas, hechas);
  assert.equal(maximo, 1);
  assert.equal((await salientes())[0]!.enviado_en, null);
});

test('si la API se cae después de pagar, el correo llega igual', { skip: sinRedis }, async () => {
  const id = await pedidoNuevo();
  // La API de verdad, con Redis: paga y, en cuanto contesta, se la mata (SIGKILL: sin apagarse
  // bien). Antes (pasos 37 a 40), lo que no hubiera llegado a la cola se perdía aquí.
  const puerto = await puertoLibre();
  const api = arrancar('src/servidor.ts', { PORT: String(puerto), REDIS_URL: url! });
  try {
    await esperar(() => api.salida().includes('La tienda escucha'), 10_000, 'la API arranca');
    const res = await pagar(id, undefined, `http://127.0.0.1:${puerto}`);
    assert.equal(res.status, 200);
    api.proceso.kill('SIGKILL');
    await once(api.proceso, 'exit');
  } finally {
    await parar(api.proceso);
  }
  // La API no ha puesto nada en la cola: el correo está en eventos_salientes, sin enviar.
  assert.equal(await cola.count(), 0);
  assert.equal((await salientes())[0]!.enviado_en, null);

  // El trabajador lo reparte al arrancar, y hace el trabajo (sin SMTP_URL, el log lo dice).
  const trabajador = arrancar('scripts/trabajador.ts', { REDIS_URL: url! });
  try {
    await esperar(
      async () => (await cola.getJob(`correo-${id}`))?.finishedOn !== undefined,
      10_000,
      'el correo, hecho',
    );
    assert.equal(await (await cola.getJob(`correo-${id}`))!.getState(), 'completed');
    assert.ok((await salientes())[0]!.enviado_en instanceof Date);
    assert.match(trabajador.salida(), new RegExp(`"pedidoId":${id}[,}].*sin SMTP_URL`));
    // Y se apaga bien: el repartidor para, como el trabajador.
    trabajador.proceso.kill('SIGTERM');
    const [codigo] = await once(trabajador.proceso, 'exit');
    assert.equal(codigo, 0, trabajador.salida());
  } finally {
    await parar(trabajador.proceso);
  }
});

test('un evento repartido dos veces no manda dos correos', { skip: sinRedis }, async () => {
  await guardarAviso('https://93.184.215.14/avisos');
  const id = await pedidoNuevo();
  assert.equal((await pagar(id)).status, 200);

  // El repartidor pone los dos trabajos en la cola y se cae antes del COMMIT: los eventos siguen
  // sin enviar, y la siguiente vuelta los vuelve a encolar.
  let vez = 0;
  await assert.rejects(
    repartir(50, async (trabajo) => {
      await aLaColaDeTests(trabajo);
      if (++vez === 2) throw new Error('el repartidor se cae');
    }),
    /se cae/,
  );
  assert.equal(await cola.count(), 2);
  assert.equal(await repartir(50, aLaColaDeTests), 2);
  // El mismo id de trabajo: BullMQ no apunta el segundo.
  assert.equal(await cola.count(), 2);

  // Y aunque el trabajo ya esté hecho: BullMQ guarda los 1000 últimos hechos, y con ellos su id.
  const trabajador = crearTrabajador({ url });
  try {
    await esperar(
      async () => (await cola.getJob(`correo-${id}`))?.finishedOn !== undefined,
      10_000,
      'el correo, hecho',
    );
  } finally {
    await trabajador.cerrar();
  }
  await pool.query('UPDATE eventos_salientes SET enviado_en = NULL');
  assert.equal(await repartir(50, aLaColaDeTests), 2);
  const correos = (
    await cola.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'])
  ).filter((t) => t.data.tipo === 'correo-de-confirmacion');
  assert.equal(correos.length, 1);
  assert.equal(await correos[0]!.getState(), 'completed');
  assert.equal(correos[0]!.attemptsMade, 1);
});

test('un aviso repetido llega con el mismo X-Id-Evento', { skip: sinRedis }, async () => {
  // La empresa de reparto, de mentira, en 127.0.0.1: apunta lo que recibe y contesta 204.
  const recibidas: IncomingMessage['headers'][] = [];
  const servidor = createServer((peticion, respuesta) => {
    recibidas.push(peticion.headers);
    peticion.resume();
    respuesta.writeHead(204).end();
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const puerto = (servidor.address() as AddressInfo).port;
  await guardarAviso(`http://127.0.0.1:${puerto}/avisos`);
  const id = await pedidoNuevo();
  assert.equal((await pagar(id)).status, 200);
  const [aviso] = (await salientes()).filter((fila) => fila.tipo === 'aviso-de-pago');
  assert.ok(aviso?.datos.tipo === 'aviso-de-pago');

  const trabajador = crearTrabajador({ url, opciones: { hostsDeDesarrollo: ['127.0.0.1'] } });
  try {
    assert.equal(await repartir(50, aLaColaDeTests), 2);
    await esperar(() => recibidas.length === 1, 10_000, 'el aviso llega');
    // BullMQ ya no recuerda el trabajo (los 1000 últimos hechos se han ido, por ejemplo), y el
    // evento se reparte otra vez: la empresa recibe el aviso dos veces, con el mismo X-Id-Evento,
    // y por él sabe que es el mismo.
    const hecho = (await cola.getJobs(['completed'])).find((t) => t.data.tipo === 'aviso-de-pago')!;
    await esperar(async () => (await hecho.getState()) === 'completed', 5000, 'hecho');
    await hecho.remove();
    await pool.query('UPDATE eventos_salientes SET enviado_en = NULL WHERE id = $1', [aviso.id]);
    assert.equal(await repartir(50, aLaColaDeTests), 1);
    await esperar(() => recibidas.length === 2, 10_000, 'el aviso repetido llega');
    assert.equal(recibidas[0]!['x-id-evento'], aviso.datos.idEvento);
    assert.equal(recibidas[1]!['x-id-evento'], aviso.datos.idEvento);
  } finally {
    await trabajador.cerrar();
    servidor.closeAllConnections();
    servidor.close();
  }
});
