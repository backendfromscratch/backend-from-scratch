// El contrato de la versión 2: cada ruta, con lo que recibe y lo que puede responder. Con esto
// se valida cada petición y se escribe la documentación (/v2/openapi.json): las dos cosas salen
// de los mismos esquemas, así que no se pueden contradecir.
import { createRoute, z } from '@hono/zod-openapi';
import {
  esquemaAcuse,
  esquemaCambioPedido,
  esquemaCredenciales,
  esquemaCuentaNueva,
  esquemaEventoPago,
  esquemaFiltro,
  esquemaId,
  esquemaListaPedidos,
  esquemaPedido,
  esquemaPedidoNuevo,
  esquemaProblema,
  esquemaProducto,
  esquemaProductoNuevo,
  esquemaUsuario,
} from './esquemas.ts';
import { idempotencia } from './middleware/idempotencia.ts';
import { exigirIdentidad } from './middleware/sesion.ts';
import { soloAdmin } from './middleware/solo-admin.ts';
import { verificarFirma } from './middleware/verificar-firma.ts';

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
    409: conProblema('El producto tiene pedidos: no se puede borrar'),
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

// Con Idempotency-Key, repetir la petición no crea otro pedido: devuelve la misma respuesta.
export const crearPedido = createRoute({
  method: 'post',
  path: '/pedidos',
  tags: ['Pedidos'],
  summary: 'Crea un pedido',
  middleware: [idempotencia] as const,
  request: {
    headers: z.object({
      'idempotency-key': z.string().optional().openapi({ example: 'b1c2d3e4-pedido-de-ana' }),
    }),
    body: cuerpo(esquemaPedidoNuevo),
  },
  responses: {
    201: {
      ...enJson(esquemaPedido, 'El pedido creado (o el mismo, si se repite la clave)'),
      headers: conLocation,
    },
    409: conProblema('No queda bastante stock de ese producto'),
    422: datosNoValidos,
  },
});

// #region seguir-pedido
// Server-Sent Events: una respuesta que no termina. El tipo de contenido, text/event-stream.
export const seguirPedido = createRoute({
  method: 'get',
  path: '/pedidos/{id}/eventos',
  tags: ['Pedidos'],
  summary: 'Los cambios de estado de un pedido, en directo',
  request: { params: esquemaId },
  responses: {
    200: {
      description: 'Un evento «estado» con el pedido de ahora y, después, uno por cada cambio',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    404: conProblema('No existe ese pedido'),
    422: datosNoValidos,
  },
});
// #endregion seguir-pedido

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

// El webhook: la pasarela de pago llama aquí cuando se paga un pedido. verificarFirma va antes
// que todo lo demás: un aviso sin una firma válida no se lee.
export const recibirPago = createRoute({
  method: 'post',
  path: '/webhooks/pagos',
  tags: ['Webhooks'],
  summary: 'La pasarela de pago avisa de un pago',
  middleware: [verificarFirma] as const,
  request: {
    headers: z.object({ 'x-firma': z.string().openapi({ example: 'sha256=5f2b…' }) }),
    body: cuerpo(esquemaEventoPago),
  },
  responses: {
    200: enJson(esquemaAcuse, 'Recibido'),
    400: conProblema('La firma no es válida'),
    422: datosNoValidos,
  },
});

// #region crear-cuenta
// Darse de alta. El email repetido es un 409; una contraseña que no cumple las reglas, el 422 de
// siempre, con el motivo en «errores».
export const crearCuenta = createRoute({
  method: 'post',
  path: '/cuentas',
  tags: ['Cuentas'],
  summary: 'Crea una cuenta',
  request: { body: cuerpo(esquemaCuentaNueva) },
  responses: {
    201: { ...enJson(esquemaUsuario, 'La cuenta creada'), headers: conLocation },
    409: conProblema('Ya hay una cuenta con ese email'),
    422: datosNoValidos,
  },
});
// #endregion crear-cuenta

// #region sesion
// Iniciar sesión: si el email y la contraseña valen, 200 con la cuenta y la cookie en Set-Cookie.
// Si no, 400: es lo que responde OAuth 2.0 a una contraseña mala (RFC 6749, invalid_grant). Un 401
// diría «identifícate con WWW-Authenticate», y esta ruta no pide identificarse: es donde se hace.
export const iniciarSesion = createRoute({
  method: 'post',
  path: '/sesion',
  tags: ['Sesión'],
  summary: 'Inicia sesión',
  request: { body: cuerpo(esquemaCredenciales) },
  responses: {
    200: {
      ...enJson(esquemaUsuario, 'La cuenta; la sesión va en la cookie'),
      headers: {
        'Set-Cookie': {
          description: 'sesion=<id>; HttpOnly; Secure; SameSite=Lax',
          schema: { type: 'string' as const },
        },
      },
    },
    400: conProblema('El email o la contraseña no son correctos'),
    422: datosNoValidos,
  },
});

export const cerrarSesion = createRoute({
  method: 'delete',
  path: '/sesion',
  tags: ['Sesión'],
  summary: 'Cierra la sesión',
  responses: { 204: { description: 'Sesión cerrada: la cookie, borrada' } },
});

// Quién soy: la cuenta de la sesión. Vale la cookie o Authorization: Bearer <id>.
const conSesion: { [nombre: string]: string[] }[] = [{ Sesion: [] }, { Bearer: [] }];
const sinSesion = conProblema('No has iniciado sesión, o la sesión ha caducado');

export const verYo = createRoute({
  method: 'get',
  path: '/yo',
  tags: ['Sesión'],
  summary: 'La cuenta con la que has iniciado sesión',
  security: conSesion,
  middleware: [exigirIdentidad] as const,
  responses: {
    200: enJson(esquemaUsuario, 'Tu cuenta'),
    401: sinSesion,
  },
});
// #endregion sesion
