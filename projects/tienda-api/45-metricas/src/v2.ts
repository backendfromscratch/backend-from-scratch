// La versión 2 de la API: los precios, en céntimos enteros (precioCentimos). Cada ruta sale de
// su definición en el contrato (contrato.ts): OpenAPIHono valida la petición con sus esquemas y
// apunta la ruta en la documentación.
import { randomUUID } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { alApagar } from './apagado.ts';
import { avisosGuardados, guardarAviso } from './avisos.ts';
import { bd } from './bd.ts';
import * as contrato from './contrato.ts';
import {
  apuntarEvento,
  borrarProducto,
  buscarPedido,
  buscarProducto,
  actualizarProducto,
  cambiarCantidad,
  cambiarEstado,
  cambiarEstadoEn,
  cancelarPedido,
  crearPedido,
  crearProducto,
  listarProductos,
  type Pedido,
} from './datos.ts';
import type { Entorno } from './entorno.ts';
import { cambiosDePedidos } from './eventos-pedidos.ts';
import {
  demasiadosIntentos,
  type Estado,
  ipDe,
  type Limitador,
  limites,
  ponerCabeceras,
} from './limites.ts';
import { abrirSesion, cerrarSesion } from './middleware/sesion.ts';
import { siNoEsValido } from './middleware/validar.ts';
import { metricas } from './metricas.ts';
import { enlaceSiguiente, paginaPorCursor, paginaPorDesplazamiento } from './paginacion.ts';
import { type Permiso, puede } from './permisos.ts';
import { datosNoValidos, problema, problemaHttp, tipo } from './problemas.ts';
import {
  empezarInicio,
  type InicioGuardado,
  proveedorConfigurado,
  terminarInicio,
  urlDeVuelta,
} from './proveedor.ts';
import { guardarSaliente } from './salientes.ts';
import { comprobarUrl } from './url-segura.ts';
import { comprobarCredenciales, crearUsuario, usuarioDelProveedor } from './usuarios.ts';

// defaultHook: lo que se responde si la petición no cumple el esquema. El mismo 422 de siempre.
// Entorno: lo que los middleware dejan en c.var (quién ha iniciado sesión).
export const v2 = new OpenAPIHono<Entorno>({ defaultHook: siNoEsValido });

// Cómo se manda el token, para la documentación: Authorization: Bearer <token>. El token es una
// clave de API o el id de una sesión.
v2.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
});

// Y la sesión, que viaja en la cookie «sesion».
v2.openAPIRegistry.registerComponent('securitySchemes', 'Sesion', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sesion',
});

// El filtro y el orden ya los hace PostgreSQL (datos.ts): solo devuelve los productos que valen.
v2.openapi(contrato.listarProductos, async (c) => {
  return c.json(await listarProductos(c.req.valid('query')), 200);
});

// TypeScript comprueba cada respuesta contra el contrato: un 404 que no estuviera en él, o un
// c.json sin el código, no compilaría.
v2.openapi(contrato.verProducto, async (c) => {
  const producto = await buscarProducto(c.req.valid('param').id);
  if (!producto) return problemaHttp(c, 404, 'No existe ese producto');
  return c.json(producto, 200);
});

v2.openapi(contrato.crearProducto, async (c) => {
  const { nombre, precioCentimos } = c.req.valid('json');
  const producto = await crearProducto(nombre, precioCentimos);
  return c.json(producto, 201, { Location: `${c.req.path}/${producto.id}` });
});

// Si el producto tiene pedidos, borrarProducto lanza un error de PostgreSQL y onError (app.ts)
// responde un 409.
v2.openapi(contrato.borrarProducto, async (c) => {
  if (!(await borrarProducto(c.req.valid('param').id))) {
    return problemaHttp(c, 404, 'No existe ese producto');
  }
  return c.body(null, 204);
});

// #region cambiar-producto
// Cambiar un producto: lo cambia en PostgreSQL y lo borra de la caché (datos.ts), así que la
// próxima lectura ya da el nuevo.
v2.openapi(contrato.cambiarProducto, async (c) => {
  const producto = await actualizarProducto(c.req.valid('param').id, c.req.valid('json'));
  if (!producto) return problemaHttp(c, 404, 'No existe ese producto');
  return c.json(producto, 200);
});
// #endregion cambiar-producto

// #region listar-pedidos
// Una página de pedidos, del más nuevo al más antiguo. Si hay más, la cabecera Link dice dónde
// está la siguiente. ?desplazamiento= se queda para comparar las dos formas de paginar.
// #region solo-los-suyos
// Un cambio que rompe, a propósito y sin aviso: hasta la lección 5, cualquiera veía todos los
// pedidos de todos los clientes. Un cambio así se anunciaba antes (Deprecation y Sunset, Fase 4),
// pero esto era un agujero de seguridad: se cierra en cuanto se ve, también en /v1. La comodidad
// de quien usaba la API nunca pesa más que los datos de los clientes.
v2.openapi(contrato.listarPedidos, async (c) => {
  const { limite, cursor, desplazamiento, estado } = c.req.valid('query');
  // Con pedidos:ver-todos, todos; si no (un cliente, con ver-propios), solo los de su cuenta.
  const clienteId = puede(c, 'pedidos:ver-todos') ? undefined : c.var.usuario!.id;
  // #endregion solo-los-suyos

  if (desplazamiento !== undefined) {
    const { pagina, siguiente } = await paginaPorDesplazamiento(
      limite,
      desplazamiento,
      estado,
      clienteId,
    );
    if (siguiente !== undefined) {
      c.header('Link', enlaceSiguiente(c.req.url, 'desplazamiento', String(siguiente)));
    }
    return c.json(pagina, 200);
  }

  const { pagina, siguiente } = await paginaPorCursor(limite, cursor, estado, clienteId);
  if (siguiente !== undefined) c.header('Link', enlaceSiguiente(c.req.url, 'cursor', siguiente));
  return c.json(pagina, 200);
});
// #endregion listar-pedidos

// #region pedido-visible
// Un pedido, si quien pregunta puede verlo o cambiarlo: con el permiso de «todos», cualquiera; si
// no, solo uno suyo. Es la comprobación que más APIs olvidan (BOLA, la primera del OWASP API
// Top 10): pedir /v2/pedidos/7, luego el 8, el 9… y ver los de otros. Si no es suyo, la ruta
// responde 404, como si no existiera: un 403 le diría que ese pedido existe.
async function pedidoVisible(c: Context<Entorno>, id: number, todos: Permiso) {
  const pedido = await buscarPedido(id);
  if (pedido === undefined) return undefined;
  if (puede(c, todos) || pedido.clienteId === c.var.usuario?.id) return pedido;
  return undefined;
}

v2.openapi(contrato.verPedido, async (c) => {
  const pedido = await pedidoVisible(c, c.req.valid('param').id, 'pedidos:ver-todos');
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  return c.json(pedido, 200);
});
// #endregion pedido-visible

// #region crear-pedido
// Un producto que no existe es un dato que no vale: el mismo 422 que la validación, con el campo.
// Si no queda bastante stock, 409: la petición está bien, pero choca con lo que hay en la tienda.
// El pedido es de quien ha iniciado sesión: exigir('pedidos:crear') solo deja pasar a un cliente,
// y un cliente siempre es una persona.
v2.openapi(contrato.crearPedido, async (c) => {
  const { productoId, cantidad } = c.req.valid('json');
  const resultado = await crearPedido(productoId, cantidad, c.var.usuario!.id);
  if ('error' in resultado) {
    if (resultado.error === 'no-existe') {
      return datosNoValidos(c, [{ campo: 'productoId', problema: 'No existe ese producto' }]);
    }
    return problema(c, {
      type: tipo('sin-stock'),
      title: 'No queda bastante stock',
      status: 409,
      detail: `Pides ${cantidad} y quedan ${resultado.quedan}`,
    });
  }
  const { pedido } = resultado;
  return c.json(pedido, 201, { Location: `${c.req.path}/${pedido.id}` });
});
// #endregion crear-pedido

// Un tipo propio de la tienda: la petición está bien escrita, pero el estado del pedido no deja
// hacerla. title es siempre el mismo; detail dice qué pasa con este pedido.
function estadoNoLoPermite(c: Context, detail: string) {
  return problema(c, {
    type: tipo('estado-del-pedido'),
    title: 'El estado del pedido no lo permite',
    status: 409,
    detail,
  });
}

v2.openapi(contrato.cambiarPedido, async (c) => {
  const pedido = await pedidoVisible(c, c.req.valid('param').id, 'pedidos:cambiar-todos');
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  if (pedido.estado !== 'pendiente') {
    return estadoNoLoPermite(c, `El pedido está ${pedido.estado}: ya no se puede cambiar`);
  }
  // Pedir más unidades quita stock, y pedir menos lo devuelve (datos.ts). En detail van las
  // unidades que se piden de más, no la cantidad nueva: son las que tendría que haber en el stock.
  const resultado = await cambiarCantidad(pedido.id, c.req.valid('json').cantidad);
  if ('error' in resultado) {
    if (resultado.error === 'estado') {
      return estadoNoLoPermite(c, `El pedido está ${resultado.estado}: ya no se puede cambiar`);
    }
    return problema(c, {
      type: tipo('sin-stock'),
      title: 'No queda bastante stock',
      status: 409,
      detail: `Pides ${resultado.mas} más y quedan ${resultado.quedan}`,
    });
  }
  return c.json(resultado.pedido, 200);
});

v2.openapi(contrato.cancelarPedido, async (c) => {
  const pedido = await pedidoVisible(c, c.req.valid('param').id, 'pedidos:cambiar-todos');
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  if (pedido.estado === 'enviado') {
    return estadoNoLoPermite(c, 'El pedido ya está enviado: no se puede cancelar');
  }
  // Cancelar devuelve el stock (datos.ts). cancelarPedido solo cancela uno pendiente o pagado: si
  // lo han enviado entretanto, devuelve el pedido sin cambiar, y la respuesta es el mismo 409.
  const cancelado = await cancelarPedido(pedido.id);
  if (cancelado.estado !== 'cancelado') {
    return estadoNoLoPermite(c, `El pedido ya está ${cancelado.estado}: no se puede cancelar`);
  }
  return c.json(cancelado, 200);
});

// #region enviar-pedido
// Solo se envía un pedido pagado. Quien lo pide (reparto o admin) puede ver todos los pedidos.
v2.openapi(contrato.enviarPedido, async (c) => {
  const pedido = await buscarPedido(c.req.valid('param').id);
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');
  if (pedido.estado !== 'pagado') {
    return estadoNoLoPermite(c, `El pedido está ${pedido.estado}: solo se envía uno pagado`);
  }
  // Solo si sigue pagado, en el mismo UPDATE: si lo han cancelado entretanto, el mismo 409.
  const enviado = await cambiarEstado(pedido.id, 'enviado', 'pagado');
  if (!enviado) {
    const ahora = (await buscarPedido(pedido.id))!;
    return estadoNoLoPermite(c, `El pedido está ${ahora.estado}: solo se envía uno pagado`);
  }
  return c.json(enviado, 200);
});
// #endregion enviar-pedido

// #region recibir-pago
// Para cuando llega aquí, la firma ya está comprobada y el evento cumple su esquema. La respuesta
// tiene que ser rápida: si la pasarela no recibe un 2xx a tiempo, reintenta. Por eso el trabajo
// largo (los avisos a la empresa de reparto, el correo) se deja para después (Fase 9).
// Desde la lección 7, todo en una transacción: apuntar el evento de la pasarela, pasar el pedido a
// pagado y guardar lo que hay que hacer después (salientes.ts). O las tres cosas, o ninguna. La
// ruta ya no habla con Redis: los trabajos los pone en la cola el repartidor, en el trabajador.
v2.openapi(contrato.recibirPago, async (c) => {
  const evento = c.req.valid('json');
  const pedido = await buscarPedido(evento.pedidoId);
  if (!pedido) {
    return datosNoValidos(c, [{ campo: 'pedidoId', problema: 'No existe ese pedido' }]);
  }
  const resultado = await bd.transaction(async (tx) => {
    // El mismo evento otra vez: se acusa recibo y no se hace nada más.
    if (!(await apuntarEvento(evento.id, tx))) return 'repetido';
    // Solo un pedido pendiente pasa a pagado: uno cancelado sigue cancelado.
    const pagado = await cambiarEstadoEn(tx, pedido.id, 'pagado', 'pendiente');
    if (!pagado) return 'sin-cambios';
    // Para después: un aviso por cada URL de reparto (si una falla, solo esa se reintenta) y el
    // correo. Un id para este pago, el mismo en todos los avisos y en cada reintento: con él, la
    // empresa reconoce un aviso repetido.
    const idEvento = randomUUID();
    for (const avisoId of await avisosGuardados(tx)) {
      await guardarSaliente(tx, { tipo: 'aviso-de-pago', avisoId, pedido: pagado, idEvento });
    }
    await guardarSaliente(tx, { tipo: 'correo-de-confirmacion', pedido: pagado });
    return pagado;
  });
  if (resultado === 'repetido') return c.json({ recibido: evento.id, repetido: true }, 200);
  // Después del COMMIT, a quien sigue el pedido (como hace cambiarEstado).
  if (resultado !== 'sin-cambios') {
    cambiosDePedidos.emitir(resultado);
    // Un pedido pagado de verdad (lección 5): ni un evento repetido ni uno de un pedido cancelado
    // llegan hasta aquí.
    metricas.pedidosPagados.add(1);
  }
  return c.json({ recibido: evento.id, repetido: false }, 200);
});
// #endregion recibir-pago

// #region seguir-pedido
// La respuesta empieza y no termina: cada evento es un trozo más de la misma respuesta. Primero,
// el estado de ahora; después, cada cambio. Si la conexión se corta, EventSource reconecta solo
// y vuelve a recibir el estado de ahora: no se pierde nada.
// La misma regla que para ver un pedido: el tuyo, o cualquiera con pedidos:ver-todos.
v2.openapi(contrato.seguirPedido, async (c) => {
  const pedido = await pedidoVisible(c, c.req.valid('param').id, 'pedidos:ver-todos');
  if (!pedido) return problemaHttp(c, 404, 'No existe ese pedido');

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: 'estado', data: JSON.stringify(pedido) });
    const avisar = async (cambiado: Pedido) => {
      if (cambiado.id !== pedido.id) return;
      await stream.writeSSE({ event: 'estado', data: JSON.stringify(cambiado) });
    };
    // Se espera hasta que el cliente se vaya, hasta que se hayan podido perder cambios (Redis ha
    // vuelto después de un corte, eventos-pedidos.ts) o hasta que esta copia de la API se apague
    // (apagado.ts); entonces se deja de escuchar y la respuesta termina. En los dos últimos casos,
    // EventSource se conecta otra vez solo, a esta copia o a la otra, y recibe el estado de ahora.
    let dejarDeEscuchar = () => {};
    let dejarDeEsperar = () => {};
    await new Promise<void>((acabar) => {
      stream.onAbort(acabar);
      dejarDeEscuchar = cambiosDePedidos.escuchar(avisar, acabar);
      const alApagarse = () => acabar();
      alApagar.addEventListener('abort', alApagarse);
      dejarDeEsperar = () => alApagar.removeEventListener('abort', alApagarse);
      if (alApagar.aborted) acabar();
    });
    dejarDeEscuchar();
    dejarDeEsperar();
  });
});
// #endregion seguir-pedido

// #region crear-cuenta
// Para cuando llega aquí, el email tiene forma de email y la contraseña cumple las reglas (el
// esquema). La respuesta lleva el id y el email: el hash no sale nunca de la base de datos.
v2.openapi(contrato.crearCuenta, async (c) => {
  // Como mucho, 5 cuentas por hora desde la misma IP (limites.ts): cada intento cuenta.
  const ip = ipDe(c);
  const estado = await limites.cuentasPorIp.comprobar(ip);
  if (!estado.permitido) return demasiadosIntentos(c, [[limites.cuentasPorIp, estado]]);
  await limites.cuentasPorIp.apuntar(ip);
  ponerCabeceras(c, [[limites.cuentasPorIp, await limites.cuentasPorIp.comprobar(ip)]]);

  const { email, contrasena } = c.req.valid('json');
  const resultado = await crearUsuario(email, contrasena);
  if ('error' in resultado) {
    // Decir «ese email ya tiene cuenta» le cuenta a cualquiera quién es cliente de la tienda. Para
    // no decirlo, la respuesta sería siempre la misma y la tienda mandaría un correo al email; aquí
    // no hay correo, así que se dice, y la lección 8 limita cuántas veces se puede preguntar.
    return problema(c, {
      type: tipo('email-en-uso'),
      title: 'Ya hay una cuenta con ese email',
      status: 409,
      detail: 'Si es tuya, inicia sesión con ella',
    });
  }
  const { usuario } = resultado;
  // La URL de la cuenta nueva. La API no tiene todavía una ruta para leerla: cada persona verá la
  // suya en /v2/yo (lección 2).
  return c.json(usuario, 201, { Location: `${c.req.path}/${usuario.id}` });
});
// #endregion crear-cuenta

// #region iniciar-sesion
// El mismo 400, con el mismo cuerpo, para un email que no existe y para una contraseña mala: quien
// prueba no sabe cuál de los dos ha fallado, ni si ese email tiene cuenta.
// Los límites (lección 8), antes de nada: con demasiados fallos, 429, y la contraseña ni se mira.
// Así, ni la buena entra mientras dura el bloqueo: quien prueba no sabe si ha acertado.
async function comprobarLimitesDeSesion(email: string, ip: string) {
  const comprobados: [Limitador, Estado][] = [
    [limites.sesionPorEmail, await limites.sesionPorEmail.comprobar(email)],
    [limites.sesionPorIp, await limites.sesionPorIp.comprobar(ip)],
  ];
  return comprobados;
}

v2.openapi(contrato.iniciarSesion, async (c) => {
  const { email, contrasena } = c.req.valid('json');
  const porEmail = email.toLowerCase();
  const ip = ipDe(c);
  const antes = await comprobarLimitesDeSesion(porEmail, ip);
  if (antes.some(([, estado]) => !estado.permitido)) return demasiadosIntentos(c, antes);

  const usuario = await comprobarCredenciales(email, contrasena);
  if (!usuario) {
    // Un fallo más, en las dos cuentas: la de ese email y la de esa IP.
    await limites.sesionPorEmail.apuntar(porEmail);
    await limites.sesionPorIp.apuntar(ip);
    ponerCabeceras(c, await comprobarLimitesDeSesion(porEmail, ip));
    return problema(c, {
      type: tipo('credenciales-no-validas'),
      title: 'El email o la contraseña no son correctos',
      status: 400,
      detail: 'Comprueba los dos y vuelve a intentarlo',
    });
  }
  await abrirSesion(c, usuario.id);
  return c.json(usuario, 200);
});
// #endregion iniciar-sesion

// #region cerrar-sesion
// Sin sesión también responde 204: el resultado es el mismo, no hay sesión.
v2.openapi(contrato.cerrarSesion, async (c) => {
  await cerrarSesion(c);
  return c.body(null, 204);
});

// #endregion cerrar-sesion

// #region yo
// exigirIdentidad (contrato.ts) ya ha comprobado que hay alguien: una persona o una clave.
v2.openapi(contrato.verYo, (c) => {
  const { usuario, clave } = c.var;
  if (usuario) return c.json({ tipo: 'usuario' as const, ...usuario }, 200);
  return c.json({ tipo: 'clave' as const, ...clave! }, 200);
});
// #endregion yo

// #region proveedor-ida
// Lo que hay que recordar entre la ida y la vuelta (state, nonce y verificador) va en una cookie
// propia, en vez de en una tabla: dura 10 minutos, solo viaja a las dos rutas del proveedor (Path)
// y JavaScript no la lee (HttpOnly). Su trabajo es atar la vuelta al navegador que empezó: otro
// navegador no la tiene. SameSite=Lax y no Strict: la vuelta llega desde la web del proveedor, y
// con Strict el navegador no la mandaría.
const COOKIE_PROVEEDOR = 'proveedor';
const ATRIBUTOS_PROVEEDOR = {
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/v2/sesion/proveedor',
} as const;

// Sin las OIDC_*, la tienda no tiene proveedor: las dos rutas dicen que no existe.
const sinProveedor = (c: Context) =>
  problema(c, {
    type: tipo('proveedor-no-configurado'),
    title: 'La tienda no tiene proveedor de identidad',
    status: 404,
    detail: 'Esta tienda no está configurada para iniciar sesión con un proveedor de identidad',
  });

v2.openapi(contrato.inicioConProveedor, async (c) => {
  if (!proveedorConfigurado()) return sinProveedor(c);
  const { url, guardado } = await empezarInicio();
  const valor = Buffer.from(JSON.stringify(guardado)).toString('base64url');
  setCookie(c, COOKIE_PROVEEDOR, valor, { ...ATRIBUTOS_PROVEEDOR, maxAge: 10 * 60 });
  return c.redirect(url.href, 302);
});
// #endregion proveedor-ida

// #region proveedor-vuelta
// La cookie se borra nada más leerla: cada inicio de sesión se puede terminar una sola vez.
function leerInicio(c: Context): InicioGuardado | undefined {
  const valor = getCookie(c, COOKIE_PROVEEDOR);
  deleteCookie(c, COOKIE_PROVEEDOR, ATRIBUTOS_PROVEEDOR);
  if (valor === undefined) return undefined;
  try {
    return JSON.parse(Buffer.from(valor, 'base64url').toString());
  } catch {
    return undefined;
  }
}

const inicioFallido = (
  c: Context,
  detail = 'La respuesta del proveedor no vale, o no la empezó este navegador: empieza otra vez',
) =>
  problema(c, {
    type: tipo('inicio-con-proveedor'),
    title: 'No se ha podido iniciar sesión con el proveedor',
    status: 400,
    detail,
  });

v2.openapi(contrato.vueltaDelProveedor, async (c) => {
  if (!proveedorConfigurado()) return sinProveedor(c);
  const guardado = leerInicio(c);
  if (!guardado) return inicioFallido(c);
  // La URL de vuelta, tal y como la registró la tienda en el proveedor, con lo que trae: code y
  // state. openid-client la necesita entera, y la de config no cambia aunque la tienda esté detrás
  // de un proxy.
  const vuelta = new URL(urlDeVuelta());
  vuelta.search = new URL(c.req.url).search;
  const identidad = await terminarInicio(vuelta, guardado);
  if (!identidad) return inicioFallido(c);

  const resultado = await usuarioDelProveedor(identidad);
  if ('error' in resultado) {
    if (resultado.error === 'sin-email')
      return inicioFallido(c, 'El proveedor no ha dado un email');
    return problema(c, {
      type: tipo('email-sin-verificar'),
      title: 'No se puede unir esa cuenta',
      status: 409,
      detail: 'Ya hay una cuenta con ese email, y el proveedor no dice que el email sea tuyo',
    });
  }
  // La misma sesión que con contraseña (lección 2): cookie, id nuevo y a /v2/yo.
  await abrirSesion(c, resultado.usuario.id);
  return c.redirect('/v2/yo', 303);
});
// #endregion proveedor-vuelta

// #region configurar-aviso
// La empresa de reparto dice a qué URL avisarle. Es su clave de API la que la guarda: una persona
// con el rol reparto no tiene una URL propia. Antes de guardarla, se comprueba (url-segura.ts):
// si apunta dentro de la red del servidor, 422.
v2.openapi(contrato.configurarAviso, async (c) => {
  const { clave } = c.var;
  if (!clave) return problemaHttp(c, 403, 'Solo con la clave de API de la empresa de reparto');
  const comprobada = await comprobarUrl(c.req.valid('json').url);
  if ('error' in comprobada) {
    return datosNoValidos(c, [{ campo: 'url', problema: comprobada.error }]);
  }
  const url = comprobada.url.href;
  return c.json({ url, secreto: await guardarAviso(clave.id, url) }, 200);
});
// #endregion configurar-aviso

// Un método que la ruta no tiene: 405, y en Allow, los que sí tiene.
const noPermitido = (c: Context, permitidos: string) =>
  problemaHttp(c, 405, `Esta ruta no admite ${c.req.method}`, { Allow: permitidos });

v2.all('/productos', (c) => noPermitido(c, 'GET, POST'));
v2.all('/productos/:id', (c) => noPermitido(c, 'GET, DELETE, PATCH'));
v2.all('/pedidos', (c) => noPermitido(c, 'GET, POST'));
v2.all('/pedidos/:id', (c) => noPermitido(c, 'GET, PATCH'));
v2.all('/pedidos/:id/cancelacion', (c) => noPermitido(c, 'POST'));
v2.all('/pedidos/:id/envio', (c) => noPermitido(c, 'POST'));
v2.all('/pedidos/:id/eventos', (c) => noPermitido(c, 'GET'));
v2.all('/webhooks/pagos', (c) => noPermitido(c, 'POST'));
v2.all('/cuentas', (c) => noPermitido(c, 'POST'));
v2.all('/sesion', (c) => noPermitido(c, 'POST, DELETE'));
v2.all('/yo', (c) => noPermitido(c, 'GET'));
v2.all('/reparto/aviso', (c) => noPermitido(c, 'PUT'));
v2.all('/sesion/proveedor', (c) => noPermitido(c, 'GET'));
v2.all('/sesion/proveedor/vuelta', (c) => noPermitido(c, 'GET'));
