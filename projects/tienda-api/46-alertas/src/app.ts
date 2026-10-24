// La API de la Fase 6, lección 8: cuentas, sesiones, claves de API, inicio de sesión con un
// proveedor de identidad, roles y permisos (permisos.ts), una página HTML de la tienda (/tienda)
// con las cabeceras de seguridad, la comprobación del origen contra CSRF, los avisos a la empresa
// de reparto comprobados contra SSRF (url-segura.ts), y límites a los intentos de iniciar sesión y
// de crear cuentas (limites.ts). GET /v2/pedidos/:id/eventos manda cada cambio de un pedido
// (Server-Sent Events), y /eco es un eco por WebSocket. En la Fase 7, lección 4, GET /salud dice si
// la tienda está bien, para el HEALTHCHECK de la imagen.
import { httpInstrumentationMiddleware } from '@hono/otel';
import { trace } from '@opentelemetry/api';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { log } from './log.ts';
import { apagando } from './apagado.ts';
import { pool } from './bd.ts';
import { eco } from './eco.ts';
import type { Entorno } from './entorno.ts';
import { cargarClave } from './middleware/clave.ts';
import { registro } from './middleware/registro.ts';
import { cargarSesion, comprobarOrigen } from './middleware/sesion.ts';
import { config } from './config.ts';
import { documentoContrato, validarRespuestas } from './contrato-respuestas.ts';
import { conflictoDeBd, problema, problemaHttp } from './problemas.ts';
import { tienda } from './tienda.ts';
import { comprobarTodo } from './salud.ts';
import { RETIRADA, v1 } from './v1.ts';
import { v2 } from './v2.ts';

export const app = new Hono<Entorno>();

// #region traza
// El span de cada petición (Fase 10, lección 4), el primero: así mide todo lo demás. Lo crea
// @hono/otel y lo nombra con la plantilla de la ruta (GET /v2/pedidos/:id), no con la URL. Sin
// instrumentación (sin OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, en instrumentacion.ts), no hace nada.
app.use(httpInstrumentationMiddleware());
// requestId da a cada petición un identificador y lo devuelve en la cabecera X-Request-Id. Va también
// en el span, como tienda.request_id: con el id que ve el frontend, se encuentra la traza en Jaeger.
app.use(requestId());
// La URL del span (url.full) va sin la query: una traza no debe llevar lo que el log no lleva
// (urlSinQuery, en instrumentacion.ts).
app.use(async (c, next) => {
  trace.getActiveSpan()?.setAttribute('tienda.request_id', c.get('requestId'));
  await next();
});
// #endregion traza
app.use(registro);
// Con VALIDAR_RESPUESTAS, cada respuesta JSON de v2 se comprueba contra el contrato, después de
// que se haya hecho (contrato-respuestas.ts, Fase 10, lección 3). Va aquí, la primera después del
// registro, para ver también lo que responden los middleware de más abajo sin llegar a la ruta
// (la comprobación contra CSRF, la sesión). Sin la variable, no se añade nada.
if (config.VALIDAR_RESPUESTAS !== 'no')
  app.use('/v2/*', validarRespuestas(config.VALIDAR_RESPUESTAS));
app.use(cors({ origin: 'https://tienda.example' }));
// #region cabeceras-seguridad
// Las cabeceras de seguridad, en todas las respuestas: X-Content-Type-Options: nosniff (el navegador
// no adivina el tipo: un JSON no se ejecuta como script), X-Frame-Options (otra web no mete estas
// páginas en un iframe), Referrer-Policy, Strict-Transport-Security (solo HTTPS, cuando lo haya)…
// La Content Security Policy va solo en /tienda (tienda.ts): /docs carga su código de un CDN.
app.use(secureHeaders());
// #endregion cabeceras-seguridad
// Una petición con la cookie de la sesión que viene de otra web: 403 (CSRF, lección 7).
app.use(comprobarOrigen);
// Si la petición trae una sesión o una clave de API, quién es (c.var.usuario o c.var.clave), para
// todas las rutas.
app.use(cargarSesion);
app.use(cargarClave);

// Cada versión, bajo su prefijo: /v1/productos y /v2/productos.
app.route('/v1', v1);
app.route('/v2', v2);
// La página HTML de la tienda (lección 6).
app.route('/tienda', tienda);

// La raíz dice qué versiones hay y en qué estado está cada una.
app.get('/', (c) =>
  c.json({
    nombre: 'API de la tienda de Ana y Luis',
    versiones: [
      { version: 'v2', url: '/v2', estado: 'actual' },
      { version: 'v1', url: '/v1', estado: 'obsoleta', retirada: RETIRADA.toISOString() },
    ],
  }),
);

// El contrato de la versión 2, en OpenAPI 3.1: lo escribe OpenAPIHono con las rutas y los
// esquemas de v2 (contrato-respuestas.ts).
app.get('/v2/openapi.json', (c) => c.json(documentoContrato()));

// Una página que lee ese contrato y lo enseña: cada ruta, sus datos y un botón para probarla.
// Su código lo carga el navegador de un CDN: con la versión exacta, como los paquetes de npm.
app.get(
  '/docs',
  Scalar({
    url: '/v2/openapi.json',
    pageTitle: 'API de la tienda',
    cdn: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.73.0',
  }),
);

// #region eco
// Si la petición pide cambiar a WebSocket, eco se queda con la conexión. Si no, la ruta dice
// que aquí solo se habla WebSocket: 426 Upgrade Required.
app.get('/eco', eco, (c) =>
  problemaHttp(c, 426, 'Esta ruta solo habla WebSocket', { Upgrade: 'websocket' }),
);
// #endregion eco

// #region salud
// ¿Está bien la tienda? La pregunta el HEALTHCHECK del Dockerfile cada pocos segundos. Sin la base
// de datos la tienda no puede hacer casi nada, así que solo responde 200 si PostgreSQL contesta; si
// no, 503 Service Unavailable. Y desde la Fase 9 (lección 4), 503 también mientras se apaga
// (apagado.ts), aunque la base de datos conteste: esta copia se va. Lo leen Docker y desplegar.sh;
// nginx no pregunta a /salud (solo ve si las peticiones de verdad fallan).
// Desde la Fase 10 (lección 6) hay dos más, /salud/viva y /salud/lista, y /salud se queda como
// estaba, sin ser otro nombre de ninguna: es lo que Docker y desplegar.sh entienden por «sana»
// desde la Fase 7, y una copia nueva que no llega a la base de datos no debe recibir tráfico.
// Hacerla /salud/lista la volvería mala cuando falla Redis, y un despliegue durante un corte de
// Redis volvería atrás una imagen que no tiene la culpa. Y hacerla /salud/viva dejaría pasar una
// copia que no puede hablar con PostgreSQL.
app.get('/salud', async (c) => {
  if (apagando()) return problemaHttp(c, 503, 'La tienda se está apagando');
  try {
    await pool.query('SELECT 1');
    return c.json({ estado: 'ok' });
  } catch {
    return problemaHttp(c, 503, 'La base de datos no responde');
  }
});

// #region viva
// Liveness: ¿el proceso está vivo y contesta? No pregunta a nadie más, a propósito. Quien la usa
// (un orquestador como Kubernetes) reinicia la copia que no contesta. Si mirara la base de datos,
// un corte de PostgreSQL haría que reiniciara todas las copias a la vez, y reiniciarlas no arregla
// PostgreSQL: solo añade copias arrancando a un corte que ya había. Solo 503 mientras se apaga.
app.get('/salud/viva', (c) => {
  if (apagando()) return c.json({ estado: 'apagando' }, 503);
  return c.json({ estado: 'ok' });
});
// #endregion viva

// #region lista
// Readiness: ¿puede atender esta copia ahora? Pregunta a PostgreSQL, al Redis de la cola y al de
// la caché, cada uno con 500 ms como mucho (salud.ts), y dice qué ha visto de cada uno. Quien la usa
// (un balanceador, un orquestador) deja de mandar peticiones a la copia que dice 503, sin
// reiniciarla, hasta que vuelva a decir 200. La caché no la hace fallar: sin ella, la tienda funciona.
app.get('/salud/lista', async (c) => {
  const { lista, comprobaciones } = await comprobarTodo();
  if (apagando()) return c.json({ estado: 'apagando', comprobaciones }, 503);
  return c.json({ estado: lista ? 'ok' : 'falla', comprobaciones }, lista ? 200 : 503);
});
// #endregion lista
// #endregion salud

// #region errores
// Lo que no existe: un 404 con la misma forma que el resto de errores.
app.notFound((c) => problemaHttp(c, 404, 'No existe esa ruta'));

// Cualquier error que se escape de una ruta acaba aquí.
app.onError((error, c) => {
  // Los errores que lanza Hono ya traen su código (un JSON mal formado es un 400).
  if (error instanceof HTTPException) {
    // El único 403 que llega aquí es el de comprobarOrigen (middleware/sesion.ts).
    if (error.status === 403) {
      return problemaHttp(c, 403, 'La petición viene de otra web y usa tu sesión: no se acepta');
    }
    return problemaHttp(c, error.status, 'La petición no se puede leer');
  }
  // Un cambio que choca con los datos que ya hay (un producto con pedidos, al borrarlo): 409.
  const conflicto = conflictoDeBd(c, error);
  if (conflicto) return conflicto;
  const id = c.get('requestId');
  // La traza va al log. Al cliente, nada de cómo está hecho el servidor: solo que ha fallado y,
  // en instance, el id de la petición, para buscarla en el log si avisa.
  log.error({ err: error, requestId: id }, 'error sin capturar');
  return problema(c, {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: 500,
    detail: 'Algo ha fallado en el servidor. Si se repite, avísanos con el valor de instance.',
    instance: `urn:uuid:${id}`,
  });
});
// #endregion errores
