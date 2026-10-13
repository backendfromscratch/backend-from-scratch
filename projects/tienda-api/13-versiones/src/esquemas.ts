// Los esquemas: la forma que tienen que tener los datos que llegan de fuera. Zod los comprueba
// al ejecutarse, que es justo lo que los tipos de TypeScript no hacen.
import { z } from 'zod';
import { leerCursor } from './paginacion.ts';

// #region pedido
export const esquemaPedido = z.object({
  productoId: z.number({ error: 'Tiene que ser un número' }).int('Tiene que ser un número entero'),
  cantidad: z
    .number({ error: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero')
    .min(1, 'Como mínimo, 1')
    .max(10, 'Como máximo, 10 por pedido'),
});

// El tipo sale del esquema: no hay que escribirlo dos veces.
export type DatosPedido = z.infer<typeof esquemaPedido>;
// #endregion pedido

// Lo único que el cliente puede cambiar de un pedido es la cantidad. El estado no: cambia con lo
// que pasa (un pago, un envío, una cancelación), no porque alguien lo escriba.
export const esquemaCambioPedido = z.object({
  cantidad: esquemaPedido.shape.cantidad,
});

export const esquemaNombre = z
  .string({ error: 'Tiene que ser un texto' })
  .trim()
  .min(1, 'No puede estar vacío')
  .max(60, 'Como máximo, 60 letras');

// #region producto
// Un producto nuevo en la versión 2: el precio, en céntimos enteros.
export const esquemaProducto = z.object({
  nombre: esquemaNombre,
  precioCentimos: z
    .number({ error: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero de céntimos')
    .positive('Tiene que ser mayor que 0')
    .max(1_000_000, 'Como máximo, 1 000 000 céntimos (10 000 €)'),
});
// #endregion producto

// #region parametros
// Lo que viene en la ruta y en la query string siempre es texto: coerce lo convierte en número.
export const esquemaId = z.object({
  id: z.coerce.number({ error: 'Tiene que ser un número' }).int('Tiene que ser un número entero'),
});

export const esquemaFiltro = z.object({
  maxCentimos: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .int('Tiene que ser un número entero de céntimos')
    .positive('Tiene que ser mayor que 0')
    .optional(),
  // precio, de menor a mayor; -precio, de mayor a menor.
  orden: z.enum(['precio', '-precio'], { error: 'Tiene que ser precio o -precio' }).optional(),
});
// #endregion parametros

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
    cursor: esquemaCursor.optional(),
    desplazamiento: z.coerce
      .number({ error: 'Tiene que ser un número' })
      .int('Tiene que ser un número entero')
      .min(0, 'Como mínimo, 0')
      .optional(),
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
