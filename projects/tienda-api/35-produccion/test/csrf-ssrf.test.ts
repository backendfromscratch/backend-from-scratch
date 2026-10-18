import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { paginaDeOtraWeb } from '../scripts/otra-web.ts';
import { app } from '../src/app.ts';
import { avisarDePago } from '../src/avisos.ts';
import { pool } from '../src/bd.ts';
import { buscarPedido } from '../src/datos.ts';
import { firmar } from '../src/firma.ts';
import { comprobarUrl, enviarJson, type Resolver } from '../src/url-segura.ts';
import { usarBd } from './bd.ts';
import { CARMEN, comoReparto, comoUsuario } from './identidades.ts';

// Carmen, clienta, con su sesión en la cookie; y la clave de la empresa de reparto.
let carmen: Record<string, string>;
let reparto: Record<string, string>;
usarBd(async () => {
  carmen = await comoUsuario(CARMEN);
  reparto = await comoReparto();
});

const OTRA_WEB = 'http://127.0.0.1:4000';

/** Un resolver de mentira: cada nombre, con las direcciones que se le digan. Nada sale al DNS. */
const resolviendoA =
  (...direcciones: string[]): Resolver =>
  async () =>
    direcciones.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

test('CSRF: un formulario de otra web con la cookie de la sesión: 403; desde la tienda, pasa', async () => {
  const formulario = (cabeceras: Record<string, string>) =>
    app.request('/v2/pedidos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: carmen.Cookie!,
        ...cabeceras,
      },
      body: 'productoId=1&cantidad=10',
    });
  const deFuera = await formulario({ Origin: OTRA_WEB });
  assert.equal(deFuera.status, 403);
  assert.equal(
    (await deFuera.json()).detail,
    'La petición viene de otra web y usa tu sesión: no se acepta',
  );
  // Sin Origin ni Sec-Fetch-Site tampoco: no se sabe de dónde viene.
  assert.equal((await formulario({})).status, 403);
  // Desde la propia tienda pasa la comprobación (y la ruta, que espera JSON, responde 415).
  assert.equal((await formulario({ Origin: 'http://localhost:3000' })).status, 415);
  assert.equal((await formulario({ 'Sec-Fetch-Site': 'same-origin' })).status, 415);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM pedidos WHERE cantidad = 10');
  assert.equal(rows[0].n, 0, 'no se ha hecho ningún pedido');
});

test('CSRF: cancelar con la cookie y sin Origin, 403; con Bearer, que el navegador no pone solo, sí', async () => {
  // El 21, pendiente, es de Carmen.
  const conCookie = await app.request('/v2/pedidos/21/cancelacion', {
    method: 'POST',
    headers: { Cookie: carmen.Cookie! },
  });
  assert.equal(conCookie.status, 403);
  assert.equal((await buscarPedido(21))!.estado, 'pendiente');
  const id = carmen.Cookie!.replace('sesion=', '');
  const conBearer = await app.request('/v2/pedidos/21/cancelacion', {
    method: 'POST',
    headers: { Authorization: `Bearer ${id}` },
  });
  assert.equal(conBearer.status, 200);
});

test('CSRF: un POST con JSON y la cookie sí pasa: otra web no puede mandarlo sin que CORS lo pregunte', async () => {
  const res = await app.request('/v2/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: carmen.Cookie! },
    body: '{"productoId":1,"cantidad":1}',
  });
  assert.equal(res.status, 201);
});

test('scripts/otra-web.ts: la página manda un formulario y un fetch a la tienda', async () => {
  const pagina = String(await paginaDeOtraWeb('http://localhost:3000'));
  assert.match(pagina, /<form method="post" action="http:\/\/localhost:3000\/v2\/pedidos">/);
  assert.match(pagina, /credentials: 'include'/);
});

test('SSRF: http, localhost, los metadatos de la nube, un nombre que apunta a 127.0.0.1, ::1… rechazados', async () => {
  const casos: [string, Resolver | undefined, RegExp][] = [
    ['http://localhost/avisos', undefined, /https:\/\//],
    ['http://169.254.169.254/latest/meta-data/', undefined, /https:\/\//],
    ['https://169.254.169.254/latest/meta-data/', undefined, /interna \(169\.254\.169\.254\)/],
    ['https://avisos.trampa.example/', resolviendoA('127.0.0.1'), /interna \(127\.0\.0\.1\)/],
    ['https://mitad.trampa.example/', resolviendoA('93.184.215.14', '10.0.0.5'), /interna/],
    ['https://[::1]/avisos', undefined, /interna \(::1\)/],
    ['https://[::ffff:127.0.0.1]/', undefined, /interna/],
    ['https://[fd00::5]/', undefined, /interna/],
    ['https://192.168.1.1/', undefined, /interna/],
    ['https://ana:secreto@reparto.example/', undefined, /usuario ni contraseña/],
    ['no es una url', undefined, /No es una URL/],
  ];
  for (const [url, resolver, motivo] of casos) {
    const resultado = await comprobarUrl(url, { resolver, hostsDeDesarrollo: [] });
    assert.ok('error' in resultado, url);
    assert.match(resultado.error, motivo, url);
  }
});

test('SSRF: una dirección pública se acepta, y es a la que se conectará', async () => {
  const resultado = await comprobarUrl('https://reparto.example/avisos', {
    resolver: resolviendoA('93.184.215.14'),
    hostsDeDesarrollo: [],
  });
  assert.ok(!('error' in resultado));
  assert.deepEqual(resultado.direccion, { address: '93.184.215.14', family: 4 });
  assert.equal(resultado.url.href, 'https://reparto.example/avisos');
});

/** Un servidor en 127.0.0.1 que responde lo que se le diga y apunta lo que recibe. */
async function servidorDePrueba(
  responder: (peticion: IncomingMessage, cuerpo: string) => [number, Record<string, string>],
) {
  const recibidas: { cabeceras: IncomingMessage['headers']; cuerpo: string }[] = [];
  const servidor = createServer(async (peticion, respuesta) => {
    let cuerpo = '';
    for await (const trozo of peticion) cuerpo += trozo;
    recibidas.push({ cabeceras: peticion.headers, cuerpo });
    const [status, cabeceras] = responder(peticion, cuerpo);
    respuesta.writeHead(status, cabeceras).end();
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const url = `http://localhost:${(servidor.address() as AddressInfo).port}/avisos`;
  return { servidor, url, recibidas };
}

// En desarrollo, localhost se permite (hostsDeDesarrollo), y el nombre se resuelve aquí mismo.
const enDesarrollo = { hostsDeDesarrollo: ['localhost'], resolver: resolviendoA('127.0.0.1') };

test('SSRF: una redirección no se sigue', async () => {
  const { servidor, url } = await servidorDePrueba(() => [
    302,
    { Location: 'http://169.254.169.254/latest/meta-data/' },
  ]);
  try {
    const resultado = await enviarJson(url, '{}', {}, enDesarrollo);
    assert.deepEqual(resultado, { error: 'Responde 302, una redirección: no se sigue' });
  } finally {
    servidor.close();
  }
});

test('el aviso de un pedido pagado llega firmado a la URL de la empresa de reparto', async () => {
  const { servidor, url, recibidas } = await servidorDePrueba(() => [204, {}]);
  try {
    const { rows } = await pool.query('SELECT id FROM claves_api LIMIT 1');
    await pool.query(
      `INSERT INTO avisos (clave_id, url, secreto) VALUES ($1, $2, 'secreto-de-prueba')`,
      [rows[0].id, url],
    );
    const pedido = (await buscarPedido(13))!;
    // Sin permitir localhost, no sale: http y una dirección interna.
    await avisarDePago(pedido, { hostsDeDesarrollo: [] });
    assert.equal(recibidas.length, 0);
    await avisarDePago(pedido, enDesarrollo);
    assert.equal(recibidas.length, 1);
    const [{ cabeceras, cuerpo }] = recibidas as [(typeof recibidas)[0]];
    assert.deepEqual(JSON.parse(cuerpo), { tipo: 'pedido.pagado', pedido });
    assert.equal(cabeceras['x-firma'], firmar(cuerpo, 'secreto-de-prueba'));
  } finally {
    servidor.close();
    await pool.query('DELETE FROM avisos');
  }
});

test('PUT /v2/reparto/aviso: la clave de reparto guarda una URL pública; una interna, 422', async () => {
  const guardar = (cabeceras: Record<string, string>, url: string) =>
    app.request('/v2/reparto/aviso', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...cabeceras },
      body: JSON.stringify({ url }),
    });
  // Una dirección escrita tal cual: no hay que preguntar al DNS, ni se conecta a ella.
  const res = await guardar(reparto, 'https://93.184.215.14/avisos');
  assert.equal(res.status, 200);
  const { url, secreto } = await res.json();
  assert.equal(url, 'https://93.184.215.14/avisos');
  assert.match(secreto, /^[\w-]{43}$/);
  const { rows } = await pool.query('SELECT url, secreto FROM avisos');
  assert.deepEqual(rows, [{ url, secreto }]);

  const interna = await guardar(reparto, 'https://169.254.169.254/latest/meta-data/');
  assert.equal(interna.status, 422);
  assert.equal((await interna.json()).errores[0].campo, 'url');
  assert.equal((await guardar(carmen, 'https://93.184.215.14/')).status, 403);
  assert.equal((await guardar({}, 'https://93.184.215.14/')).status, 401);
  await pool.query('DELETE FROM avisos');
});
