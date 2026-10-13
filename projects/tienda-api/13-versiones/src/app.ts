// La API de la Fase 4, lección 4: dos versiones a la vez. La 2 es la actual; la 1 sigue
// funcionando para quien aún la usa, pero avisa de que se va a retirar.
// #region importar
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { log } from './log.ts';
import { registro } from './middleware/registro.ts';
import { problema, problemaHttp } from './problemas.ts';
import { RETIRADA, v1 } from './v1.ts';
import { v2 } from './v2.ts';
// #endregion importar

export const app = new Hono();

// requestId da a cada petición un identificador y lo devuelve en la cabecera X-Request-Id.
app.use(requestId());
app.use(registro);
app.use(cors({ origin: 'https://tienda.example' }));

// #region versiones
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
// #endregion versiones

// #region errores
// Lo que no existe: un 404 con la misma forma que el resto de errores.
app.notFound((c) => problemaHttp(c, 404, 'No existe esa ruta'));

// Cualquier error que se escape de una ruta acaba aquí.
app.onError((error, c) => {
  // Los errores que lanza Hono ya traen su código (un JSON mal formado es un 400).
  if (error instanceof HTTPException) {
    return problemaHttp(c, error.status, 'La petición no se puede leer');
  }
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
