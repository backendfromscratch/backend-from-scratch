// El apagado de la API (Fase 9, lección 4), src/apagado.ts: deja de aceptar conexiones, termina
// las peticiones que tiene a medias, cierra los flujos de eventos y los WebSocket, y después la
// base de datos y Redis, todo como mucho en un límite. Los primeros tests usan un servidor HTTP
// de prueba en este mismo proceso; el último arranca la API de verdad (src/servidor.ts) y le manda
// SIGTERM, como docker stop.
// apagando() no tiene vuelta atrás: en cuanto un test llama a apagar, este proceso se está
// apagando para el resto del fichero. Por eso el de /salud va primero.
import assert from 'node:assert/strict';
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type RequestListener, type Server } from 'node:http';
import { type AddressInfo, connect, createServer as crearServidorTcp } from 'node:net';
import { test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import { apagando, apagar } from '../src/apagado.ts';
import { app } from '../src/app.ts';
import { usarBd } from './bd.ts';
import { ANA, comoUsuario } from './identidades.ts';

// Ana, admin: puede seguir cualquier pedido.
let ana: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
});

/** Un servidor HTTP en un puerto libre de 127.0.0.1, que atiende con esa función. */
async function servidorDePrueba(atender: RequestListener) {
  const servidor: Server = createServer(atender);
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const puerto = (servidor.address() as AddressInfo).port;
  return { servidor, puerto, url: `http://127.0.0.1:${puerto}` };
}

/** Una promesa que se cumple cuando se llama a llegar(): para saber que la petición ya está dentro. */
function aviso() {
  let llegar!: () => void;
  const llegada = new Promise<void>((resolver) => (llegar = resolver));
  return { llegar, llegada };
}

test('al apagarse, /salud contesta 503', { timeout: 15_000 }, async () => {
  assert.equal(apagando(), false);
  assert.equal((await app.request('/salud')).status, 200);
  const { servidor } = await servidorDePrueba((_peticion, respuesta) => respuesta.end());
  await apagar(servidor, [], 1000);
  assert.equal(apagando(), true);
  // La base de datos sigue contestando, pero esta copia se va: Docker y desplegar.sh lo leen así.
  const res = await app.request('/salud');
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('content-type'), 'application/problem+json');
  assert.equal((await res.json()).detail, 'La tienda se está apagando');
  // Las dos de la lección 6 de la Fase 10, igual: esta copia ni está viva para mucho ni está lista.
  assert.equal((await app.request('/salud/viva')).status, 503);
  const lista = await app.request('/salud/lista');
  assert.equal(lista.status, 503);
  assert.equal((await lista.json()).estado, 'apagando');
});

test('deja de aceptar conexiones nuevas', { timeout: 15_000 }, async () => {
  const { servidor, puerto, url } = await servidorDePrueba((_peticion, respuesta) =>
    respuesta.end('ok'),
  );
  // fetch deja la conexión abierta para la siguiente petición (keep-alive): apagar la cierra, sin
  // esperar a que el cliente la suelte.
  assert.equal((await fetch(url)).status, 200);
  const antes = Date.now();
  await apagar(servidor, [], 5000);
  assert.ok(Date.now() - antes < 1000, 'sin esperar a la conexión que no hacía nada');
  const error = await new Promise<NodeJS.ErrnoException | undefined>((resolver) => {
    const conexion = connect(puerto, '127.0.0.1');
    conexion.on('error', resolver);
    conexion.on('connect', () => {
      conexion.destroy();
      resolver(undefined);
    });
  });
  // Rechazada: el puerto ya no escucha. nginx, con la conexión rechazada, pasa a la otra copia,
  // aunque sea un POST, siempre que Docker no ponga docker-proxy delante (README): el proxy la
  // aceptaría y la cortaría después, y nginx no repite un POST que ya ha mandado.
  assert.equal(error?.code, 'ECONNREFUSED');
});

test('espera a la petición que está a medias y la termina', { timeout: 15_000 }, async () => {
  const { llegar, llegada } = aviso();
  const { servidor, url } = await servidorDePrueba(async (_peticion, respuesta) => {
    llegar();
    await dormir(300);
    respuesta.end('pedido guardado');
  });
  // Un POST, como pagar un pedido: si se cortara a la mitad, nginx no lo repetiría (Fase 8).
  const peticion = fetch(url, { method: 'POST', body: '{}' }).then(async (res) => ({
    estado: res.status,
    cuerpo: await res.text(),
  }));
  await llegada;
  const antes = Date.now();
  await apagar(servidor, [], 5000);
  const tardo = Date.now() - antes;
  assert.deepEqual(await peticion, { estado: 200, cuerpo: 'pedido guardado' });
  assert.ok(tardo >= 250, `esperó a la petición (${tardo} ms)`);
  // Y nada más: la conexión keep-alive de fetch se cierra en cuanto la respuesta ha salido.
  assert.ok(tardo < 1500, `sin esperar al límite (${tardo} ms)`);
});

test(
  'lo que llega por una conexión abierta mientras se apaga sale con Connection: close',
  { timeout: 15_000 },
  async () => {
    const { llegar, llegada } = aviso();
    // La primera petición tarda; la segunda se contesta en el acto, sin esperar a nada.
    const { servidor, puerto } = await servidorDePrueba(async (peticion, respuesta) => {
      if (peticion.url === '/lenta') {
        llegar();
        await dormir(200);
      }
      respuesta.end('ok');
    });
    // Una petición lenta, y por la misma conexión, cuando ya se está apagando, otra (HTTP/1.1
    // deja mandar la siguiente sin esperar a la respuesta).
    const conexion = connect(puerto, '127.0.0.1');
    let recibido = '';
    conexion.on('data', (trozo) => (recibido += trozo));
    conexion.write('GET /lenta HTTP/1.1\r\nHost: x\r\n\r\n');
    await llegada;
    const apagado = apagar(servidor, [], 5000);
    conexion.write('GET /rapida HTTP/1.1\r\nHost: x\r\n\r\n');
    await apagado;
    if (!conexion.closed) await once(conexion, 'close');
    // Las dos, contestadas; la segunda, avisando de que la conexión se cierra.
    const respuestas = recibido.split('HTTP/1.1 ').filter(Boolean);
    assert.equal(respuestas.length, 2, recibido);
    assert.match(respuestas[0]!, /^200 /);
    assert.match(respuestas[1]!, /^200 [^]*\r\nConnection: close\r\n/i);
  },
);

test('cierra la base de datos y Redis después de las peticiones', { timeout: 15_000 }, async () => {
  const sucesos: string[] = [];
  const { llegar, llegada } = aviso();
  const { servidor, url } = await servidorDePrueba(async (_peticion, respuesta) => {
    llegar();
    await dormir(200);
    sucesos.push('respuesta');
    respuesta.end();
  });
  /** Un recurso de mentira, que apunta cuándo empieza a cerrarse y cuándo ha terminado. */
  const recurso = (nombre: string, falla = false) => ({
    async cerrar() {
      sucesos.push(`${nombre}: empieza`);
      await dormir(20);
      if (falla) throw new Error(`${nombre} no se cierra`);
      sucesos.push(`${nombre}: cerrado`);
    },
  });
  const peticion = fetch(url).then((res) => res.text());
  await llegada;
  // La cola falla al cerrarse: los que van detrás se cierran igual.
  await apagar(
    servidor,
    [recurso('bd'), recurso('cola', true), recurso('avisos'), recurso('cache')],
    5000,
  );
  await peticion;
  // Uno detrás de otro, en ese orden, y ninguno antes de que la petición haya terminado.
  assert.deepEqual(sucesos, [
    'respuesta',
    'bd: empieza',
    'bd: cerrado',
    'cola: empieza',
    'avisos: empieza',
    'avisos: cerrado',
    'cache: empieza',
    'cache: cerrado',
  ]);
});

test('no espera más que el límite', { timeout: 15_000 }, async () => {
  const { llegar, llegada } = aviso();
  // Una petición que no termina nunca.
  const { servidor, url } = await servidorDePrueba(() => llegar());
  const peticion = fetch(url).then(
    () => 'contestada',
    () => 'cortada',
  );
  await llegada;
  // Y un recurso que no termina de cerrarse nunca (un Redis colgado que no contesta).
  const llamados: string[] = [];
  const recursos = [
    { cerrar: () => new Promise<void>(() => llamados.push('colgado')) },
    { cerrar: async () => void llamados.push('siguiente') },
  ];
  const antes = Date.now();
  await apagar(servidor, recursos, 300);
  const tardo = Date.now() - antes;
  assert.ok(tardo >= 290 && tardo < 800, `${tardo} ms`);
  // Pasado el límite, la petición se corta, y a todos los recursos se les pide que se cierren.
  assert.equal(await peticion, 'cortada');
  assert.deepEqual(llamados, ['colgado', 'siguiente']);
});

/** Un puerto libre en 127.0.0.1. */
async function puertoLibre(): Promise<number> {
  const libre = crearServidorTcp().listen(0, '127.0.0.1');
  await once(libre, 'listening');
  const puerto = (libre.address() as AddressInfo).port;
  libre.close();
  await once(libre, 'close');
  return puerto;
}

/** La API de verdad (src/servidor.ts) en un puerto libre, sin Redis; vuelve cuando ya escucha. */
async function arrancarApi() {
  const puerto = await puertoLibre();
  const { REDIS_URL: _r, SMTP_URL: _s, CACHE_URL: _c, ...base } = process.env;
  const proceso: ChildProcessWithoutNullStreams = spawn('node', ['src/servidor.ts'], {
    env: { ...base, LOG_LEVEL: 'info', PORT: String(puerto) },
  });
  let salida = '';
  proceso.stdout.on('data', (trozo) => (salida += trozo));
  proceso.stderr.on('data', (trozo) => (salida += trozo));
  const hasta = Date.now() + 10_000;
  while (!salida.includes('La tienda escucha')) {
    if (Date.now() > hasta) {
      proceso.kill();
      assert.fail(`la API no arranca: ${salida}`);
    }
    await dormir(20);
  }
  return { proceso, salida: () => salida, puerto };
}

test('al apagarse, cierra los flujos de eventos y los WebSocket', { timeout: 15_000 }, async () => {
  const api = await arrancarApi();
  try {
    // Ana sigue el pedido 7 (Server-Sent Events): la respuesta empieza y no termina.
    const res = await fetch(`http://127.0.0.1:${api.puerto}/v2/pedidos/7/eventos`, {
      headers: ana,
    });
    assert.equal(res.status, 200);
    const lector = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    assert.match((await lector.read()).value!, /event: estado/);
    // Y alguien habla con el eco por WebSocket: otra conexión que no termina.
    const ws = new WebSocket(`ws://127.0.0.1:${api.puerto}/eco`);
    const saludo = once(ws, 'message');
    await once(ws, 'open');
    await saludo;
    const cierre = once(ws, 'close');

    const antes = Date.now();
    api.proceso.kill('SIGTERM');
    // El flujo termina bien (done), no cortado: EventSource se conectaría otra vez, a la otra copia.
    let leido = await lector.read();
    while (!leido.done) leido = await lector.read();
    // El WebSocket se cierra con 1001, «me voy» (Going Away): el cliente puede volver a conectarse.
    const [evento] = (await cierre) as [CloseEvent];
    assert.equal(evento.code, 1001);
    assert.equal(evento.reason, 'La tienda se apaga');
    const [codigo] = await once(api.proceso, 'exit');
    assert.equal(codigo, 0, api.salida());
    // Sin esperar a los 8 segundos del límite: no quedaba nada a medias.
    assert.ok(Date.now() - antes < 3000, `${Date.now() - antes} ms`);
    assert.match(api.salida(), /SIGTERM: la tienda se apaga/);
  } finally {
    if (api.proceso.exitCode === null) {
      api.proceso.kill('SIGKILL');
      await once(api.proceso, 'exit');
    }
  }
});
