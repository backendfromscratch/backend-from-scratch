// Los tests del contrato (Fase 10, lección 3): cada ruta de /v2 responde lo que el contrato dice,
// la API vigila sus propias respuestas (src/contrato-respuestas.ts) y el contrato publicado no
// cambia sin que se vea (contrato.json).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, mock, test } from 'node:test';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { requestId } from 'hono/request-id';
import { arrancarProveedor, MARTA } from '../scripts/proveedor.ts';
import { firmar } from '../src/firma.ts';
import { usarBd } from './bd.ts';
import { ANA, CARMEN, comoReparto, comoUsuario } from './identidades.ts';

// La tienda lee OIDC_EMISOR al arrancar: primero se arranca el proveedor de práctica, en un puerto
// libre, y después se importa todo lo que lee la configuración (como en oauth.test.ts).
const proveedor = await arrancarProveedor(0, '127.0.0.1', { ...MARTA });
proveedor.issuer.url = `http://127.0.0.1:${proveedor.address().port}`;
after(() => proveedor.stop());
process.env.OIDC_EMISOR = proveedor.issuer.url;
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { crearValidador, documentoContrato, plantillaDeRuta, validarRespuestas } =
  await import('../src/contrato-respuestas.ts');
const { cumpleContrato } = await import('./contrato.ts');

let ana: Record<string, string>;
let carmen: Record<string, string>;
let reparto: Record<string, string>;
usarBd(async () => {
  ana = await comoUsuario(ANA);
  carmen = await comoUsuario(CARMEN);
  reparto = await comoReparto();
});

// #region validador
const mini = {
  openapi: '3.1.0',
  info: { title: 'mini', version: '1' },
  paths: {
    '/cosas/{id}': {
      get: {
        responses: {
          200: {
            description: 'La cosa',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Cosa' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Cosa: {
        type: 'object',
        properties: { id: { type: 'integer' }, nombre: { type: 'string' } },
        required: ['id', 'nombre'],
      },
    },
  },
};

test('crearValidador: un cuerpo que encaja no tiene fallos', () => {
  const validar = crearValidador(mini);
  assert.deepEqual(validar('GET', '/cosas/{id}', 200, { id: 1, nombre: 'Taza' }), []);
});

test('crearValidador: un campo con otro nombre es un fallo que dice cuál falta', () => {
  const validar = crearValidador(mini);
  const fallos = validar('get', '/cosas/{id}', 200, { id: 1, titulo: 'Taza' });
  assert.equal(fallos.length, 1);
  assert.equal(fallos[0]!.donde, '/nombre');
  assert.equal(fallos[0]!.regla, 'required');
  assert.match(fallos[0]!.mensaje, /nombre/);
  // Y un tipo equivocado, dónde.
  const tipo = validar('get', '/cosas/{id}', 200, { id: '1', nombre: 'Taza' });
  assert.deepEqual(
    tipo.map((fallo) => [fallo.donde, fallo.regla]),
    [['/id', 'type']],
  );
});

test('crearValidador: un estado o una ruta que el contrato no describe es un fallo', () => {
  const validar = crearValidador(mini);
  for (const [metodo, ruta, estado] of [
    ['get', '/cosas/{id}', 500],
    ['get', '/otra', 200],
    ['post', '/cosas/{id}', 200],
  ] as const) {
    const fallos = validar(metodo, ruta, estado, {});
    assert.equal(fallos.length, 1);
    assert.equal(fallos[0]!.regla, 'sin-respuesta-en-el-contrato');
  }
});

test('plantillaDeRuta: de la ruta de Hono (/v2/pedidos/:id) a la del documento (/pedidos/{id})', () => {
  assert.equal(plantillaDeRuta('/v2/pedidos/:id/eventos', '/v2'), '/pedidos/{id}/eventos');
  assert.equal(plantillaDeRuta('/v2/productos', '/v2'), '/productos');
  assert.equal(plantillaDeRuta('/v2/productos/:id{[0-9]+}', '/v2'), '/productos/{id}');
  assert.equal(plantillaDeRuta('/cosas/:id', ''), '/cosas/{id}');
});
// #endregion validador

// #region cada-ruta
const pedir = (
  metodo: string,
  camino: string,
  cabeceras: Record<string, string> = {},
  cuerpo?: unknown,
) =>
  app.request(camino, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

const evento = (id: string, pedidoId: number) =>
  JSON.stringify({ id, tipo: 'pago.completado', pedidoId });
const pago = (cuerpo: string, firma = firmar(cuerpo, config.WEBHOOK_SECRET)) =>
  app.request('/v2/webhooks/pagos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firma': firma },
    body: cuerpo,
  });

// Cada caso: el método y la ruta tal como los escribe el documento, y una petición que da la
// respuesta buena (exito) y otra que da un error (error: un Problem Details). Van en orden: algunos
// cambian los datos que usan los siguientes.
type Caso = {
  metodo: string;
  ruta: string;
  exito: () => Response | Promise<Response>;
  error?: () => Response | Promise<Response>;
};
const casos: Caso[] = [
  {
    metodo: 'get',
    ruta: '/productos',
    exito: () => pedir('GET', '/v2/productos'),
    error: () => pedir('GET', '/v2/productos?orden=nada'),
  },
  {
    metodo: 'get',
    ruta: '/productos/{id}',
    exito: () => pedir('GET', '/v2/productos/1'),
    error: () => pedir('GET', '/v2/productos/999'),
  },
  {
    metodo: 'post',
    ruta: '/productos',
    exito: () => pedir('POST', '/v2/productos', ana, { nombre: 'Pegatina', precioCentimos: 300 }),
    error: () =>
      pedir('POST', '/v2/productos', carmen, { nombre: 'Pegatina', precioCentimos: 300 }),
  },
  {
    metodo: 'patch',
    ruta: '/productos/{id}',
    exito: () => pedir('PATCH', '/v2/productos/1', ana, { nombre: 'Camiseta azul' }),
    error: () => pedir('PATCH', '/v2/productos/999', ana, { nombre: 'Nada' }),
  },
  {
    metodo: 'delete',
    ruta: '/productos/{id}',
    // La pegatina que acaba de crear el caso anterior: sin pedidos, se puede borrar.
    exito: () => pedir('DELETE', '/v2/productos/5', ana),
    // La taza tiene pedidos: 409.
    error: () => pedir('DELETE', '/v2/productos/2', ana),
  },
  {
    metodo: 'get',
    ruta: '/pedidos',
    exito: () => pedir('GET', '/v2/pedidos', carmen),
    error: () => pedir('GET', '/v2/pedidos'),
  },
  {
    metodo: 'get',
    ruta: '/pedidos/{id}',
    exito: () => pedir('GET', '/v2/pedidos/1', carmen),
    // El 2 es de Pablo: para Carmen, no existe.
    error: () => pedir('GET', '/v2/pedidos/2', carmen),
  },
  {
    metodo: 'post',
    ruta: '/pedidos',
    exito: () => pedir('POST', '/v2/pedidos', carmen, { productoId: 1, cantidad: 1 }),
    error: () => pedir('POST', '/v2/pedidos', carmen, { productoId: 1, cantidad: 1000 }),
  },
  {
    metodo: 'patch',
    ruta: '/pedidos/{id}',
    exito: () => pedir('PATCH', '/v2/pedidos/21', carmen, { cantidad: 3 }),
    // El 13 ya está pagado.
    error: () => pedir('PATCH', '/v2/pedidos/13', carmen, { cantidad: 3 }),
  },
  {
    metodo: 'post',
    ruta: '/pedidos/{id}/cancelacion',
    exito: () => pedir('POST', '/v2/pedidos/23/cancelacion', carmen),
    // El 1 ya está enviado.
    error: () => pedir('POST', '/v2/pedidos/1/cancelacion', carmen),
  },
  {
    metodo: 'post',
    ruta: '/pedidos/{id}/envio',
    exito: () => pedir('POST', '/v2/pedidos/13/envio', ana),
    // El 21 sigue pendiente: no se puede enviar.
    error: () => pedir('POST', '/v2/pedidos/21/envio', ana),
  },
  {
    metodo: 'get',
    ruta: '/pedidos/{id}/eventos',
    // La respuesta no termina: se mira solo su estado y su tipo, y se cierra.
    exito: async () => {
      const res = await pedir('GET', '/v2/pedidos/25/eventos', carmen);
      await res.body?.cancel();
      return res;
    },
    error: () => pedir('GET', '/v2/pedidos/2/eventos', carmen),
  },
  {
    metodo: 'post',
    ruta: '/webhooks/pagos',
    exito: () => pago(evento('evt_contrato', 25)),
    error: () => pago(evento('evt_contrato_2', 25), 'sha256=mala'),
  },
  {
    metodo: 'post',
    ruta: '/cuentas',
    exito: () =>
      pedir(
        'POST',
        '/v2/cuentas',
        {},
        { email: 'marta@ejemplo.org', contrasena: 'caballo correcto pila grapa' },
      ),
    error: () => pedir('POST', '/v2/cuentas', {}, { email: 'no-es-un-email', contrasena: 'x' }),
  },
  {
    metodo: 'post',
    ruta: '/sesion',
    exito: () =>
      pedir(
        'POST',
        '/v2/sesion',
        {},
        { email: 'ana@tienda.example', contrasena: 'ana-practica-2026' },
      ),
    error: () =>
      pedir('POST', '/v2/sesion', {}, { email: 'ana@tienda.example', contrasena: 'mala' }),
  },
  // El contrato de esta ruta solo describe el 204: no tiene error que probar.
  { metodo: 'delete', ruta: '/sesion', exito: () => pedir('DELETE', '/v2/sesion', ana) },
  {
    metodo: 'get',
    ruta: '/yo',
    exito: () => pedir('GET', '/v2/yo', ana),
    error: () => pedir('GET', '/v2/yo'),
  },
  {
    metodo: 'get',
    ruta: '/sesion/proveedor',
    exito: () => pedir('GET', '/v2/sesion/proveedor'),
    // Su 404 (sin OIDC_*) necesita otra configuración: lo prueba proveedor-opcional.test.ts, que
    // arranca la tienda en otro proceso, también con VALIDAR_RESPUESTAS=fallar.
  },
  {
    metodo: 'get',
    ruta: '/sesion/proveedor/vuelta',
    exito: async () => {
      const ida = await pedir('GET', '/v2/sesion/proveedor');
      const cookie = ida.headers.get('set-cookie')!.split(';')[0]!;
      const delProveedor = await fetch(ida.headers.get('location')!, { redirect: 'manual' });
      const deVuelta = new URL(delProveedor.headers.get('location')!);
      return pedir('GET', deVuelta.pathname + deVuelta.search, { Cookie: cookie });
    },
    // Sin la cookie con la que empezó, la vuelta no vale.
    error: () => pedir('GET', '/v2/sesion/proveedor/vuelta?code=x&state=y'),
  },
  {
    metodo: 'put',
    ruta: '/reparto/aviso',
    exito: () =>
      pedir('PUT', '/v2/reparto/aviso', reparto, { url: 'https://93.184.215.14/avisos' }),
    error: () => pedir('PUT', '/v2/reparto/aviso', reparto, { url: 'https://169.254.169.254/' }),
  },
];

test('cada ruta de /v2 tiene su caso en este fichero: una ruta nueva sin test no pasa', async () => {
  const { paths } = documentoContrato() as unknown as {
    paths: Record<string, Record<string, unknown>>;
  };
  const delDocumento = Object.entries(paths).flatMap(([ruta, operaciones]) =>
    Object.keys(operaciones).map((metodo) => `${metodo} ${ruta}`),
  );
  assert.deepEqual(casos.map((caso) => `${caso.metodo} ${caso.ruta}`).sort(), delDocumento.sort());
});

for (const caso of casos) {
  test(`${caso.metodo.toUpperCase()} ${caso.ruta}: la respuesta buena cumple el contrato`, async () => {
    await cumpleContrato(await caso.exito(), caso.metodo, caso.ruta);
  });
  if (caso.error) {
    test(`${caso.metodo.toUpperCase()} ${caso.ruta}: el error es un Problem Details del contrato`, async () => {
      const res = await caso.error!();
      assert.ok(res.status >= 400, `se esperaba un error, y es un ${res.status}`);
      assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
      await cumpleContrato(res, caso.metodo, caso.ruta);
    });
  }
}
// #endregion cada-ruta

// #region respuesta-rota
// Una API aparte, solo para este fichero, con una ruta que rompe su propio contrato a propósito:
// promete {nombre} y responde {titulo}, con un valor que no tiene que acabar en el log.
const SECRETO = 'valor-personal-que-no-debe-salir-en-el-log';
function apiRota(modo: 'registrar' | 'fallar') {
  const rota = new OpenAPIHono();
  rota.use(requestId());
  rota.use(
    validarRespuestas(modo, {
      prefijo: '',
      documento: () =>
        rota.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'rota', version: '1' } }),
    }),
  );
  const ruta = createRoute({
    method: 'get',
    path: '/cosas/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'La cosa',
        content: { 'application/json': { schema: z.object({ nombre: z.string() }) } },
      },
    },
  });
  rota.openapi(ruta, (c) => c.json({ titulo: SECRETO } as never, 200));
  return rota;
}

test('registrar: una respuesta fuera del contrato pasa, con una sola línea de aviso sin el cuerpo', async () => {
  const aviso = mock.method(log, 'warn', () => {});
  try {
    const res = await apiRota('registrar').request('/cosas/7', {
      headers: { 'X-Request-Id': 'r-1' },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { titulo: SECRETO });
    assert.equal(aviso.mock.callCount(), 1);
    const [datos, mensaje] = aviso.mock.calls[0]!.arguments as unknown as [
      Record<string, unknown>,
      string,
    ];
    assert.equal(mensaje, 'respuesta fuera del contrato');
    assert.equal(datos.requestId, 'r-1');
    assert.equal(datos.metodo, 'GET');
    assert.equal(datos.ruta, '/cosas/{id}');
    assert.equal(datos.estado, 200);
    assert.deepEqual(
      (datos.fallos as { donde: string }[]).map((fallo) => fallo.donde),
      ['/nombre'],
    );
    // El cuerpo puede llevar datos personales: ni el valor ni el cuerpo van al log.
    assert.ok(!JSON.stringify(aviso.mock.calls[0]!.arguments).includes(SECRETO));
  } finally {
    aviso.mock.restore();
  }
});

test('fallar: la misma respuesta es un 500 Problem Details «La respuesta no cumple el contrato»', async () => {
  const res = await apiRota('fallar').request('/cosas/7');
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
  const problema = await res.json();
  assert.equal(problema.title, 'La respuesta no cumple el contrato');
  assert.equal(problema.status, 500);
  assert.ok(!JSON.stringify(problema).includes(SECRETO));
});

test('un 500 que la ruta no esperaba no es una rotura del contrato: ni aviso, ni se sustituye', async () => {
  const caida = new OpenAPIHono();
  caida.use(requestId());
  const ruta = createRoute({
    method: 'get',
    path: '/cosas',
    responses: {
      200: {
        description: 'Las cosas',
        content: { 'application/json': { schema: z.object({ nombre: z.string() }) } },
      },
    },
  });
  caida.openapi(ruta, () => {
    throw new Error('se ha caído algo');
  });
  // Como app.onError: un 500 en JSON, que el contrato no describe.
  caida.onError((_error, c) => c.json({ title: 'Internal Server Error', status: 500 }, 500));
  for (const modo of ['registrar', 'fallar'] as const) {
    const montada = new OpenAPIHono();
    montada.use(requestId());
    montada.use(
      validarRespuestas(modo, {
        prefijo: '',
        documento: () =>
          caida.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'c', version: '1' } }),
      }),
    );
    montada.route('/', caida);
    montada.onError((_error, c) => c.json({ title: 'Internal Server Error', status: 500 }, 500));
    const aviso = mock.method(log, 'warn', () => {});
    const error = mock.method(log, 'error', () => {});
    try {
      const res = await montada.request('/cosas');
      assert.equal(res.status, 500);
      assert.equal((await res.json()).title, 'Internal Server Error');
      assert.equal(aviso.mock.callCount(), 0, modo);
      assert.equal(error.mock.callCount(), 0, modo);
    } finally {
      aviso.mock.restore();
      error.mock.restore();
    }
  }
});

test('fallar: el 500 que sustituye a la respuesta conserva X-Request-Id y no lleva Location ni Set-Cookie', async () => {
  const rota = apiRota('fallar');
  rota.use(async (c, next) => {
    await next();
    c.res.headers.set('Location', '/cosas/7');
    c.res.headers.append('Set-Cookie', 'sesion=abc; HttpOnly');
  });
  const res = await rota.request('/cosas/7', { headers: { 'X-Request-Id': 'r-2' } });
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('x-request-id'), 'r-2');
  assert.equal(res.headers.get('location'), null);
  assert.equal(res.headers.get('set-cookie'), null);
});
// #endregion respuesta-rota

// #region respuestas-de-middleware
// Las respuestas que fabrica un middleware antes de llegar a la ruta (la comprobación contra CSRF,
// que mira la cookie) también pasan por el validador: está montado el primero de todos.
for (const [metodo, ruta, camino] of [
  ['post', '/cuentas', '/v2/cuentas'],
  ['post', '/sesion', '/v2/sesion'],
  ['delete', '/sesion', '/v2/sesion'],
  ['post', '/webhooks/pagos', '/v2/webhooks/pagos'],
  ['post', '/pedidos', '/v2/pedidos'],
] as const) {
  test(`${metodo.toUpperCase()} ${ruta} con la cookie y desde otra web: 403 del contrato`, async () => {
    const res = await app.request(camino, {
      method: metodo,
      headers: { 'Content-Type': 'text/plain', Cookie: 'sesion=x', Origin: 'https://otra.example' },
      body: metodo === 'delete' ? undefined : 'a=b',
    });
    assert.equal(res.status, 403);
    await cumpleContrato(res, metodo, ruta);
  });
}

test('el validador ve también lo que responde un middleware sin llegar a la ruta', async () => {
  // Un middleware que corta con un 403 que el contrato no describe, montado detrás del validador.
  const api = new OpenAPIHono();
  api.use(requestId());
  api.use(
    validarRespuestas('fallar', {
      prefijo: '',
      documento: () =>
        api.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'm', version: '1' } }),
    }),
  );
  api.use('*', async (c) => c.json({ title: 'Forbidden', status: 403 }, 403));
  api.openapi(
    createRoute({
      method: 'get',
      path: '/cosas/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: 'La cosa',
          content: { 'application/json': { schema: z.object({ nombre: z.string() }) } },
        },
      },
    }),
    (c) => c.json({ nombre: 'x' }, 200),
  );
  const res = await api.request('/cosas/7');
  assert.equal(res.status, 500);
  assert.equal((await res.json()).title, 'La respuesta no cumple el contrato');
});
// #endregion respuestas-de-middleware

// #region lo-que-no-se-toca
test('el modo de los tests es fallar, y las respuestas sin cuerpo JSON no se tocan', async () => {
  assert.equal(config.VALIDAR_RESPUESTAS, 'fallar');
  const aviso = mock.method(log, 'warn', () => {});
  const fallo = mock.method(log, 'error', () => {});
  try {
    // 204: sin cuerpo.
    assert.equal((await pedir('DELETE', '/v2/sesion', ana)).status, 204);
    // HEAD: sin cuerpo.
    const head = await pedir('HEAD', '/v2/productos');
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    // Las páginas que no son de la API: HTML, fuera de /v2.
    const docs = await pedir('GET', '/docs');
    assert.equal(docs.status, 200);
    assert.match(docs.headers.get('content-type')!, /html/);
    const tienda = await pedir('GET', '/tienda');
    assert.equal(tienda.status, 200);
    assert.match(tienda.headers.get('content-type')!, /html/);
    // El documento del contrato no se valida a sí mismo.
    assert.equal((await pedir('GET', '/v2/openapi.json')).status, 200);
    // Una ruta de /v2 que no existe: el 404 de siempre.
    assert.equal((await pedir('GET', '/v2/no-existe')).status, 404);
    assert.equal(aviso.mock.callCount(), 0);
    assert.equal(fallo.mock.callCount(), 0);
  } finally {
    aviso.mock.restore();
    fallo.mock.restore();
  }
});

test('SSE con el validador puesto: las cabeceras y el primer evento llegan en menos de un segundo', async () => {
  // Una sesión nueva: la de ana la cerró el caso de DELETE /sesion. Si el validador esperara a que
  // la respuesta terminara, la petición no volvería nunca: por eso va dentro de la carrera.
  const cabeceras = await comoUsuario(ANA);
  const limite = new Promise<never>((_, rechazar) =>
    setTimeout(() => rechazar(new Error('el primer evento tarda más de 1 s')), 1000),
  );
  const { res, primero } = await Promise.race([
    (async () => {
      const res = await pedir('GET', '/v2/pedidos/7/eventos', cabeceras);
      const lector = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      return { res, lector, primero: await lector.read() };
    })(),
    limite,
  ]).then(async (hecho) => {
    await hecho.lector.cancel();
    return hecho;
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')!, /text\/event-stream/);
  assert.match(primero.value!, /^event: estado/);
});
// #endregion lo-que-no-se-toca

// #region instantanea
// contrato.json es el contrato publicado, guardado en Git: si cambia, el cambio se ve en el diff
// de la revisión. npm run contrato lo vuelve a escribir.
test('contrato.json es el contrato que la API publica ahora', async () => {
  const guardado = JSON.parse(await readFile('contrato.json', 'utf8'));
  assert.deepEqual(
    JSON.parse(JSON.stringify(documentoContrato())),
    guardado,
    'El contrato ha cambiado: mira el diff de contrato.json y, si el cambio es el que quieres, npm run contrato',
  );
});

// El fichero es, byte a byte, lo que escribe npm run contrato (scripts/contrato.ts): el mismo
// orden, la misma sangría y el salto de línea final. Y generarlo dos veces da lo mismo.
test('contrato.json es, byte a byte, lo que escribe npm run contrato', async () => {
  const texto = `${JSON.stringify(documentoContrato(), null, 2)}\n`;
  assert.equal(texto, `${JSON.stringify(documentoContrato(), null, 2)}\n`);
  assert.equal(
    await readFile('contrato.json', 'utf8'),
    texto,
    'El contrato ha cambiado: mira el diff de contrato.json y, si el cambio es el que quieres, npm run contrato',
  );
});
// #endregion instantanea
