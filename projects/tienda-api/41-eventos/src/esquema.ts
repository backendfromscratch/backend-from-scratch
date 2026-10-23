// Las tablas de la tienda, descritas en TypeScript para Drizzle. Las crean las migraciones
// (bd/migraciones/); este fichero le cuenta a Drizzle cómo son, para que escriba las consultas y
// sepa qué tipo tiene cada columna. Cada columna lleva su nombre en la base de datos (precio_centimos)
// y el de la propiedad en TypeScript (precioCentimos): Drizzle traduce de uno a otro.
// La tabla migraciones no está: es de nuestro ejecutor (scripts/migrar.ts), no de la tienda.
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { Trabajo } from './cola.ts';
import type { EstadoPedido } from './datos.ts';
import type { Rol } from './permisos.ts';

// #region productos
export const productos = pgTable(
  'productos',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    precioCentimos: integer('precio_centimos').notNull(),
    stock: integer().notNull().default(0),
  },
  (tabla) => [
    check('productos_precio_centimos_check', sql`${tabla.precioCentimos} > 0`),
    check('stock_no_negativo', sql`${tabla.stock} >= 0`),
  ],
);
// #endregion productos

export const categorias = pgTable('categorias', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nombre: text().notNull().unique(),
});

// #region productos-categorias
export const productosCategorias = pgTable(
  'productos_categorias',
  {
    productoId: integer('producto_id')
      .notNull()
      .references(() => productos.id, { onDelete: 'cascade' }),
    categoriaId: integer('categoria_id')
      .notNull()
      .references(() => categorias.id, { onDelete: 'cascade' }),
  },
  (tabla) => [
    primaryKey({ columns: [tabla.productoId, tabla.categoriaId] }),
    // La clave primaria (producto_id, categoria_id) ya sirve para buscar por producto, porque
    // empieza por esa columna. Para buscar por categoría (el filtro ?categoria=) hace falta otro
    // índice que empiece por categoria_id. Lo añade la migración 004, generada por drizzle-kit.
    index('productos_categorias_por_categoria').on(tabla.categoriaId),
  ],
);
// #endregion productos-categorias

// #region pedidos
// $type le dice a TypeScript qué textos puede tener estado: los cuatro de EstadoPedido.
export const pedidos = pgTable(
  'pedidos',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productoId: integer('producto_id')
      .notNull()
      .references(() => productos.id),
    cantidad: integer().notNull(),
    estado: text().$type<EstadoPedido>().notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull(),
    // La migración 009: de quién es. Los pedidos de antes de las cuentas no lo tienen (null).
    clienteId: integer('cliente_id').references(() => usuarios.id),
  },
  (tabla) => [
    check('pedidos_cantidad_check', sql`${tabla.cantidad} > 0`),
    check(
      'pedidos_estado_check',
      sql`${tabla.estado} IN ('pendiente', 'pagado', 'enviado', 'cancelado')`,
    ),
    index('pedidos_por_fecha').on(tabla.creadoEn.desc(), tabla.id.desc()),
    index('pedidos_por_cliente').on(tabla.clienteId, tabla.creadoEn.desc(), tabla.id.desc()),
  ],
);
// #endregion pedidos

export const clavesIdempotencia = pgTable('claves_idempotencia', {
  clave: text().primaryKey(),
  cuerpoPeticion: text('cuerpo_peticion').notNull(),
  estado: integer().notNull(),
  cuerpo: text().notNull(),
  location: text(),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const eventosProcesados = pgTable('eventos_procesados', {
  id: text().primaryKey(),
  procesadoEn: timestamp('procesado_en', { withTimezone: true }).notNull().defaultNow(),
});

// #region usuarios
// La tabla de la migración 005. El índice único es sobre lower(email): un trozo de SQL (sql`…`).
export const usuarios = pgTable(
  'usuarios',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: text().notNull(),
    hashContrasena: text('hash_contrasena'),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    // La migración 008: el sub de quien entra con el proveedor de identidad.
    subProveedor: text('sub_proveedor').unique(),
    // La migración 009: su rol (permisos.ts dice qué puede hacer cada uno).
    rol: text().$type<Rol>().notNull().default('cliente'),
  },
  (tabla) => [
    uniqueIndex('usuarios_email_unico').on(sql`lower(${tabla.email})`),
    check('usuarios_rol_check', sql`${tabla.rol} IN ('cliente', 'reparto', 'admin')`),
  ],
);
// #endregion usuarios

// #region sesiones
// Drizzle no trae un tipo para bytea (bytes): customType lo define. pg ya convierte bytea en un
// Buffer de Node al leer, y un Buffer en bytea al escribir.
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const sesiones = pgTable('sesiones', {
  idHash: bytea('id_hash').primaryKey(),
  usuarioId: integer('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
  expiraEn: timestamp('expira_en', { withTimezone: true }).notNull(),
});
// #endregion sesiones

// #region claves-api
export const clavesApi = pgTable(
  'claves_api',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    hash: bytea().notNull().unique(),
    creadaEn: timestamp('creada_en', { withTimezone: true }).notNull().defaultNow(),
    usadaEn: timestamp('usada_en', { withTimezone: true }),
    rol: text().$type<Rol>().notNull().default('reparto'),
  },
  (tabla) => [check('claves_api_rol_check', sql`${tabla.rol} IN ('reparto', 'admin')`)],
);
// #endregion claves-api

// #region avisos
export const avisos = pgTable('avisos', {
  claveId: integer('clave_id')
    .primaryKey()
    .references(() => clavesApi.id, { onDelete: 'cascade' }),
  url: text().notNull(),
  secreto: text().notNull(),
  cambiadoEn: timestamp('cambiado_en', { withTimezone: true }).notNull().defaultNow(),
});
// #endregion avisos

// #region eventos-salientes
// La migración 011 (Fase 9, lección 7): lo que hay que hacer después de pagar, guardado en la misma
// transacción que el pago. bigint en modo number: JavaScript lo lee como un número normal, que no
// pierde precisión hasta 2^53 (más de nueve mil billones de eventos). datos: el trabajo entero, en
// JSON (jsonb), tal y como irá a la cola; $type le dice a TypeScript qué hay dentro.
export const eventosSalientes = pgTable(
  'eventos_salientes',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tipo: text().notNull(),
    datos: jsonb().$type<Trabajo>().notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    enviadoEn: timestamp('enviado_en', { withTimezone: true }),
  },
  (tabla) => [
    // Un índice parcial: solo las filas sin enviar, las que busca el repartidor.
    index('eventos_salientes_sin_enviar')
      .on(tabla.creadoEn)
      .where(sql`${tabla.enviadoEn} IS NULL`),
  ],
);
// #endregion eventos-salientes

// #region relaciones
// Las relaciones no cambian nada en la base de datos: le dicen a Drizzle cómo se unen las tablas,
// para poder pedir «los productos con sus categorías» de una vez (with, en datos.ts).
export const relacionesProductos = relations(productos, ({ many }) => ({
  categorias: many(productosCategorias),
}));

export const relacionesProductosCategorias = relations(productosCategorias, ({ one }) => ({
  producto: one(productos, {
    fields: [productosCategorias.productoId],
    references: [productos.id],
  }),
  categoria: one(categorias, {
    fields: [productosCategorias.categoriaId],
    references: [categorias.id],
  }),
}));
// #endregion relaciones
