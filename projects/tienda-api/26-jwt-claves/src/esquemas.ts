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
    // Un campo nuevo: añadirlo no rompe a nadie (Fase 4, lección 4). Solo en la versión 2.
    stock: z.number().int().min(0).openapi({ example: 12, description: 'Cuántas unidades quedan' }),
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
const noValido = 'El cursor no es válido';
const esquemaCursor = z
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

// Lo que la API enseña de una cuenta: el id y el email. El hash, nunca.
export const esquemaUsuario = z
  .object({
    id: z.number().int().openapi({ example: 5 }),
    email: z.string().openapi({ example: 'marta@ejemplo.com' }),
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
    }),
    z.object({
      tipo: z.literal('clave'),
      id: z.number().int(),
      nombre: z.string().openapi({ example: 'Reparto Rápido' }),
    }),
  ])
  .openapi('Yo');
// #endregion yo
