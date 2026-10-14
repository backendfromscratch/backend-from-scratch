// La sesión en cada petición: de dónde sale el id, quién es y qué pasa si no hay nadie.
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Entorno } from '../entorno.ts';
import { problemaHttp } from '../problemas.ts';
import { borrarSesion, crearSesion, DURACION_SESION, usuarioDeSesion } from '../sesiones.ts';

const COOKIE = 'sesion';

// #region cookie
// Cada atributo de la cookie (Fase 2) tiene su motivo:
// - HttpOnly: el JavaScript de la página no la puede leer. Si alguien consigue meter un script en
//   la página (XSS, lección 6), no se lleva la sesión.
// - Secure: solo viaja por HTTPS. Los navegadores actuales y curl (probado con la 8.14) tratan
//   http://localhost como seguro, así que en tu ordenador también funciona sin HTTPS. Con
//   http://127.0.0.1 no: para el navegador es otro sitio, con sus propias cookies.
// - SameSite=Lax: si otra web manda al navegador a hacer un POST aquí, la cookie no va (lección 7).
// - Path=/: vale para toda la API.
// - Max-Age: los segundos que el navegador la guarda, los mismos que dura la sesión.
const ATRIBUTOS = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' } as const;

// Crea la sesión y manda su id en la cookie. Si el navegador traía otra sesión, se borra: después
// de iniciar sesión, siempre un id nuevo. Si no, alguien que hubiera colado su id en tu navegador
// antes del login (fijación de sesión) tendría tu sesión en cuanto entraras.
export async function abrirSesion(c: Context, usuarioId: number) {
  const anterior = idDeSesion(c);
  if (anterior !== undefined) await borrarSesion(anterior);
  const id = await crearSesion(usuarioId);
  setCookie(c, COOKIE, id, { ...ATRIBUTOS, maxAge: DURACION_SESION });
}

// Al cerrar sesión: se borra la fila y se le pide al navegador que olvide la cookie (Max-Age=0).
export async function cerrarSesion(c: Context) {
  const id = idDeSesion(c);
  if (id !== undefined) await borrarSesion(id);
  deleteCookie(c, COOKIE, ATRIBUTOS);
}
// #endregion cookie

// #region cargar-sesion
// El id llega en la cookie (un navegador) o en la cabecera Authorization: Bearer <id> (un programa
// que no guarda cookies, como una app del móvil). Las dos formas dicen lo mismo: «esta es mi sesión».
function idDeSesion(c: Context): string | undefined {
  return getCookie(c, COOKIE) ?? /^Bearer (\S+)$/.exec(c.req.header('Authorization') ?? '')?.[1];
}

// En todas las peticiones: si traen una sesión válida, deja su cuenta en c.var.usuario. Si no,
// no hace nada: decidir si una ruta necesita sesión es cosa de exigirIdentidad.
export const cargarSesion: MiddlewareHandler<Entorno> = async (c, next) => {
  const id = idDeSesion(c);
  const usuario = id === undefined ? undefined : await usuarioDeSesion(id);
  if (usuario) c.set('usuario', usuario);
  await next();
};
// #endregion cargar-sesion

// #region exigir-identidad
// Para las rutas que necesitan saber quién eres: una persona con su sesión o un programa con su
// clave. Sin ninguna de las dos, 401 Unauthorized: «no sé quién eres». Un 401 tiene que decir en
// WWW-Authenticate cómo identificarse (RFC 9110): con Bearer, la sesión o la clave valen.
// También lo usa exigir (permisos.ts), para las rutas que piden un permiso.
export const noIdentificado = (c: Context) =>
  problemaHttp(c, 401, 'Inicia sesión, o identifícate con tu clave de API', {
    'WWW-Authenticate': 'Bearer realm="tienda-api"',
  });

export const exigirIdentidad: MiddlewareHandler<Entorno> = async (c, next) => {
  if (c.var.usuario === undefined && c.var.clave === undefined) return noIdentificado(c);
  await next();
};
// #endregion exigir-identidad
