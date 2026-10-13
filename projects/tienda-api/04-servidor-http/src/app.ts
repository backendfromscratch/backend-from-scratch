// El servidor, sin framework: solo el módulo node:http que trae Node.js.
// #region importar
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { buscarPedido, buscarProducto, crearPedido, pedidos, productos } from './datos.ts';
// #endregion importar

// #region responder
function enviarJson(res: ServerResponse, estado: number, datos: unknown, cabeceras = {}) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras });
  res.end(JSON.stringify(datos));
}

function metodoNoPermitido(res: ServerResponse, permitidos: string) {
  enviarJson(res, 405, { error: 'Método no permitido' }, { Allow: permitidos });
}
// #endregion responder

// #region leer-cuerpo
// El cuerpo llega en trozos (es un stream): se juntan todos antes de leerlo.
async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const trozo of req) trozos.push(trozo);
  return Buffer.concat(trozos).toString('utf8');
}
// #endregion leer-cuerpo

// #region rutas
// #region rutas-principio
async function manejar(req: IncomingMessage, res: ServerResponse) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tienda de Ana y Luis. Prueba /productos y /pedidos.\n');
    return;
  }

  if (pathname === '/productos') {
    if (req.method !== 'GET') return metodoNoPermitido(res, 'GET');
    return enviarJson(res, 200, productos);
  }
  // #endregion rutas-principio

  // #region rutas-final
  // #region rutas-producto
  const ruta = pathname.match(/^\/productos\/(\d+)$/);
  if (ruta) {
    if (req.method !== 'GET') return metodoNoPermitido(res, 'GET');
    const producto = buscarProducto(Number(ruta[1]));
    if (!producto) return enviarJson(res, 404, { error: 'No existe ese producto' });
    return enviarJson(res, 200, producto);
  }
  // #endregion rutas-producto

  // #region rutas-pedidos
  if (pathname === '/pedidos') {
    if (req.method === 'GET') return enviarJson(res, 200, pedidos);
    if (req.method !== 'POST') return metodoNoPermitido(res, 'GET, POST');
    return nuevoPedido(req, res);
  }

  const rutaPedido = pathname.match(/^\/pedidos\/(\d+)$/);
  if (rutaPedido) {
    if (req.method !== 'GET') return metodoNoPermitido(res, 'GET');
    const pedido = buscarPedido(Number(rutaPedido[1]));
    if (!pedido) return enviarJson(res, 404, { error: 'No existe ese pedido' });
    return enviarJson(res, 200, pedido);
  }

  enviarJson(res, 404, { error: 'No existe esa ruta' });
}
// #endregion rutas-pedidos
// #endregion rutas-final
// #endregion rutas

// #region nuevo-pedido
async function nuevoPedido(req: IncomingMessage, res: ServerResponse) {
  let datos: { productoId: number; cantidad: number };
  try {
    // «as» le promete a TypeScript una forma que nadie ha comprobado: lo arregla la lección 7.
    datos = JSON.parse(await leerCuerpo(req)) as { productoId: number; cantidad: number };
  } catch {
    return enviarJson(res, 400, { error: 'El cuerpo no es un JSON válido' });
  }
  // El JSON se ha leído bien, pero pide algo que no existe: 422 (Fase 2, lección 3).
  if (!buscarProducto(datos.productoId)) {
    return enviarJson(res, 422, { error: 'No existe ese producto' });
  }
  const pedido = crearPedido(datos.productoId, datos.cantidad);
  enviarJson(res, 201, pedido, { Location: `/pedidos/${pedido.id}` });
}
// #endregion nuevo-pedido

// #region crear-servidor
export function crearServidor() {
  return createServer((req, res) => {
    manejar(req, res).catch(() => enviarJson(res, 500, { error: 'Error interno del servidor' }));
  });
}
// #endregion crear-servidor
