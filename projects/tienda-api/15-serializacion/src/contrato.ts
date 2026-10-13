// El contrato de la versión 2: cada ruta, con lo que recibe y lo que puede responder. Con esto
// se valida cada petición y se escribe la documentación (/v2/openapi.json): las dos cosas salen
// de los mismos esquemas, así que no se pueden contradecir.
import { createRoute, z } from '@hono/zod-openapi';
import {
  esquemaCambioPedido,
  esquemaFiltro,
  esquemaId,
  esquemaListaPedidos,
  esquemaPedido,
  esquemaPedidoNuevo,
  esquemaProblema,
  esquemaProducto,
  esquemaProductoNuevo,
} from './esquemas.ts';
import { soloAdmin } from './middleware/solo-admin.ts';

// #region piezas
// Piezas que se repiten: una respuesta en JSON y una respuesta de error (Problem Details).
function enJson<Esquema extends z.ZodType>(schema: Esquema, description: string) {
  return { description, content: { 'application/json': { schema } } };
}

function conProblema(description: string) {
  return { description, content: { 'application/problem+json': { schema: esquemaProblema } } };
}

// Un cuerpo JSON obligatorio: sin required, una petición sin cuerpo no se validaría.
function cuerpo<Esquema extends z.ZodType>(schema: Esquema) {
  return { required: true, content: { 'application/json': { schema } } };
}

const datosNoValidos = conProblema('Los datos no son válidos: «errores» dice qué falla');
const sinToken = conProblema('Falta el token de administración, o no es válido');
const conLocation = {
  Location: { description: 'La URL del recurso nuevo', schema: { type: 'string' as const } },
};
// #endregion piezas

// #region ver-producto
export const verProducto = createRoute({
  method: 'get',
  path: '/productos/{id}',
  tags: ['Productos'],
  summary: 'Un producto',
  request: { params: esquemaId },
  responses: {
    200: enJson(esquemaProducto, 'El producto'),
    404: conProblema('No existe ese producto'),
    422: datosNoValidos,
  },
});
// #endregion ver-producto

export const listarProductos = createRoute({
  method: 'get',
  path: '/productos',
  tags: ['Productos'],
  summary: 'Los productos, filtrados y ordenados',
  request: { query: esquemaFiltro },
  responses: {
    200: enJson(z.array(esquemaProducto), 'Los productos'),
    422: datosNoValidos,
  },
});

// #region crear-producto
// security dice en la documentación que hace falta un token; middleware lo comprueba antes de
// validar el cuerpo, como antes.
export const crearProducto = createRoute({
  method: 'post',
  path: '/productos',
  tags: ['Productos'],
  summary: 'Crea un producto',
  security: [{ Bearer: [] }],
  middleware: [soloAdmin] as const,
  request: { body: cuerpo(esquemaProductoNuevo) },
  responses: {
    201: { ...enJson(esquemaProducto, 'El producto creado'), headers: conLocation },
    401: sinToken,
    422: datosNoValidos,
  },
});
// #endregion crear-producto

export const borrarProducto = createRoute({
  method: 'delete',
  path: '/productos/{id}',
  tags: ['Productos'],
  summary: 'Borra un producto',
  security: [{ Bearer: [] }],
  middleware: [soloAdmin] as const,
  request: { params: esquemaId },
  responses: {
    204: { description: 'Borrado: no hay nada más que contar' },
    401: sinToken,
    404: conProblema('No existe ese producto'),
    422: datosNoValidos,
  },
});

export const listarPedidos = createRoute({
  method: 'get',
  path: '/pedidos',
  tags: ['Pedidos'],
  summary: 'Una página de pedidos, del más nuevo al más antiguo',
  request: { query: esquemaListaPedidos },
  responses: {
    200: {
      ...enJson(z.array(esquemaPedido), 'Los pedidos de esta página'),
      headers: {
        Link: {
          description: 'Si hay más, la URL de la página siguiente (rel="next")',
          schema: { type: 'string' as const },
        },
      },
    },
    422: datosNoValidos,
  },
});

export const verPedido = createRoute({
  method: 'get',
  path: '/pedidos/{id}',
  tags: ['Pedidos'],
  summary: 'Un pedido',
  request: { params: esquemaId },
  responses: {
    200: enJson(esquemaPedido, 'El pedido'),
    404: conProblema('No existe ese pedido'),
    422: datosNoValidos,
  },
});

export const crearPedido = createRoute({
  method: 'post',
  path: '/pedidos',
  tags: ['Pedidos'],
  summary: 'Crea un pedido',
  request: { body: cuerpo(esquemaPedidoNuevo) },
  responses: {
    201: { ...enJson(esquemaPedido, 'El pedido creado'), headers: conLocation },
    422: datosNoValidos,
  },
});

export const cambiarPedido = createRoute({
  method: 'patch',
  path: '/pedidos/{id}',
  tags: ['Pedidos'],
  summary: 'Cambia la cantidad de un pedido pendiente',
  request: { params: esquemaId, body: cuerpo(esquemaCambioPedido) },
  responses: {
    200: enJson(esquemaPedido, 'El pedido, cambiado'),
    404: conProblema('No existe ese pedido'),
    409: conProblema('El pedido ya no está pendiente'),
    422: datosNoValidos,
  },
});

export const cancelarPedido = createRoute({
  method: 'post',
  path: '/pedidos/{id}/cancelacion',
  tags: ['Pedidos'],
  summary: 'Cancela un pedido que aún no se ha enviado',
  request: { params: esquemaId },
  responses: {
    200: enJson(esquemaPedido, 'El pedido, cancelado'),
    404: conProblema('No existe ese pedido'),
    409: conProblema('El pedido ya está enviado'),
    422: datosNoValidos,
  },
});
