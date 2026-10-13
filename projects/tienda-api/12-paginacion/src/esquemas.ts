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

// #region cambio-pedido
// Lo único que el cliente puede cambiar de un pedido es la cantidad. El estado no: cambia con lo
// que pasa (un pago, un envío, una cancelación), no porque alguien lo escriba.
export const esquemaCambioPedido = z.object({
  cantidad: esquemaPedido.shape.cantidad,
});
// #endregion cambio-pedido

export const esquemaProducto = z.object({
  nombre: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .min(1, 'No puede estar vacío')
    .max(60, 'Como máximo, 60 letras'),
  precio: z
    .number({ error: 'Tiene que ser un número' })
    .positive('Tiene que ser mayor que 0')
    .max(10_000, 'Como máximo, 10 000 €'),
});

// #region parametros
// Lo que viene en la ruta y en la query string siempre es texto: coerce lo convierte en número.
export const esquemaId = z.object({
  id: z.coerce.number({ error: 'Tiene que ser un número' }).int('Tiene que ser un número entero'),
});

export const esquemaFiltro = z.object({
  max: z.coerce
    .number({ error: 'Tiene que ser un número' })
    .positive('Tiene que ser mayor que 0')
    .optional(),
  // precio, de menor a mayor; -precio, de mayor a menor.
  orden: z.enum(['precio', '-precio'], { error: 'Tiene que ser precio o -precio' }).optional(),
});
// #endregion parametros

// #region esquema-cursor
// El cursor llega como texto: se convierte en el id que lleva dentro, y ese id se comprueba.
const esquemaCursor = z
  .string()
  .transform(leerCursor)
  .pipe(z.number({ error: 'El cursor no es válido' }).int().positive('El cursor no es válido'));
// #endregion esquema-cursor

// #region lista-pedidos
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
// #endregion lista-pedidos
