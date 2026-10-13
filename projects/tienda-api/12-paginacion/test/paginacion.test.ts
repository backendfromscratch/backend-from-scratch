import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { crearCursor, leerCursor } from '../src/paginacion.ts';

interface Pedido {
  id: number;
  estado: string;
}

/** Pide una página y devuelve sus pedidos y la URL de la siguiente (la de la cabecera Link). */
async function pagina(url: string): Promise<{ pedidos: Pedido[]; siguiente?: string }> {
  const res = await app.request(url);
  assert.equal(res.status, 200, url);
  const enlace = res.headers.get('link');
  const siguiente = enlace?.match(/^<(.+)>; rel="next"$/)?.[1];
  return { pedidos: await res.json(), siguiente };
}

const ids = (pedidos: Pedido[]) => pedidos.map((pedido) => pedido.id);

test('sin nada: los 10 más nuevos primero, y un Link a la página siguiente', async () => {
  const { pedidos, siguiente } = await pagina('/pedidos');
  assert.deepEqual(ids(pedidos), [25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
  assert.equal(siguiente, `http://localhost/pedidos?cursor=${crearCursor(16)}`);
});

test('el cursor es opaco: el id en base64url, que el servidor sabe leer', () => {
  assert.equal(crearCursor(16), 'MTY');
  assert.equal(leerCursor('MTY'), 16);
});

test('siguiendo Link se recorren los 25 pedidos, sin repetir ni saltarse ninguno', async () => {
  const vistos: number[] = [];
  let url: string | undefined = '/pedidos?limite=10';
  let paginas = 0;
  while (url) {
    const { pedidos, siguiente } = await pagina(url);
    vistos.push(...ids(pedidos));
    url = siguiente;
    paginas++;
  }
  assert.equal(paginas, 3);
  assert.deepEqual(
    vistos,
    Array.from({ length: 25 }, (_, i) => 25 - i),
  );
});

test('el filtro por estado se mantiene en el enlace a la página siguiente', async () => {
  const primera = await pagina('/pedidos?estado=enviado&limite=5');
  assert.ok(primera.pedidos.every((pedido) => pedido.estado === 'enviado'));
  assert.deepEqual(ids(primera.pedidos), [12, 11, 10, 9, 8]);
  assert.match(primera.siguiente!, /estado=enviado/);
  assert.match(primera.siguiente!, /limite=5/);
  const segunda = await pagina(primera.siguiente!);
  assert.deepEqual(ids(segunda.pedidos), [7, 6, 5, 4, 3]);
});

test('con desplazamiento, el enlace lleva el desplazamiento siguiente', async () => {
  const { pedidos, siguiente } = await pagina('/pedidos?limite=5&desplazamiento=20');
  assert.deepEqual(ids(pedidos), [5, 4, 3, 2, 1]);
  assert.equal(siguiente, undefined, 'la última página no tiene siguiente');
  const otra = await pagina('/pedidos?limite=5&desplazamiento=5');
  assert.equal(otra.siguiente, 'http://localhost/pedidos?limite=5&desplazamiento=10');
});

test('lo que no vale en la query string: 422, con cada campo', async () => {
  const casos = [
    ['/pedidos?limite=0', 'limite', 'Como mínimo, 1'],
    ['/pedidos?limite=500', 'limite', 'Como máximo, 50'],
    ['/pedidos?cursor=esto-no-es-un-cursor', 'cursor', 'El cursor no es válido'],
    ['/pedidos?estado=perdido', 'estado', 'Tiene que ser pendiente, pagado, enviado o cancelado'],
    ['/pedidos?cursor=MTY&desplazamiento=10', 'cursor', 'Usa cursor o desplazamiento, no los dos'],
    ['/productos?orden=nombre', 'orden', 'Tiene que ser precio o -precio'],
  ];
  for (const [url, campo, problema] of casos) {
    const res = await app.request(url!);
    assert.equal(res.status, 422, url);
    assert.deepEqual((await res.json()).errores, [{ campo, problema }], url);
  }
});

test('los productos, ordenados por precio en los dos sentidos y filtrados', async () => {
  const precios = async (url: string) =>
    (await (await app.request(url)).json()).map((producto: { precio: number }) => producto.precio);
  assert.deepEqual(await precios('/productos?orden=precio'), [8.5, 20, 35]);
  assert.deepEqual(await precios('/productos?orden=-precio'), [35, 20, 8.5]);
  assert.deepEqual(await precios('/productos?orden=-precio&max=30'), [20, 8.5]);
});

// Los dos últimos tests crean pedidos: van al final para no cambiar lo que ven los de arriba.
const nuevoPedido = () =>
  app.request('/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"productoId":1,"cantidad":1}',
  });

test('con desplazamiento, un pedido que llega entre dos páginas hace que uno salga dos veces', async () => {
  const primera = await pagina('/pedidos?limite=5&desplazamiento=0');
  await nuevoPedido();
  const segunda = await pagina(primera.siguiente!);
  assert.equal(segunda.pedidos[0]!.id, primera.pedidos.at(-1)!.id, 'el último se repite');
});

test('con cursor, el pedido que llega entre dos páginas no cambia la siguiente', async () => {
  const primera = await pagina('/pedidos?limite=5');
  await nuevoPedido();
  const segunda = await pagina(primera.siguiente!);
  assert.equal(segunda.pedidos[0]!.id, primera.pedidos.at(-1)!.id - 1, 'sigue justo después');
});
