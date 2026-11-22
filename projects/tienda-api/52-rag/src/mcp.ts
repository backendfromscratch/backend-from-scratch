// El servidor MCP de la tienda (Fase 11, lección 4). MCP (Model Context Protocol) es un protocolo
// para que cualquier agente (Claude Code, el MCP Inspector, el agente de otra empresa) descubra qué
// herramientas tiene un servidor y las use, sin que nadie escriba código para cada pareja de agente
// y servidor. Por debajo es JSON-RPC: el agente manda { "method": "tools/list" } para ver la
// lista y { "method": "tools/call", "params": { "name": …, "arguments": … } } para usar una.
//
// Va dentro de la misma API, en POST /mcp, con el transporte Streamable HTTP del SDK oficial
// (@modelcontextprotocol/sdk): cada mensaje es un POST, y la respuesta, JSON. Es la otra puerta de
// la tienda: las herramientas llaman a las mismas funciones que las rutas de /v2 y que el asistente
// (una sola forma de buscar un producto o de enviar un pedido, con dos puertas).
//
// MCP no decide quién puede hacer qué: eso lo deciden la clave de API y su rol (Fase 6), como en el
// resto de la tienda. Cada petición trae su clave, y el servidor de esa petición solo tiene las
// herramientas que permite su rol.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  consultarAyuda,
  DESCRIPCION_POR_PALABRAS as AYUDA_POR_PALABRAS,
  DESCRIPCION_POR_SIGNIFICADO as AYUDA_POR_SIGNIFICADO,
  PREGUNTA_POR_PALABRAS,
  PREGUNTA_POR_SIGNIFICADO,
} from './asistente/herramientas/buscar-en-ayuda.ts';
import {
  buscarEnCatalogo,
  CONSULTA_POR_NOMBRE,
  CONSULTA_POR_SIGNIFICADO,
  DESCRIPCION_POR_NOMBRE,
  DESCRIPCION_POR_SIGNIFICADO,
} from './asistente/herramientas/buscar-productos.ts';
import type { ClaveApi } from './claves.ts';
import { config } from './config.ts';
import { buscarProducto, enviarPedido } from './datos.ts';
import type { Entorno } from './entorno.ts';
import { esquemaCursor } from './esquemas.ts';
import { log } from './log.ts';
import { paginaPorCursor } from './paginacion.ts';
import { rolPuede } from './permisos.ts';
import { problemaHttp } from './problemas.ts';

// #region resultados
// Lo que devuelve una herramienta de MCP: una lista de bloques de contenido. Aquí, uno de texto con
// el resultado en JSON, que cualquier agente sabe leer. Siempre acotado: como mucho 10 productos,
// 50 pedidos, 3 secciones de la ayuda o uno solo. (MCP también tiene structuredContent, con un esquema de salida; el texto
// lo entiende cualquier cliente, también los que no lo leen.)
const enJson = (datos: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(datos) }],
});

// Un error que el agente tiene que ver: isError: true, y una frase que dice qué ha pasado, para que
// decida qué hacer (probar con otro id, decírselo a la persona). No es un error del protocolo: la
// llamada ha llegado bien, y es la herramienta la que no ha podido hacerlo.
const fallo = (texto: string): CallToolResult => ({
  content: [{ type: 'text', text: texto }],
  isError: true,
});

// El mayor número que cabe en una columna integer de PostgreSQL, como en ver_pedido: un id más
// grande no puede existir.
const MAX_ID = 2_147_483_647;
const esquemaId = (descripcion: string) =>
  z.number().int().positive().max(MAX_ID).describe(descripcion);
// #endregion resultados

// #region servidor
// Un servidor MCP para una petición y una clave. Es el modo sin estado (stateless) del SDK: cada
// POST crea el suyo y lo tira al terminar, sin sesiones que guardar, así que da igual qué copia de
// la API conteste (Fase 9). Y como se crea con la clave en la mano, solo tiene las herramientas que
// su rol puede usar.
function crearServidor(clave: ClaveApi, requestId: string): McpServer {
  const servidor = new McpServer({ name: 'tienda-api', version: '1.0.0' });

  // #region usar
  // Cada herramienta trabaja dentro de esta función: una línea en el log por llamada (cuál, con qué
  // clave y si ha fallado; lo que le ha pasado el agente, no) y, si algo se rompe dentro, una frase
  // corta para el agente y el error entero al log. Sin esto, el SDK le mandaría al agente el
  // mensaje del error tal cual, con lo que lleve dentro (la dirección de un servidor, un SQL).
  async function usar(
    herramienta: string,
    trabajo: () => Promise<CallToolResult>,
  ): Promise<CallToolResult> {
    const datos = { requestId, clave: clave.id, herramienta };
    try {
      const resultado = await trabajo();
      log.info(
        { ...datos, error: resultado.isError === true },
        'un agente usa una herramienta (MCP)',
      );
      return resultado;
    } catch (error) {
      log.error({ ...datos, err: error }, 'una herramienta de MCP ha fallado');
      return fallo('La herramienta ha fallado: ahora no se puede consultar.');
    }
  }
  // #endregion usar

  // #region buscar-productos
  // Las dos del catálogo, para cualquier clave. La descripción es para el agente: la lee para
  // decidir cuándo usarla, qué pasarle y cómo leer lo que devuelve. El esquema de Zod hace dos
  // trabajos: el SDK lo convierte en el JSON Schema que ve el agente en tools/list, y comprueba con
  // él cada llamada antes de ejecutar nada (una que no lo cumple no llega aquí: el agente recibe
  // isError con lo que falla). annotations son pistas para el cliente (readOnlyHint: solo lee, y un
  // cliente puede usarla sin preguntar a la persona), nunca seguridad: la seguridad es la clave.
  // Desde la lección 5, busca por el significado, con las mismas descripciones que la herramienta
  // del asistente (o por el nombre, con BUSQUEDA_SEMANTICA=no).
  const porSignificado = config.BUSQUEDA_SEMANTICA === 'si';
  servidor.registerTool(
    'buscar_productos',
    {
      title: 'Buscar productos',
      description: porSignificado ? DESCRIPCION_POR_SIGNIFICADO : DESCRIPCION_POR_NOMBRE,
      inputSchema: z.strictObject({
        consulta: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .describe(porSignificado ? CONSULTA_POR_SIGNIFICADO : CONSULTA_POR_NOMBRE),
      }),
      annotations: { readOnlyHint: true },
    },
    // La misma función que la herramienta buscar_productos del asistente.
    async ({ consulta }) =>
      usar('buscar_productos', async () => enJson(await buscarEnCatalogo(consulta))),
  );
  // #endregion buscar-productos

  // #region ver-producto
  servidor.registerTool(
    'ver_producto',
    {
      title: 'Ver un producto',
      description:
        'Consulta un producto del catálogo por su id (el que devuelve buscar_productos): su nombre, su precio en céntimos de euro (precioCentimos), las unidades que quedan (stock), su descripción (o null) y sus categorías. Si no hay ningún producto con ese id, lo dice.',
      inputSchema: z.strictObject({ id: esquemaId('El id del producto: 2.') }),
      annotations: { readOnlyHint: true },
    },
    // La misma función que GET /v2/productos/{id}, con su caché.
    async ({ id }) =>
      usar('ver_producto', async () => {
        const producto = await buscarProducto(id);
        return producto ? enJson(producto) : fallo('No hay ningún producto con ese id.');
      }),
  );
  // #endregion ver-producto

  // #region buscar-en-ayuda
  // La ayuda de la tienda (lección 6), para cualquier clave: es lo mismo que cualquiera puede leer
  // en la web de la tienda. La misma función que la herramienta buscar_en_ayuda del asistente, con
  // las mismas descripciones. Al asistente le llegan los trozos como bloques search_result, el
  // formato de la API de Claude; un agente que entra por MCP puede ser cualquier otro, así que aquí
  // van en JSON, con su página, su sección, su texto y la distancia (null si se ha buscado por
  // palabras), como los productos.
  servidor.registerTool(
    'buscar_en_ayuda',
    {
      title: 'Buscar en la ayuda',
      description: porSignificado ? AYUDA_POR_SIGNIFICADO : AYUDA_POR_PALABRAS,
      inputSchema: z.strictObject({
        pregunta: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .describe(porSignificado ? PREGUNTA_POR_SIGNIFICADO : PREGUNTA_POR_PALABRAS),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ pregunta }) =>
      usar('buscar_en_ayuda', async () => enJson(await consultarAyuda(pregunta))),
  );
  // #endregion buscar-en-ayuda

  // #region pedidos-para-enviar
  // Las dos de la empresa de reparto, solo si el rol de la clave tiene el permiso: el mismo que
  // pide la ruta de /v2 que hace lo mismo (permisos.ts). Una herramienta que la clave no puede usar
  // no existe en su servidor: no sale en tools/list, así que el agente ni la intenta, y si la llama
  // de todas formas, el SDK contesta isError: «MCP error -32602: Tool marcar_enviado not found».
  if (rolPuede(clave.rol, 'pedidos:ver-todos')) {
    servidor.registerTool(
      'pedidos_para_enviar',
      {
        title: 'Pedidos para enviar',
        description:
          'Los pedidos pagados que esperan a que la empresa de reparto los envíe, del más nuevo al más antiguo, en páginas. Cada pedido lleva su id, el id del producto (productoId: su nombre, con ver_producto), la cantidad, su estado (pagado), cuándo se hizo (creadoEn, en UTC) y el id del cliente (clienteId). Devuelve { pedidos, siguiente }: si siguiente no es null, hay más pedidos; para verlos, llama otra vez con cursor igual a siguiente.',
        inputSchema: z.strictObject({
          limite: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(10)
            .describe('Cuántos pedidos como mucho, de 1 a 50. Si no se dice, 10.'),
          // El mismo esquema que el ?cursor= de GET /v2/pedidos: lee la fecha y el id de dentro.
          cursor: esquemaCursor
            .optional()
            .describe('El valor de siguiente de la página anterior. Sin él, la primera página.'),
        }),
        annotations: { readOnlyHint: true },
      },
      // La misma función que GET /v2/pedidos?estado=pagado.
      async ({ limite, cursor }) =>
        usar('pedidos_para_enviar', async () => {
          const { pagina, siguiente } = await paginaPorCursor(limite, cursor, 'pagado');
          return enJson({ pedidos: pagina, siguiente: siguiente ?? null });
        }),
    );
  }
  // #endregion pedidos-para-enviar

  // #region marcar-enviado
  // Esta cambia algo: sin readOnlyHint, y un cliente puede pedir a la persona que lo confirme antes
  // de usarla. destructiveHint: false (no borra nada) e idempotentHint: true (llamarla dos veces
  // con el mismo id no cambia nada más: la segunda dice que ya está enviado).
  if (rolPuede(clave.rol, 'pedidos:enviar')) {
    servidor.registerTool(
      'marcar_enviado',
      {
        title: 'Marcar un pedido como enviado',
        description:
          'Marca como enviado un pedido pagado, cuando la empresa de reparto ya lo tiene. Solo vale para un pedido en estado pagado: uno pendiente de pago, cancelado o ya enviado no cambia, y la herramienta dice en qué estado está. Devuelve el pedido, ya en estado enviado. No se puede deshacer.',
        inputSchema: z.strictObject({ id: esquemaId('El número del pedido: 13.') }),
        annotations: { destructiveHint: false, idempotentHint: true },
      },
      // La misma función que POST /v2/pedidos/{id}/envio (datos.ts).
      async ({ id }) =>
        usar('marcar_enviado', async () => {
          const resultado = await enviarPedido(id);
          if (!('error' in resultado)) return enJson(resultado.pedido);
          if (resultado.error === 'no-existe') return fallo('No hay ningún pedido con ese número.');
          return fallo(`El pedido está ${resultado.estado}: solo se envía uno pagado.`);
        }),
    );
  }
  // #endregion marcar-enviado

  return servidor;
}
// #endregion servidor

export const mcp = new Hono<Entorno>();

// #region exigir-clave
// Antes de MCP, la clave: sin una clave de API que exista (cargarClave, en app.ts, ya la ha
// buscado), 401, con la misma cabecera WWW-Authenticate que el resto de la tienda. Solo claves: una
// sesión de una persona (la cookie, o su id como Bearer) no vale aquí, porque un agente trabaja con
// un rol, no como un cliente. La especificación de MCP pide además comprobar la cabecera Origin,
// por si una web le hace al navegador llamar a un servidor MCP sin contraseña de tu ordenador (DNS
// rebinding); aquí eso lo para la clave, que el navegador nunca manda por su cuenta.
mcp.use(async (c, next) => {
  if (c.var.clave === undefined) {
    return problemaHttp(
      c,
      401,
      'Identifícate con una clave de API de la tienda: Authorization: Bearer tienda_…',
      { 'WWW-Authenticate': 'Bearer realm="tienda-api"' },
    );
  }
  await next();
});
// #endregion exigir-clave

// #region ruta
// Cada POST, su servidor y su transporte, con la clave de esta petición. sessionIdGenerator:
// undefined es el modo sin estado (no hay cabecera Mcp-Session-Id), y enableJsonResponse: true hace
// que cada respuesta sea un JSON entero, en lugar de un flujo de Server-Sent Events: estas
// herramientas contestan de una vez, y nginx no necesita nada especial (nginx/tienda.conf). El
// transporte trabaja con Request y Response, los de la web (los de fetch): los mismos que Hono, así
// que recibe la petición tal cual (c.req.raw). Su respuesta la hace él, no Hono, y no lleva lo que
// la tienda ya había puesto con c.header(), como el X-Request-Id de requestId() (app.ts):
// c.newResponse la vuelve a hacer, con su código, su cuerpo y sus cabeceras, y además esas.
mcp.post('/', async (c) => {
  const servidor = crearServidor(c.var.clave!, c.get('requestId'));
  const transporte = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await servidor.connect(transporte);
  try {
    const respuesta = await transporte.handleRequest(c.req.raw);
    return c.newResponse(respuesta.body, respuesta);
  } finally {
    // La respuesta ya está entera: el servidor y el transporte de esta petición ya no sirven.
    await servidor.close();
  }
});

// GET abriría un flujo para que el servidor mande mensajes cuando quiera, y DELETE cerraría una
// sesión. Sin estado no hay ni lo uno ni lo otro: 405, como recomienda el SDK, y en Allow, lo que
// sí hay. Un cliente de MCP entiende el 405 del GET y sigue sin ese flujo.
mcp.all('/', (c) =>
  problemaHttp(c, 405, 'Este servidor MCP no guarda sesiones: solo admite POST', {
    Allow: 'POST',
  }),
);
// #endregion ruta
