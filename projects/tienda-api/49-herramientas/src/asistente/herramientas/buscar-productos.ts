// buscar_productos (Fase 11, lección 3): el catálogo, para el asistente. Por ahora busca por el
// nombre; la lección 5 la cambia para buscar por el significado («algo para el frío»), sin que el
// modelo note nada: su nombre, su descripción y lo que devuelve siguen igual.
import type Anthropic from '@anthropic-ai/sdk';
import { asc, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { bd } from '../../bd.ts';
import { productos } from '../../esquema.ts';
import type { Herramienta } from './herramienta.ts';

// #region buscar
// Cuántos productos devuelve como mucho: lo que devuelve una herramienta entra en la conversación, y
// cada token de la conversación se paga en todas las vueltas que quedan.
export const MAX_PRODUCTOS = 10;

// De cada producto, lo justo para contestar: sin las categorías, que el modelo no necesita.
export interface ProductoEncontrado {
  id: number;
  nombre: string;
  precioCentimos: number;
  stock: number;
}

// Los productos cuyo nombre contiene la consulta, sin importar mayúsculas: ILIKE, el LIKE de
// PostgreSQL que no distingue entre «Taza» y «taza». Es la función que hace el trabajo, y no sabe
// nada del modelo: el servidor MCP de la lección 4 llama a esta misma.
export function buscarProductosPorNombre(consulta: string): Promise<ProductoEncontrado[]> {
  return bd
    .select({
      id: productos.id,
      nombre: productos.nombre,
      precioCentimos: productos.precioCentimos,
      stock: productos.stock,
    })
    .from(productos)
    .where(ilike(productos.nombre, `%${sinComodines(consulta)}%`))
    .orderBy(asc(productos.id))
    .limit(MAX_PRODUCTOS);
}

// En un LIKE, % es «cualquier cosa» y _ es «una letra cualquiera». Lo que busca el modelo es texto,
// no un patrón: delante de cada uno (y de la \, que es la que escapa) va una \, y cuentan como lo
// que son. Sin esto, una consulta «%» devolvería el catálogo entero.
const sinComodines = (texto: string) => texto.replace(/[\\%_]/g, '\\$&');
// #endregion buscar

// #region definicion
// Lo que ve el modelo. La descripción no es para personas: es lo que el modelo lee para decidir
// cuándo usarla, qué pasarle y cómo leer lo que devuelve. strict: true hace que la API solo deje al
// modelo llamarla con una entrada que cumple el esquema (un objeto con consulta, de texto, y nada
// más: additionalProperties: false). Los límites (que no esté vacía, que no sea larguísima) no
// caben en el modo strict, que no admite minLength ni maxLength: los pone Zod, abajo.
const definicion: Anthropic.Tool = {
  name: 'buscar_productos',
  description:
    'Busca productos en el catálogo de la tienda por su nombre. Úsala siempre que el cliente pregunte si hay algo, cuánto cuesta o cuántas unidades quedan, antes de contestar: no sabes qué hay en la tienda si no lo buscas. Busca por una palabra del nombre, en singular y sin artículos (taza, sudadera, gorra): no entiende frases ni descripciones. Devuelve una lista de como mucho 10 productos, cada uno con su id, su nombre, su precio en céntimos de euro (precioCentimos: 850 son 8,50 €) y las unidades que quedan (stock: 0 es que está agotado). Una lista vacía es que no hay ninguno con ese nombre.',
  input_schema: {
    type: 'object',
    properties: {
      consulta: {
        type: 'string',
        description: 'Una palabra del nombre del producto, en singular: taza, camiseta, sudadera.',
      },
    },
    required: ['consulta'],
    additionalProperties: false,
  },
  strict: true,
};
// #endregion definicion

// #region herramienta
// Lo que manda el modelo se comprueba otra vez, como cualquier dato que llega de fuera (Fase 3): el
// modo strict es una promesa de la API, y la tienda no se fía de nadie para sus datos.
const entrada = z.strictObject({
  consulta: z
    .string({ error: 'Tiene que ser un texto' })
    .trim()
    .min(1, 'No puede estar vacía')
    .max(100, 'Como máximo, 100 caracteres'),
});

export const buscarProductos: Herramienta = {
  definicion,
  etiqueta: 'Buscando productos…',
  async ejecutar(datos) {
    const { consulta } = entrada.parse(datos);
    return buscarProductosPorNombre(consulta);
  },
};
// #endregion herramienta
