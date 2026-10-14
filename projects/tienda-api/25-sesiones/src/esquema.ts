// Las tablas de la tienda, descritas en TypeScript para Drizzle. Las crean las migraciones
// (bd/migraciones/); este fichero le cuenta a Drizzle cómo son, para que escriba las consultas y
// sepa qué tipo tiene cada columna. Cada columna lleva su nombre en la base de datos (precio_centimos)
// y el de la propiedad en TypeScript (precioCentimos): Drizzle traduce de uno a otro.
// La tabla migraciones no está: es de nuestro ejecutor (scripts/migrar.ts), no de la tienda.
import { relations, sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { EstadoPedido } from './datos.ts';

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
  },
  (tabla) => [
    check('pedidos_cantidad_check', sql`${tabla.cantidad} > 0`),
    check(
      'pedidos_estado_check',
      sql`${tabla.estado} IN ('pendiente', 'pagado', 'enviado', 'cancelado')`,
    ),
    index('pedidos_por_fecha').on(tabla.creadoEn.desc(), tabla.id.desc()),
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
  },
  (tabla) => [uniqueIndex('usuarios_email_unico').on(sql`lower(${tabla.email})`)],
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
