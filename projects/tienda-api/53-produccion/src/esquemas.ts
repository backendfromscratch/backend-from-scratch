// Los esquemas: la forma de los datos que entran y de los que salen. Zod los comprueba al
// ejecutarse y, desde la lección 5, también salen de ellos los de la documentación (OpenAPI).
// Por eso z viene de @hono/zod-openapi: es el z de Zod, con un método más, .openapi().
import { z } from '@hono/zod-openapi';
import { problemaDeContrasena } from './contrasenas.ts';
import { leerCursor } from './paginacion.ts';

// Lo que llega en el cuerpo. .openapi('Nombre') le pone nombre en la documentación, y example
// es un valor de muestra que la página de /docs rellena al probar una ruta.
export const esquemaPedidoNuevo = z
  .object({
    productoId: z
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .openapi({ example: 1 }),
    cantidad: z
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .min(1, 'Como mínimo, 1')
      .max(10, 'Como máximo, 10 por pedido')
      .openapi({ example: 2 }),
  })
  .openapi('PedidoNuevo');

// Lo único que el cliente puede cambiar de un pedido es la cantidad. El estado no: cambia con lo
// que pasa (un pago, un envío, una cancelación), no porque alguien lo escriba.
export const esquemaCambioPedido = z
  .object({ cantidad: esquemaPedidoNuevo.shape.cantidad })
  .openapi('CambioPedido');

export const esquemaNombre = z
  .string({ error: 'Tiene que ser un texto' })
  .trim()
  .min(1, 'No puede estar vacío')
  .max(60, 'Como máximo, 60 letras')
  .openapi({ example: 'Gorra' });

// #region descripcion
// La descripción de un producto (Fase 11, lección 5): unas frases que dicen qué es y para qué sirve.
// Con el nombre, es de lo que sale su vector: la búsqueda por el significado la lee.
export const esquemaDescripcion = z
  .string({ error: 'Tiene que ser un texto' })
  .trim()
  .min(1, 'No puede estar vacía')
  .max(500, 'Como máximo, 500 caracteres')
  .openapi({ example: 'Bufanda larga de lana gruesa, para el frío del invierno.' });
// #endregion descripcion

// Un producto nuevo: el precio, en céntimos enteros. La descripción, opcional (Fase 11).
export const esquemaProductoNuevo = z
  .object({
    nombre: esquemaNombre,
    descripcion: esquemaDescripcion.optional(),
    precioCentimos: z
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero de céntimos')
      .positive('Tiene que ser mayor que 0')
      .max(1_000_000, 'Como máximo, 1 000 000 céntimos (10 000 €)')
      .openapi({ example: 1500, description: 'El precio en céntimos: 1500 son 15,00 €' }),
  })
  .openapi('ProductoNuevo');

// #region cambio-producto
// Cambiar un producto (Fase 9): el nombre, el precio o los dos, con las mismas reglas que al
// crearlo. Los dos, opcionales; pero un cambio sin ninguno ({}) no cambia nada: 422.
// Desde la Fase 11, también la descripción.
export const esquemaCambioProducto = z
  .object({
    nombre: esquemaNombre.optional(),
    descripcion: esquemaDescripcion.optional(),
    precioCentimos: esquemaProductoNuevo.shape.precioCentimos.optional(),
  })
  .refine(
    (cambio) =>
      cambio.nombre !== undefined ||
      cambio.descripcion !== undefined ||
      cambio.precioCentimos !== undefined,
    { error: 'Cambia al menos el nombre, la descripción o el precio' },
  )
  .openapi('CambioProducto');
// #endregion cambio-producto

// Lo que la API responde. Zod no comprueba las respuestas: estos esquemas son para el contrato,
// para que quien use la API sepa qué va a recibir.
export const esquemaProducto = z
  .object({
    id: z.number().int().openapi({ example: 2 }),
    nombre: z.string().openapi({ example: 'Taza' }),
    precioCentimos: z.number().int().openapi({ example: 850 }),
    // Un campo nuevo: añadirlo no rompe a nadie (Fase 4, lección 4). Solo en la versión 2.
    stock: z.number().int().min(0).openapi({ example: 12, description: 'Cuántas unidades quedan' }),
    // Otro campo nuevo (Fase 11): null si el producto no tiene descripción.
    descripcion: z.string().nullable().openapi({
      example: 'Taza de cerámica de 350 ml, para el café de la mañana.',
      description: 'Qué es y para qué sirve; null si no tiene',
    }),
    categorias: z
      .array(z.string())
      .openapi({ example: ['Hogar', 'Regalos'], description: 'Sus categorías, por nombre' }),
  })
  .openapi('Producto');

export const esquemaPedido = z
  .object({
    id: z.number().int().openapi({ example: 7 }),
    productoId: z.number().int().openapi({ example: 1 }),
    cantidad: z.number().int().openapi({ example: 2 }),
    estado: z.enum(['pendiente', 'pagado', 'enviado', 'cancelado']),
    // Una fecha y hora en ISO 8601: en el contrato sale como string con format: date-time.
    creadoEn: z.iso.datetime().openapi({ example: '2026-10-13T09:30:00.000Z' }),
    // De quién es: el id de su cuenta. null en los pedidos de antes de que hubiera cuentas.
    clienteId: z.number().int().nullable().openapi({ example: 3 }),
  })
  .openapi('Pedido');

// Un error, con la forma de la RFC 9457 (lección 2).
export const esquemaProblema = z
  .object({
    type: z.string().openapi({ example: 'https://tienda.example/problemas/datos-no-validos' }),
    title: z.string().openapi({ example: 'Los datos no son válidos' }),
    status: z.number().int().openapi({ example: 422 }),
    detail: z.string().optional(),
    instance: z.string().optional(),
    errores: z.array(z.object({ campo: z.string(), problema: z.string() })).optional(),
  })
  .openapi('Problema');

// Lo que viene en la ruta y en la query string siempre es texto: coerce lo convierte en número.
// Como coerce acepta cualquier cosa, la documentación no sabría decir de qué tipo es ni que es
// obligatorio: .openapi() se lo dice.
export const esquemaId = z.object({
  id: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .openapi({ type: 'integer', param: { required: true }, example: 2 }),
});

export const esquemaFiltro = z.object({
  maxCentimos: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero de céntimos')
    .positive('Tiene que ser mayor que 0')
    .optional()
    .openapi({ type: 'integer', description: 'Solo los que cuestan esto o menos, en céntimos' }),
  orden: z
    .enum(['precio', '-precio'], { error: 'Tiene que ser precio o -precio' })
    .optional()
    .openapi({ description: 'precio, de menor a mayor; -precio, de mayor a menor' }),
  categoria: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .min(1, 'No puede estar vacío')
    .optional()
    .openapi({
      example: 'ropa',
      description: 'Solo los de esta categoría (da igual en mayúsculas)',
    }),
});

// El cursor llega como texto: se convierte en la fecha y el id que lleva dentro, y se comprueban.
// También lo usa la herramienta pedidos_para_enviar del servidor MCP (src/mcp.ts).
const noValido = 'El cursor no es válido';
export const esquemaCursor = z
  .string()
  .transform(leerCursor)
  .pipe(
    z.object(
      {
        creadoEn: z.iso.datetime({ error: noValido }),
        id: z.number({ error: noValido }).int(noValido).positive(noValido),
      },
      { error: noValido },
    ),
  );

// Lo que se puede pedir en GET /pedidos. Todo es opcional: sin nada, la primera página de 10.
export const esquemaListaPedidos = z
  .object({
    limite: z.coerce
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .min(1, 'Como mínimo, 1')
      .max(50, 'Como máximo, 50')
      .default(10),
    cursor: esquemaCursor
      .optional()
      .openapi({ description: 'El de la cabecera Link de la página anterior' }),
    desplazamiento: z.coerce
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .min(0, 'Como mínimo, 0')
      .optional()
      .openapi({ type: 'integer', description: 'Cuántos saltarse (para comparar con el cursor)' }),
    // Los mismos estados que EstadoPedido, en datos.ts.
    estado: z
      .enum(['pendiente', 'pagado', 'enviado', 'cancelado'], {
        error: 'Tiene que ser pendiente, pagado, enviado o cancelado',
      })
      .optional(),
  })
  .refine((query) => query.cursor === undefined || query.desplazamiento === undefined, {
    error: 'Usa cursor o desplazamiento, no los dos',
    path: ['cursor'],
  });

// El aviso de la pasarela de pago: qué ha pasado (tipo), con qué pedido y un id del evento.
export const esquemaEventoPago = z
  .object({
    id: z.string({ error: 'Tiene que ser un texto' }).min(1).openapi({ example: 'evt_1234' }),
    tipo: z.literal('pago.completado', { error: 'Solo se aceptan pagos completados' }),
    pedidoId: z.number({ error: 'Tiene que ser un número' }).int().openapi({ example: 7 }),
  })
  .openapi('EventoPago');

// Lo que la tienda responde: recibido, y si ya lo había recibido antes.
export const esquemaAcuse = z
  .object({ recibido: z.string(), repetido: z.boolean() })
  .openapi('Acuse');

// #region cuenta-nueva
// Una cuenta nueva: el email y la contraseña. Las reglas de la contraseña están en contrasenas.ts;
// superRefine las aplica y, si falla una, pone su mensaje como el problema del campo.
export const esquemaCuentaNueva = z
  .object({
    email: z
      .email({ error: 'Tiene que ser un email' })
      .max(254, 'Como máximo, 254 caracteres')
      .openapi({ example: 'marta@ejemplo.com' }),
    contrasena: z
      .string({ error: 'Tiene que ser un texto' })
      .superRefine((contrasena, contexto) => {
        const problema = problemaDeContrasena(contrasena);
        if (problema) contexto.addIssue({ code: 'custom', message: problema });
      })
      .openapi({
        example: 'una frase larga que solo sé yo',
        description: 'De 15 a 128 caracteres, y que no sea de las más usadas',
      }),
  })
  .openapi('CuentaNueva');

// Lo que la API enseña de una cuenta: el id, el email y el rol. El hash, nunca. catalogo (Fase 11)
// solo lo tienen las claves de API.
const esquemaRol = z
  .enum(['cliente', 'reparto', 'admin', 'catalogo'])
  .openapi({ example: 'cliente', description: 'catalogo: solo las claves de API' });

export const esquemaUsuario = z
  .object({
    id: z.number().int().openapi({ example: 5 }),
    email: z.string().openapi({ example: 'marta@ejemplo.com' }),
    rol: esquemaRol,
  })
  .openapi('Usuario');
// #endregion cuenta-nueva

// #region credenciales
// Para iniciar sesión: aquí no se aplican las reglas de la contraseña (eso es al crearla), solo un
// tope, para no calcular el hash de un texto enorme.
export const esquemaCredenciales = z
  .object({
    email: z
      .string({ error: 'Tiene que ser un texto' })
      .max(254, 'Como máximo, 254 caracteres')
      .openapi({ example: 'ana@tienda.example' }),
    contrasena: z
      .string({ error: 'Tiene que ser un texto' })
      .min(1, 'No puede estar vacía')
      .max(128, 'Como máximo, 128 caracteres')
      .openapi({ example: 'ana-practica-2026' }),
  })
  .openapi('Credenciales');
// #endregion credenciales

// #region yo
// Quién eres: una persona (con su email) o un programa (con el nombre de su clave). tipo dice cuál.
export const esquemaYo = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('usuario'),
      id: z.number().int(),
      email: z.string(),
      rol: esquemaRol,
    }),
    z.object({
      tipo: z.literal('clave'),
      id: z.number().int(),
      nombre: z.string().openapi({ example: 'Reparto Rápido' }),
      rol: esquemaRol,
    }),
  ])
  .openapi('Yo');
// #endregion yo

// #region aviso
// La URL a la que la empresa de reparto quiere los avisos, y lo que la tienda contesta: la URL tal
// y como la guardó y el secreto con el que firmará cada aviso (cada vez, uno nuevo).
export const esquemaAviso = z
  .object({
    url: z
      .string({ error: 'Tiene que ser un texto' })
      .max(2000, 'Como máximo, 2000 caracteres')
      .openapi({ example: 'https://reparto.example/avisos' }),
  })
  .openapi('Aviso');

export const esquemaAvisoGuardado = z
  .object({ url: z.string(), secreto: z.string() })
  .openapi('AvisoGuardado');
// #endregion aviso

// #region asistente
// La conversación con el asistente (Fase 11). La tienda no guarda conversaciones: el frontend manda
// cada vez los últimos mensajes, y la tienda se los pasa al modelo (la API del modelo tampoco
// recuerda nada). Los topes no son de adorno: cada carácter que llega al modelo cuesta dinero, así
// que como mucho van 20 mensajes de 2000 caracteres. Y la conversación empieza y acaba con el
// cliente: la API pide que el primer mensaje sea del usuario, y la respuesta es al último.
export const MAX_MENSAJES = 20;
export const MAX_CARACTERES = 2000;

export const esquemaMensajeAsistente = z
  .object({
    rol: z.enum(['usuario', 'asistente'], { error: 'Tiene que ser usuario o asistente' }),
    texto: z
      .string({ error: 'Tiene que ser un texto' })
      .trim()
      .min(1, 'No puede estar vacío')
      .max(MAX_CARACTERES, `Como máximo, ${MAX_CARACTERES} caracteres`)
      .openapi({ example: 'Hola, ¿me ayudas con una compra?' }),
  })
  .openapi('MensajeAsistente');

export const esquemaPreguntaAsistente = z
  .object({
    mensajes: z
      .array(esquemaMensajeAsistente, { error: 'Tiene que ser una lista de mensajes' })
      .min(1, 'Como mínimo, un mensaje')
      .max(MAX_MENSAJES, `Como máximo, los ${MAX_MENSAJES} últimos mensajes`)
      .refine((mensajes) => mensajes[0]?.rol === 'usuario', {
        error: 'El primer mensaje tiene que ser del usuario',
      })
      .refine((mensajes) => mensajes.at(-1)?.rol === 'usuario', {
        error: 'El último mensaje tiene que ser del usuario: es al que contesta el asistente',
      })
      .openapi({
        description:
          'La conversación, del mensaje más antiguo a la última pregunta: empieza y acaba con uno del usuario',
      }),
  })
  .openapi('PreguntaAsistente');

// Una fuente (lección 6): una sección de una página de ayuda que cita la respuesta del asistente.
export const esquemaFuenteAsistente = z
  .object({
    pagina: z.string().openapi({
      description: 'La página de ayuda: el nombre de su fichero, sin .md',
      example: 'devoluciones',
    }),
    titulo: z.string().openapi({
      description: 'El título de la página',
      example: 'Cancelaciones y devoluciones',
    }),
    seccion: z.string().openapi({
      description: 'El título de la sección',
      example: 'Devolver un producto',
    }),
  })
  .openapi('FuenteAsistente');

// Lo que contesta: el texto, si el modelo se ha negado a contestar (entonces el texto es una frase
// fija de la tienda) y cuántos tokens ha costado. Un token es un trozo de palabra: es lo que cuenta
// y cobra la API. Con herramientas (lección 3), una respuesta son varias llamadas al modelo, y se
// pagan todas: uso las suma. Y, desde la lección 6, sus fuentes: las secciones de la ayuda que cita.
// Salen de las citas que la API pone en la respuesta, y la tienda las busca entre lo que devolvió
// buscar_en_ayuda: los datos de cada sección son los suyos. Un «no lo sé» no cita nada: sin fuentes.
export const esquemaRespuestaAsistente = z
  .object({
    texto: z.string().openapi({ example: '¡Hola, Carmen! ¿En qué te ayudo?' }),
    rechazada: z.boolean().openapi({
      description: 'true si el modelo se ha negado a contestar: texto es entonces una frase fija',
    }),
    // Desde la lección 7, con los tokens de la caché: con ella, las instrucciones y las herramientas
    // dejan de contar en entrada y pasan a lecturaCache (o, la primera vez, a escrituraCache).
    uso: z
      .object({
        entrada: z.number().int().openapi({ example: 112 }),
        salida: z.number().int().openapi({ example: 38 }),
        lecturaCache: z.number().int().openapi({ example: 1650 }),
        escrituraCache: z.number().int().openapi({ example: 0 }),
      })
      .openapi({
        description:
          'Los tokens, sumados los de todas las llamadas al modelo: los de entrada que no salen de la caché (entrada), los de la respuesta (salida) y los de entrada que se leen de la caché (lecturaCache) o se guardan en ella (escrituraCache). Lo que lee el modelo (instrucciones, herramientas y conversación) es entrada + lecturaCache + escrituraCache',
      }),
    fuentes: z.array(esquemaFuenteAsistente).openapi({
      description:
        'Las secciones de la ayuda de la tienda que cita la respuesta (de entre las que le ha devuelto al asistente su herramienta buscar_en_ayuda), sin repetir, en el orden en que las cita. Vacía si no cita ninguna (no ha buscado en la ayuda, o la ayuda no dice lo que se pregunta) o si se ha negado a contestar',
    }),
  })
  .openapi('RespuestaAsistente');
// #endregion asistente

// #region descripcion-encargada
// Lo que responde POST /v2/productos/{id}/descripcion (Fase 11, lección 7): 202, el encargo está
// apuntado, y el trabajador escribirá la descripción en unos segundos. No hay nada más que esperar:
// la descripción nueva saldrá en el producto (GET /v2/productos/{id}, la URL de Location).
export const esquemaDescripcionEncargada = z
  .object({
    productoId: z.number().int().openapi({ example: 7 }),
    estado: z.literal('en-cola').openapi({
      description: 'El trabajador la escribirá con el modelo y la guardará en el producto',
    }),
  })
  .openapi('DescripcionEncargada');
// #endregion descripcion-encargada
