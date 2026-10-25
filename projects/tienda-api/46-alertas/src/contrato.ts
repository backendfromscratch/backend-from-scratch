// El contrato de la versión 2: cada ruta, con lo que recibe y lo que puede responder. Con esto
// se valida cada petición y se escribe la documentación (/v2/openapi.json): las dos cosas salen
// de los mismos esquemas, así que no se pueden contradecir.
import { createRoute, z } from '@hono/zod-openapi';
import {
  esquemaAcuse,
  esquemaAviso,
  esquemaAvisoGuardado,
  esquemaCambioPedido,
  esquemaCambioProducto,
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
  esquemaYo,
} from './esquemas.ts';
import { idempotencia } from './middleware/idempotencia.ts';
import { exigirIdentidad } from './middleware/sesion.ts';
import { exigir } from './permisos.ts';
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
// Lo que responde cualquier ruta con cuerpo antes de mirar sus campos: un JSON mal escrito, 400, o
// un cuerpo que no dice que es JSON, 415. Y una petición con la cookie de otra web, 403 (CSRF).
// Faltaban en el contrato: lo vio la validación de las respuestas (lección 3 de la Fase 10).
const cuerpoNoLeido = conProblema('El cuerpo no es un JSON bien escrito');
const cuerpoNoJson = conProblema('El cuerpo no dice que es JSON (Content-Type: application/json)');
const deOtraWeb = conProblema('La petición viene de otra web y usa tu sesión: no se acepta');
const conLocation = {
  Location: { description: 'La URL del recurso nuevo', schema: { type: 'string' as const } },
};

// #region con-sesion
// Las rutas que piden identificarse: con la cookie de la sesión o con Authorization: Bearer (el id
// de una sesión o una clave de API). El permiso que hace falta lo comprueba exigir (permisos.ts),
// en middleware, antes de validar nada más: si no sabe quién eres, 401; si no puedes, 403.
const conSesion: { [nombre: string]: string[] }[] = [{ Sesion: [] }, { Bearer: [] }];
const sinIdentidad = conProblema('No sabe quién eres: inicia sesión o usa tu clave de API');
const sinPermiso = conProblema('Sabe quién eres, y no tienes permiso para esto');
// #endregion con-sesion

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

// Crear y borrar productos: solo quien tiene productos:gestionar (admin). Antes era un token
// compartido (ADMIN_TOKEN); ahora, el rol de la cuenta de cada persona.
export const crearProducto = createRoute({
  method: 'post',
  path: '/productos',
  tags: ['Productos'],
  summary: 'Crea un producto',
  security: conSesion,
  middleware: [exigir('productos:gestionar')] as const,
  request: { body: cuerpo(esquemaProductoNuevo) },
  responses: {
    201: { ...enJson(esquemaProducto, 'El producto creado'), headers: conLocation },
    401: sinIdentidad,
    403: sinPermiso,
    400: cuerpoNoLeido,
    415: cuerpoNoJson,
    422: datosNoValidos,
  },
});

export const borrarProducto = createRoute({
  method: 'delete',
  path: '/productos/{id}',
  tags: ['Productos'],
  summary: 'Borra un producto',
  security: conSesion,
  middleware: [exigir('productos:gestionar')] as const,
  request: { params: esquemaId },
  responses: {
    204: { description: 'Borrado: no hay nada más que contar' },
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese producto'),
    409: conProblema('El producto tiene pedidos: no se puede borrar'),
    422: datosNoValidos,
  },
});

// #region cambiar-producto
// Cambiar el nombre o el precio de un producto (Fase 9): como crearlo y borrarlo, solo admin.
export const cambiarProducto = createRoute({
  method: 'patch',
  path: '/productos/{id}',
  tags: ['Productos'],
  summary: 'Cambia el nombre o el precio de un producto',
  security: conSesion,
  middleware: [exigir('productos:gestionar')] as const,
  request: { params: esquemaId, body: cuerpo(esquemaCambioProducto) },
  responses: {
    200: enJson(esquemaProducto, 'El producto, cambiado'),
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese producto'),
    400: cuerpoNoLeido,
    415: cuerpoNoJson,
    422: datosNoValidos,
  },
});
// #endregion cambiar-producto

// Ver pedidos: un cliente, los suyos; reparto y admin, todos.
const verPedidos = exigir('pedidos:ver-propios', 'pedidos:ver-todos');

export const listarPedidos = createRoute({
  method: 'get',
  path: '/pedidos',
  tags: ['Pedidos'],
  summary: 'Una página de pedidos (los tuyos, si eres cliente), del más nuevo al más antiguo',
  security: conSesion,
  middleware: [verPedidos] as const,
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
    401: sinIdentidad,
    403: sinPermiso,
    422: datosNoValidos,
  },
});

export const verPedido = createRoute({
  method: 'get',
  path: '/pedidos/{id}',
  tags: ['Pedidos'],
  summary: 'Un pedido',
  security: conSesion,
  middleware: [verPedidos] as const,
  request: { params: esquemaId },
  responses: {
    200: enJson(esquemaPedido, 'El pedido'),
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese pedido, o no es tuyo'),
    422: datosNoValidos,
  },
});

// Con Idempotency-Key, repetir la petición no crea otro pedido: devuelve la misma respuesta.
// Hacer un pedido pide una sesión de cliente: el pedido es suyo. exigir va antes que idempotencia,
// que guarda cada clave con la cuenta que la usó.
export const crearPedido = createRoute({
  method: 'post',
  path: '/pedidos',
  tags: ['Pedidos'],
  summary: 'Crea un pedido',
  security: conSesion,
  middleware: [exigir('pedidos:crear'), idempotencia] as const,
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
    401: sinIdentidad,
    403: sinPermiso,
    409: conProblema('No queda bastante stock de ese producto'),
    400: cuerpoNoLeido,
    415: cuerpoNoJson,
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
  security: conSesion,
  middleware: [verPedidos] as const,
  request: { params: esquemaId },
  responses: {
    200: {
      description: 'Un evento «estado» con el pedido de ahora y, después, uno por cada cambio',
      content: { 'text/event-stream': { schema: z.string() } },
    },
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese pedido, o no es tuyo'),
    422: datosNoValidos,
  },
});
// #endregion seguir-pedido

// Cambiar la cantidad o cancelar: un cliente, sus pedidos; admin, cualquiera.
const cambiarPedidos = exigir('pedidos:cambiar-propios', 'pedidos:cambiar-todos');

export const cambiarPedido = createRoute({
  method: 'patch',
  path: '/pedidos/{id}',
  tags: ['Pedidos'],
  summary: 'Cambia la cantidad de un pedido pendiente',
  security: conSesion,
  middleware: [cambiarPedidos] as const,
  request: { params: esquemaId, body: cuerpo(esquemaCambioPedido) },
  responses: {
    200: enJson(esquemaPedido, 'El pedido, cambiado'),
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese pedido, o no es tuyo'),
    409: conProblema('El pedido ya no está pendiente, o no queda bastante stock'),
    400: cuerpoNoLeido,
    415: cuerpoNoJson,
    422: datosNoValidos,
  },
});

export const cancelarPedido = createRoute({
  method: 'post',
  path: '/pedidos/{id}/cancelacion',
  tags: ['Pedidos'],
  summary: 'Cancela un pedido que aún no se ha enviado',
  security: conSesion,
  middleware: [cambiarPedidos] as const,
  request: { params: esquemaId },
  responses: {
    200: enJson(esquemaPedido, 'El pedido, cancelado'),
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese pedido, o no es tuyo'),
    409: conProblema('El pedido ya está enviado'),
    422: datosNoValidos,
  },
});

// #region enviar-pedido
// La empresa de reparto marca un pedido pagado como enviado. Una ruta nueva, para el permiso
// pedidos:enviar: reparto y admin.
export const enviarPedido = createRoute({
  method: 'post',
  path: '/pedidos/{id}/envio',
  tags: ['Pedidos'],
  summary: 'Marca un pedido pagado como enviado',
  security: conSesion,
  middleware: [exigir('pedidos:enviar')] as const,
  request: { params: esquemaId },
  responses: {
    200: enJson(esquemaPedido, 'El pedido, enviado'),
    401: sinIdentidad,
    403: sinPermiso,
    404: conProblema('No existe ese pedido'),
    409: conProblema('El pedido no está pagado'),
    422: datosNoValidos,
  },
});
// #endregion enviar-pedido

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
    400: conProblema('La firma no es válida, o el cuerpo no es un JSON bien escrito'),
    403: deOtraWeb,
    415: cuerpoNoJson,
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
    400: cuerpoNoLeido,
    403: deOtraWeb,
    415: cuerpoNoJson,
    422: datosNoValidos,
    429: conProblema('Demasiados intentos: espera lo que dice Retry-After'),
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
    400: conProblema(
      'El email o la contraseña no son correctos, o el cuerpo no es un JSON bien escrito',
    ),
    403: deOtraWeb,
    415: cuerpoNoJson,
    422: datosNoValidos,
    429: conProblema('Demasiados intentos: espera lo que dice Retry-After'),
    // Desde la Fase 10 (lección 6): los límites no pueden preguntar a Redis y se cierran.
    503: conProblema('No se pueden comprobar los intentos: espera lo que dice Retry-After'),
  },
});

export const cerrarSesion = createRoute({
  method: 'delete',
  path: '/sesion',
  tags: ['Sesión'],
  summary: 'Cierra la sesión',
  responses: {
    204: { description: 'Sesión cerrada: la cookie, borrada' },
    403: deOtraWeb,
  },
});

// Quién soy: la cuenta de la sesión (en la cookie o como Bearer) o la clave de API (como Bearer).

export const verYo = createRoute({
  method: 'get',
  path: '/yo',
  tags: ['Sesión'],
  summary: 'Quién eres: tu cuenta o tu clave de API',
  security: conSesion,
  middleware: [exigirIdentidad] as const,
  responses: {
    200: enJson(esquemaYo, 'Tu cuenta, o tu clave'),
    401: sinIdentidad,
  },
});
// #endregion sesion

// #region proveedor
// Iniciar sesión con el proveedor de identidad (lección 4): dos rutas, la ida y la vuelta. Las dos
// las abre el navegador, no un programa: responden con redirecciones.
const conDestino = (description: string) => ({
  description,
  headers: {
    Location: { description: 'A dónde va el navegador', schema: { type: 'string' as const } },
  },
});

export const inicioConProveedor = createRoute({
  method: 'get',
  path: '/sesion/proveedor',
  tags: ['Sesión'],
  summary: 'Inicia sesión con el proveedor de identidad: manda el navegador allí',
  responses: {
    302: conDestino('Al proveedor, con el state, el nonce y el reto PKCE'),
    404: conProblema('La tienda no tiene proveedor de identidad'),
  },
});

export const vueltaDelProveedor = createRoute({
  method: 'get',
  path: '/sesion/proveedor/vuelta',
  tags: ['Sesión'],
  summary: 'La vuelta del proveedor: comprueba la respuesta e inicia la sesión',
  request: {
    query: z.object({ code: z.string().optional(), state: z.string().optional() }),
  },
  responses: {
    303: conDestino('A /v2/yo, con la sesión ya en la cookie'),
    400: conProblema('La respuesta del proveedor no vale, o no la empezó este navegador'),
    404: conProblema('La tienda no tiene proveedor de identidad'),
    409: conProblema('Ya hay una cuenta con ese email, y el proveedor no dice que sea tuyo'),
  },
});
// #endregion proveedor

// #region configurar-aviso
export const configurarAviso = createRoute({
  method: 'put',
  path: '/reparto/aviso',
  tags: ['Reparto'],
  summary: 'La URL a la que avisar de cada pedido pagado',
  security: conSesion,
  middleware: [exigir('avisos:configurar')] as const,
  request: { body: cuerpo(esquemaAviso) },
  responses: {
    200: enJson(esquemaAvisoGuardado, 'Guardada, con el secreto de las firmas'),
    401: sinIdentidad,
    403: sinPermiso,
    400: cuerpoNoLeido,
    415: cuerpoNoJson,
    422: datosNoValidos,
  },
});
// #endregion configurar-aviso
