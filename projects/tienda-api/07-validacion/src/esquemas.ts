// Los esquemas: la forma que tienen que tener los datos que llegan de fuera. Zod los comprueba
// al ejecutarse, que es justo lo que los tipos de TypeScript no hacen.
import { z } from 'zod';

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

// #region producto
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
// #endregion producto

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
});
// #endregion parametros
