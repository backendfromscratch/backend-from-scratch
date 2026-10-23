// Las respuestas de la API, vigiladas por su propio contrato (Fase 10, lección 3). Los tests de
// contrato comprueban cada ruta con una petición de ejemplo; esto comprueba las respuestas de
// verdad, las que ven los clientes. Si una no tiene la forma que promete /v2/openapi.json, un
// campo que cambia de nombre o un número que llega como texto, se sabe: con un aviso en el log, o
// con un 500 (VALIDAR_RESPUESTAS). El validador es el mismo en los tests (test/contrato.ts).
import type { ErrorObject, ValidateFunction } from 'ajv';
import _Ajv2020 from 'ajv/dist/2020.js';
import type { MiddlewareHandler } from 'hono';
import type { Entorno } from './entorno.ts';
import { log } from './log.ts';
import { problema } from './problemas.ts';
import { v2 } from './v2.ts';

// #region documento
// El contrato de la versión 2, en OpenAPI 3.1: lo escribe OpenAPIHono con las rutas y los
// esquemas de v2. servers dice que las rutas del documento (/productos) cuelgan de /v2. Lo usan
// /v2/openapi.json, el validador y contrato.json.
export const documentoContrato = () =>
  v2.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: 'API de la tienda de Ana y Luis',
      version: '2.0.0',
      description: 'Productos y pedidos de la tienda. Los precios van en céntimos.',
    },
    servers: [{ url: '/v2' }],
  });
// #endregion documento

// #region validador
// Qué falla y dónde, sin el valor: el cuerpo de una respuesta puede llevar datos personales, y
// esto acaba en el log. donde es el camino dentro del cuerpo (/precioCentimos, /0/nombre), regla
// es la palabra de JSON Schema que no se cumple (required, type…) y mensaje la explica.
export type FalloContrato = { donde: string; regla: string; mensaje: string };

type Documento = {
  paths?: Record<string, Record<string, { responses?: Record<string, Respuesta> }>>;
  components?: { schemas?: Record<string, unknown> };
};
type Respuesta = { content?: Record<string, { schema?: object }> };

// Ajv es un módulo de CommonJS: Node entrega la clase como import por defecto, y TypeScript, el
// módulo entero. Se le dice cuál es.
const Ajv2020 = _Ajv2020 as unknown as typeof _Ajv2020.default;

const ID_COMPONENTES = 'https://tienda.example/contrato.json';
const SIN_RESPUESTA = 'sin-respuesta-en-el-contrato';

export function crearValidador(documento: object) {
  const { paths = {}, components } = documento as Documento;
  // strict: false, porque el documento lleva palabras de OpenAPI que JSON Schema no conoce;
  // validateFormats: false, porque se comprueba la forma (campos y tipos), no que un texto sea una
  // fecha; allErrors, para decir todo lo que falla de una vez.
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  // Los esquemas con nombre (#/components/schemas/Pedido), una sola vez; cada respuesta los
  // enlaza con su dirección completa.
  ajv.addSchema({ $id: ID_COMPONENTES, components }, ID_COMPONENTES);
  const compilados = new Map<string, ValidateFunction | null>();

  // Cada respuesta se compila la primera vez que hace falta, y se guarda.
  function compilar(metodo: string, ruta: string, estado: number) {
    const clave = `${metodo} ${ruta} ${estado}`;
    if (!compilados.has(clave)) {
      const respuesta = paths[ruta]?.[metodo]?.responses?.[String(estado)];
      const esquema = Object.entries(respuesta?.content ?? {}).find(([tipo]) =>
        /json/.test(tipo),
      )?.[1].schema;
      compilados.set(
        clave,
        esquema
          ? ajv.compile(
              JSON.parse(
                JSON.stringify(esquema).replaceAll(
                  '"#/components/',
                  `"${ID_COMPONENTES}#/components/`,
                ),
              ),
            )
          : null,
      );
    }
    return compilados.get(clave)!;
  }

  const validar = (
    metodo: string,
    ruta: string,
    estado: number,
    cuerpo: unknown,
  ): FalloContrato[] => {
    metodo = metodo.toLowerCase();
    const respuesta = paths[ruta]?.[metodo]?.responses?.[String(estado)];
    if (!respuesta) {
      return [
        {
          donde: '',
          regla: SIN_RESPUESTA,
          mensaje: `el contrato no describe un ${estado} para ${metodo.toUpperCase()} ${ruta}`,
        },
      ];
    }
    const validar = compilar(metodo, ruta, estado);
    if (!validar) {
      // Una respuesta sin cuerpo JSON en el contrato (un 204, una redirección): no debe traerlo.
      return cuerpo === undefined
        ? []
        : [{ donde: '', regla: SIN_RESPUESTA, mensaje: 'el contrato no describe un cuerpo JSON' }];
    }
    if (cuerpo === undefined) {
      return [
        { donde: '', regla: 'sin-cuerpo', mensaje: 'el contrato describe un cuerpo y no hay' },
      ];
    }
    if (validar(cuerpo)) return [];
    return (validar.errors ?? []).map((error: ErrorObject) => {
      // Un campo que falta o que sobra: el error apunta al objeto; el camino, al campo.
      const campo = error.params.missingProperty ?? error.params.additionalProperty;
      return {
        donde: campo === undefined ? error.instancePath : `${error.instancePath}/${campo}`,
        regla: error.keyword,
        mensaje: error.message ?? '',
      };
    });
  };

  // Las rutas del documento como expresiones regulares, para saber a qué ruta del documento
  // corresponde un camino de verdad (/pedidos/7 es /pedidos/{id}). Hace falta cuando la respuesta
  // la hizo un middleware antes de llegar a ninguna ruta, y Hono solo sabe decir «/*».
  const rutas = Object.keys(paths).map((plantilla) => ({
    plantilla,
    expresion: new RegExp(`^${plantilla.replace(/\{[^}]+\}/g, '[^/]+')}/?$`),
  }));
  const plantillaDe = (camino: string) =>
    rutas.find((ruta) => ruta.expresion.test(camino))?.plantilla;

  return Object.assign(validar, { plantillaDe });
}
// #endregion validador

// #region plantilla
// Hono conoce la ruta que ha atendido la petición como /v2/pedidos/:id; el documento, como
// /pedidos/{id}, sin el prefijo de la versión. Se pasa de una a otra.
export function plantillaDeRuta(rutaDeHono: string, prefijo: string) {
  const sinPrefijo = rutaDeHono.startsWith(prefijo) ? rutaDeHono.slice(prefijo.length) : rutaDeHono;
  return sinPrefijo.replace(/:(\w+)(\{[^}]*\})?/g, '{$1}');
}
// #endregion plantilla

// #region middleware
type Opciones = { documento?: () => object; prefijo?: string };

// El middleware: deja que la ruta responda y, después, mira lo que ha respondido. Solo las
// respuestas con cuerpo JSON: un 204, un flujo de eventos (SSE) o una página HTML no se tocan. Mira
// una copia, así que la respuesta original sigue su camino igual.
export function validarRespuestas(
  modo: 'registrar' | 'fallar',
  { documento = documentoContrato, prefijo = '/v2' }: Opciones = {},
): MiddlewareHandler<Entorno> {
  let validador: ReturnType<typeof crearValidador> | undefined;
  return async (c, next) => {
    await next();
    const res = c.res;
    if (res.body === null || !/json/.test(res.headers.get('content-type') ?? '')) return;
    // Un método que la ruta no tiene (v2.all, en v2.ts): el contrato describe operaciones, y esa no
    // lo es. Su 405 lo comprueba problemas.test.ts.
    if (res.status === 405) return;
    // Un 5xx que ninguna ruta ha previsto: app.onError ya lo ha registrado, y no es que la respuesta
    // rompa el contrato, es que algo ha fallado. Ni se cuenta aquí ni se sustituye.
    if (res.status >= 500) return;
    validador ??= crearValidador(documento());
    // routePath, después de next(), es la ruta que respondió. Si la respuesta la hizo un middleware
    // (la comprobación contra CSRF, la sesión), es «/*»: se busca el camino entre las rutas del
    // documento. Lo que no es una ruta del contrato (el propio documento, un /v2/algo que no
    // existe y cae en el 404) no se valida.
    const rutaDeHono = c.req.routePath;
    if (rutaDeHono === `${prefijo}/openapi.json`) return;
    const camino = c.req.path.startsWith(prefijo) ? c.req.path.slice(prefijo.length) : c.req.path;
    const ruta = rutaDeHono.includes('*')
      ? validador.plantillaDe(camino)
      : plantillaDeRuta(rutaDeHono, prefijo);
    if (ruta === undefined) return;
    // Hono atiende un HEAD con la ruta del GET (y luego le quita el cuerpo): el contrato la
    // describe como GET.
    const metodo = c.req.method === 'HEAD' ? 'GET' : c.req.method;
    const cuerpo: unknown = await res
      .clone()
      .json()
      .catch(() => undefined);
    const fallos =
      cuerpo === undefined
        ? [{ donde: '', regla: 'json-no-valido', mensaje: 'el cuerpo no es JSON' }]
        : validador(metodo, ruta, res.status, cuerpo);
    if (fallos.length === 0) return;
    const requestId = c.get('requestId');
    if (modo === 'registrar') {
      // Los fallos dicen dónde y qué regla, nunca el valor: ver FalloContrato.
      log.warn(
        { requestId, metodo, ruta, estado: res.status, fallos: fallos.slice(0, 10) },
        'respuesta fuera del contrato',
      );
      return;
    }
    log.error(
      { requestId, metodo, ruta, estado: res.status, fallos: fallos.slice(0, 10) },
      'respuesta fuera del contrato',
    );
    // El 500 no hereda lo que la respuesta rota traía: un Location o una cookie de sesión no
    // tienen sentido en un error. X-Request-Id, sí.
    for (const cabecera of ['Location', 'Set-Cookie', 'ETag', 'Content-Length']) {
      c.res.headers.delete(cabecera);
    }
    c.res = problema(c, {
      type: 'about:blank',
      title: 'La respuesta no cumple el contrato',
      status: 500,
      detail: 'Esta respuesta no tiene la forma que promete el contrato (/v2/openapi.json).',
      instance: `urn:uuid:${requestId}`,
    });
  };
}
// #endregion middleware
