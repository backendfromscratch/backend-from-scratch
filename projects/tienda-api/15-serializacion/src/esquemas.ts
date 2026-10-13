// Los esquemas: la forma de los datos que entran y de los que salen. Zod los comprueba al
// ejecutarse y, desde la lección 5, también salen de ellos los de la documentación (OpenAPI).
// Por eso z viene de @hono/zod-openapi: es el z de Zod, con un método más, .openapi().
import { z } from '@hono/zod-openapi';
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

// Un producto nuevo: el precio, en céntimos enteros.
export const esquemaProductoNuevo = z
  .object({
    nombre: esquemaNombre,
    precioCentimos: z
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero de céntimos')
      .positive('Tiene que ser mayor que 0')
      .max(1_000_000, 'Como máximo, 1 000 000 céntimos (10 000 €)')
      .openapi({ example: 1500, description: 'El precio en céntimos: 1500 son 15,00 €' }),
  })
  .openapi('ProductoNuevo');

// Lo que la API responde. Zod no comprueba las respuestas: estos esquemas son para el contrato,
// para que quien use la API sepa qué va a recibir.
export const esquemaProducto = z
  .object({
    id: z.number().int().openapi({ example: 2 }),
    nombre: z.string().openapi({ example: 'Taza' }),
    precioCentimos: z.number().int().openapi({ example: 850 }),
  })
  .openapi('Producto');

// #region pedido
export const esquemaPedido = z
  .object({
    id: z.number().int().openapi({ example: 7 }),
    productoId: z.number().int().openapi({ example: 1 }),
    cantidad: z.number().int().openapi({ example: 2 }),
    estado: z.enum(['pendiente', 'pagado', 'enviado', 'cancelado']),
    // Una fecha y hora en ISO 8601: en el contrato sale como string con format: date-time.
    creadoEn: z.iso.datetime().openapi({ example: '2026-10-13T09:30:00.000Z' }),
  })
  .openapi('Pedido');
// #endregion pedido

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
});

// El cursor llega como texto: se convierte en el id que lleva dentro, y ese id se comprueba.
const esquemaCursor = z
  .string()
  .transform(leerCursor)
  .pipe(z.number({ error: 'El cursor no es válido' }).int().positive('El cursor no es válido'));

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
