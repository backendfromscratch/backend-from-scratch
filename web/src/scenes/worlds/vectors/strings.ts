/**
 * The vectors world's labels and data in both languages (vectors.ts, Vectors.astro): «Embeddings y
 * búsqueda semántica con pgvector» / "Embeddings and semantic search with pgvector". Each
 * language's shop measured its own distances (its catalogue's texts are its own), so the map of
 * products, the nearest products and the numbers are each language's page's.
 */
import type { Locale } from '../../../lib/locales';

/** The catalogue's groups: the four original products, then warm clothes, coffee, summer and gifts. */
type Group = 'shop' | 'warm' | 'coffee' | 'summer' | 'gifts';
/** Where a product's label goes beside its dot. */
type LabelSide = 'l' | 'r' | 't' | 'b';

/**
 * A product on the map, in board em of a 16 × 10 map. The map is not to scale: the positions only
 * keep the order of the text's distances (vectors.test.ts checks it).
 */
export interface Product {
  name: string;
  group: Group;
  at: readonly [number, number];
  side: LabelSide;
}

export interface VectorsStrings {
  /** The catalogue as `buscar_productos` searches it by name (lesson 3), its first products. */
  catalog: { title: string; sub: string; names: readonly string[]; more: string };
  /** The 20 products in the catalogue's order (`bd/datos.sql`, ids 1 to 20). */
  products: readonly Product[];
  /** The two questions of the map, where each lands, and what the text measured for each. */
  cold: { query: string; at: readonly [number, number]; nearest: readonly string[]; next: string };
  word: {
    query: string;
    at: readonly [number, number];
    /** The five nearest by meaning, the one that matches by name, and the hybrid search's five after it. */
    nearest: readonly string[];
    match: string;
    after: readonly string[];
  };
  /** The model of embeddings: what goes in (the scarf's text) and what comes out (its first numbers). */
  embedder: {
    title: string;
    sub: string;
    input: string;
    vector: readonly [string, string];
    count: string;
  };
  angle: { distance: string };
  volume: { title: string; size: string };
  worker: string;
  /** The products table: its columns, the five rows of the text's table and the new product of the lesson. */
  table: {
    head: readonly [string, string, string];
    rows: readonly (readonly [string, string])[];
    added: string;
  };
  /** HNSW's three floors, as the text's car trip names them. */
  floors: readonly [string, string, string];
  /** PostgreSQL with the outbox, and the queue (Phase 9). */
  pg: { products: string; outbox: string; event: string };
  queue: { title: string; sub: string; job: string };
  /** `docker stats` before and after loading the model, as the text's table. */
  memory: {
    title: string;
    rows: readonly (readonly [string, number, number])[];
    unit: string;
    killed: string;
  };
  /** The text's table of when words are enough: its three searches and three of its rows, with their names. */
  words: { head: readonly string[]; rows: readonly (readonly string[])[] };
}

export const strings: Record<Locale, VectorsStrings> = {
  es: {
    catalog: {
      title: 'productos',
      sub: 'por el nombre',
      names: [
        'Camiseta',
        'Taza',
        'Sudadera',
        'Gorra',
        'Bufanda',
        'Guantes',
        'Gorro de lana',
        'Manta',
      ],
      more: '… y 12 más',
    },
    products: [
      { name: 'Camiseta', group: 'shop', at: [9.6, 5.6], side: 'r' },
      { name: 'Taza', group: 'shop', at: [2.0, 8.4], side: 'r' },
      { name: 'Sudadera', group: 'shop', at: [2.4, 6.4], side: 'b' },
      { name: 'Gorra', group: 'shop', at: [10.5, 3.9], side: 'r' },
      { name: 'Bufanda', group: 'warm', at: [3.9, 2.6], side: 'l' },
      { name: 'Guantes', group: 'warm', at: [5.0, 2.45], side: 't' },
      { name: 'Gorro de lana', group: 'warm', at: [6.0, 4.8], side: 'b' },
      { name: 'Manta', group: 'warm', at: [3.8, 4.2], side: 'l' },
      { name: 'Café en grano', group: 'coffee', at: [3.6, 9.4], side: 'r' },
      { name: 'Cafetera italiana', group: 'coffee', at: [1.2, 9.4], side: 'r' },
      { name: 'Tetera', group: 'coffee', at: [5.6, 9.2], side: 'r' },
      { name: 'Delantal', group: 'coffee', at: [8.0, 7.4], side: 'b' },
      { name: 'Gafas de sol', group: 'summer', at: [12.4, 1.2], side: 'r' },
      { name: 'Abanico', group: 'summer', at: [7.0, 2.8], side: 'r' },
      { name: 'Toalla de playa', group: 'summer', at: [12.8, 2.6], side: 'r' },
      { name: 'Sombrero de paja', group: 'summer', at: [14.0, 1.6], side: 'r' },
      { name: 'Chanclas', group: 'summer', at: [14.4, 3.6], side: 'r' },
      { name: 'Tarjeta regalo', group: 'gifts', at: [13.6, 8.4], side: 'r' },
      { name: 'Vela aromática', group: 'gifts', at: [11.8, 9.0], side: 'r' },
      { name: 'Libreta', group: 'gifts', at: [11.0, 6.9], side: 'r' },
    ],
    cold: {
      query: 'algo para el frío',
      at: [5.0, 3.6],
      nearest: ['Guantes', 'Manta', 'Bufanda', 'Gorro de lana', 'Abanico'],
      next: 'Sudadera',
    },
    word: {
      query: 'taza',
      at: [9.2, 4.6],
      nearest: ['Camiseta', 'Gorra', 'Abanico', 'Libreta', 'Delantal'],
      match: 'Taza',
      after: ['Camiseta', 'Gorra', 'Abanico', 'Libreta', 'Delantal'],
    },
    embedder: {
      title: 'modelo',
      sub: 'texto → vector',
      input: 'Bufanda. Bufanda larga de lana gruesa…',
      vector: ['[-0.025254654,', '0.018033236, …'],
      count: '384 números',
    },
    angle: { distance: 'distancia' },
    volume: { title: 'volumen modelos', size: '135 MB' },
    worker: 'trabajador',
    table: {
      head: ['nombre', 'embedding', 'distancia'],
      rows: [
        ['Bufanda', '0,410'],
        ['Guantes', '0,371'],
        ['Gorro de lana', '0,444'],
        ['Manta', '0,394'],
        ['Abanico', '0,453'],
      ],
      added: 'Calcetines de lana',
    },
    floors: ['autopista', 'carretera', 'calle'],
    pg: { products: 'productos', outbox: 'outbox', event: 'vector-de-producto' },
    queue: { title: 'cola', sub: 'repartidor y cola', job: 'vector-de-producto' },
    memory: {
      title: 'docker stats',
      rows: [
        ['API', 193, 492],
        ['trabajador', 152, 532],
      ],
      unit: 'MiB',
      killed: 'Docker en 2 GB: el sistema mata la API (137)',
    },
    words: {
      head: ['', 'ILIKE', 'texto completo', 'embeddings'],
      rows: [
        ['encuentra', 'el trozo', 'sus variantes', 'el significado'],
        ['falla', '«tazas»', 'otras palabras', 'códigos'],
        ['necesita', 'nada', 'un índice GIN', 'un modelo'],
      ],
    },
  },
  en: {
    catalog: {
      title: 'products',
      sub: 'by name',
      names: ['T-shirt', 'Mug', 'Hoodie', 'Cap', 'Scarf', 'Gloves', 'Wool hat', 'Blanket'],
      more: '… and 12 more',
    },
    products: [
      { name: 'T-shirt', group: 'shop', at: [11.2, 4.4], side: 'r' },
      { name: 'Mug', group: 'shop', at: [8.6, 7.2], side: 'r' },
      { name: 'Hoodie', group: 'shop', at: [5.6, 4.5], side: 'r' },
      { name: 'Cap', group: 'shop', at: [12.0, 3.6], side: 'r' },
      { name: 'Scarf', group: 'warm', at: [5.4, 2.1], side: 't' },
      { name: 'Gloves', group: 'warm', at: [2.6, 1.8], side: 't' },
      { name: 'Wool hat', group: 'warm', at: [3.3, 4.2], side: 'b' },
      { name: 'Blanket', group: 'warm', at: [3.9, 2.7], side: 'l' },
      { name: 'Coffee beans', group: 'coffee', at: [9.2, 6.0], side: 'r' },
      { name: 'Moka pot', group: 'coffee', at: [7.0, 7.4], side: 'l' },
      { name: 'Teapot', group: 'coffee', at: [6.9, 5.7], side: 'l' },
      { name: 'Apron', group: 'coffee', at: [4.0, 8.6], side: 'r' },
      { name: 'Sunglasses', group: 'summer', at: [13.0, 1.6], side: 'r' },
      { name: 'Hand fan', group: 'summer', at: [7.2, 2.6], side: 'r' },
      { name: 'Beach towel', group: 'summer', at: [14.2, 2.6], side: 'r' },
      { name: 'Straw hat', group: 'summer', at: [14.6, 1.0], side: 'r' },
      { name: 'Flip-flops', group: 'summer', at: [13.6, 4.4], side: 'r' },
      { name: 'Gift card', group: 'gifts', at: [13.8, 8.4], side: 'r' },
      { name: 'Scented candle', group: 'gifts', at: [9.6, 8.2], side: 'b' },
      { name: 'Notebook', group: 'gifts', at: [12.2, 7.2], side: 'r' },
    ],
    cold: {
      query: 'something for the cold',
      at: [5.0, 3.4],
      nearest: ['Hoodie', 'Blanket', 'Scarf', 'Wool hat', 'Hand fan'],
      next: 'Gloves',
    },
    word: {
      query: 'mug',
      at: [8.0, 6.6],
      nearest: ['Mug', 'Moka pot', 'Coffee beans', 'Teapot', 'Scented candle'],
      match: 'Mug',
      after: ['Moka pot', 'Coffee beans', 'Teapot', 'Scented candle', 'Hoodie'],
    },
    embedder: {
      title: 'model',
      sub: 'text → vector',
      input: 'Scarf. Long, soft and cosy scarf…',
      vector: ['[-0.018350273,', '0.04371399, …'],
      count: '384 numbers',
    },
    angle: { distance: 'distance' },
    volume: { title: 'models volume', size: '135 MB' },
    worker: 'worker',
    table: {
      head: ['name', 'embedding', 'distance'],
      rows: [
        ['Hoodie', '0.477'],
        ['Scarf', '0.514'],
        ['Wool hat', '0.529'],
        ['Blanket', '0.492'],
        ['Hand fan', '0.547'],
      ],
      added: 'Wool socks',
    },
    floors: ['highway', 'road', 'street'],
    pg: { products: 'products', outbox: 'outbox', event: 'product-vector' },
    queue: { title: 'queue', sub: 'relayer and queue', job: 'product-vector' },
    memory: {
      title: 'docker stats',
      rows: [
        ['API', 188, 566],
        ['worker', 151, 532],
      ],
      unit: 'MiB',
      killed: 'Docker at 2 GB: the system kills the API (137)',
    },
    words: {
      head: ['', 'ILIKE', 'full text', 'embeddings'],
      rows: [
        ['finds', 'the piece', 'its variants', 'the meaning'],
        ['misses', '“mugs”', 'other words', 'codes'],
        ['needs', 'nothing', 'a GIN index', 'a model'],
      ],
    },
  },
};
