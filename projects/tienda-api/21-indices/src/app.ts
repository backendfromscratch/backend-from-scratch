// La API de la Fase 5, lección 7: la lista de pedidos se pagina en SQL, con un índice.
// GET /v2/pedidos/:id/eventos manda cada cambio de un pedido (Server-Sent Events), y /eco es un eco
// por WebSocket.
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { log } from './log.ts';
import { eco } from './eco.ts';
import { registro } from './middleware/registro.ts';
import { conflictoDeBd, problema, problemaHttp } from './problemas.ts';
import { RETIRADA, v1 } from './v1.ts';
import { v2 } from './v2.ts';

export const app = new Hono();

// requestId da a cada petición un identificador y lo devuelve en la cabecera X-Request-Id.
app.use(requestId());
app.use(registro);
app.use(cors({ origin: 'https://tienda.example' }));

// Cada versión, bajo su prefijo: /v1/productos y /v2/productos.
app.route('/v1', v1);
app.route('/v2', v2);

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
// esquemas de v2. servers dice que las rutas del documento (/productos) cuelgan de /v2.
app.get('/v2/openapi.json', (c) =>
  c.json(
    v2.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        title: 'API de la tienda de Ana y Luis',
        version: '2.0.0',
        description: 'Productos y pedidos de la tienda. Los precios van en céntimos.',
      },
      servers: [{ url: '/v2' }],
    }),
  ),
);

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

// #region errores
// Lo que no existe: un 404 con la misma forma que el resto de errores.
app.notFound((c) => problemaHttp(c, 404, 'No existe esa ruta'));

// Cualquier error que se escape de una ruta acaba aquí.
app.onError((error, c) => {
  // Los errores que lanza Hono ya traen su código (un JSON mal formado es un 400).
  if (error instanceof HTTPException) {
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
