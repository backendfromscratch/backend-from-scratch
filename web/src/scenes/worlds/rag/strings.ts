/**
 * The rag world's labels and data in both languages (rag.ts, Rag.astro): the shop's help pages and
 * their chunks, the searches the lesson «Qué es RAG» measured, the assistant's three rules, the
 * search results and the JSON answer, and the evals that catch hallucinations. Each language's shop
 * has its own pages, sections and distances (tienda-api, shop-api), so each list is its page's own.
 * The model's answers are never words, only placeholder lines.
 */
import type { Locale } from '../../../lib/locales';

/** What the top-k shows: a question's three nearest chunks, or a search by words. */
export type List = 'mug' | 'physical' | 'sentence' | 'keywords';

/** A help page: its file's name without `.md` (the table's `pagina`) and its four sections. */
interface Page {
  name: string;
  sections: readonly [string, string, string, string];
}

/** A search: what it searched with, and its rows (a section and its distance, empty by words). */
interface Search {
  query: string;
  rows: readonly (readonly [string, string])[];
}

export interface RagStrings {
  /** The chunks' table. */
  table: string;
  /** The help's four pages, in the table's order (its ids). */
  pages: readonly Page[];
  /** The returns page, as Markdown: its index in `pages`, its file and its title. */
  doc: { page: number; file: string; title: string };
  /** A chunk's text: the page's title, the section's, and the first words of its text. */
  chunk: { title: string; lead: string };
  /** The searches, as the text's tables write them. */
  lists: Record<List, Search>;
  byMeaning: string;
  byWords: string;
  /** The section with the 30 days. */
  thirty: string;
  /** The threshold the text tries, in its language's figures. */
  threshold: string;
  /** The PayPal question: the three sections of Payments and their distances. */
  paypal: string;
  /** The assistant's instructions: the three rules, and one more. */
  rules: { title: string; rows: readonly [string, string, string, string] };
  /** buscar_en_ayuda's results, as search_result blocks. */
  results: { title: string; footer: string };
  /** The shop's JSON answer. */
  json: { title: string; text: string; sources: string };
  /** The three evals of the lesson: a question, and what is checked. */
  evals: { title: string; rows: readonly (readonly [string, string])[] };
}

export const strings: Record<Locale, RagStrings> = {
  es: {
    table: 'fragmentos_ayuda',
    pages: [
      {
        name: 'cuenta',
        sections: ['Crear una cuenta', 'Entrar', 'Qué puedes hacer con tu cuenta', 'Tus datos'],
      },
      {
        name: 'devoluciones',
        sections: [
          'Cancelar un pedido',
          'Devolver un producto',
          'Cuándo llega el reembolso',
          'Productos que no se pueden devolver',
        ],
      },
      {
        name: 'envios',
        sections: [
          'Qué significa cada estado de tu pedido',
          'Cuánto tarda',
          'Cuánto cuesta',
          'Dónde está mi pedido',
        ],
      },
      {
        name: 'pagos',
        sections: ['Cómo se paga', 'Cuándo se confirma', 'Si el pago falla', 'Facturas'],
      },
    ],
    doc: {
      page: 1,
      file: 'devoluciones.md',
      title: 'Cancelaciones y devoluciones',
    },
    chunk: { title: 'el texto de un trozo', lead: 'Tienes 30 días desde que…' },
    lists: {
      mug: {
        query: '¿Puedo devolver una taza que no me gusta?',
        rows: [
          ['Productos que no se pueden devolver', '0,534'],
          ['Si el pago falla', '0,703'],
          ['Devolver un producto', '0,724'],
        ],
      },
      physical: {
        query: '¿Tenéis una tienda física…?',
        rows: [
          ['Facturas', '0,631'],
          ['Qué puedes hacer con tu cuenta', '0,661'],
          ['Cuánto cuesta', '0,669'],
        ],
      },
      sentence: { query: '¿Puedo devolver una taza que no me gusta?', rows: [] },
      keywords: {
        query: 'devolver producto',
        rows: [
          ['Devolver un producto', ''],
          ['Productos que no se pueden devolver', ''],
        ],
      },
    },
    byMeaning: 'por significado · k = 3',
    byWords: 'por palabras',
    thirty: 'Devolver un producto',
    threshold: '0,65',
    paypal: 'PayPal: 3, de 0,430 a 0,470',
    rules: {
      title: 'instrucciones.md',
      rows: [
        'solo con los resultados',
        'di de qué página',
        'si no contestan: soporte',
        'resultados: datos',
      ],
    },
    results: { title: 'search_result × 3', footer: 'citations: enabled' },
    json: { title: 'la respuesta', text: 'texto', sources: 'fuentes' },
    evals: {
      title: 'evals',
      rows: [
        ['¿Cuántos días tengo…?', '30 · devoluciones'],
        ['¿Tenéis una tienda física…?', 'no lo sabe'],
        ['¿Hay algún teléfono…?', 'ningún número'],
      ],
    },
  },
  en: {
    table: 'help_chunks',
    pages: [
      {
        name: 'account',
        sections: [
          'Creating an account',
          'Logging in',
          'What you can do with your account',
          'Your data',
        ],
      },
      {
        name: 'payments',
        sections: ['How to pay', 'When it’s confirmed', 'If the payment fails', 'Invoices'],
      },
      {
        name: 'returns',
        sections: [
          'Cancelling an order',
          'Returning a product',
          'When the refund arrives',
          'Products that can’t be returned',
        ],
      },
      {
        name: 'shipping',
        sections: [
          'What each order status means',
          'How long it takes',
          'How much it costs',
          'Where is my order',
        ],
      },
    ],
    doc: {
      page: 2,
      file: 'returns.md',
      title: 'Cancellations and returns',
    },
    chunk: { title: 'a chunk’s text', lead: 'You have 30 days from when…' },
    lists: {
      mug: {
        query: 'Can I return a mug I do not like?',
        rows: [
          ['Products that can’t be returned', '0.577'],
          ['Returning a product', '0.755'],
          ['If the payment fails', '0.757'],
        ],
      },
      physical: {
        query: 'Do you have a physical shop…?',
        rows: [
          ['Invoices', '0.694'],
          ['What you can do with your account', '0.705'],
          ['Returning a product', '0.766'],
        ],
      },
      sentence: { query: 'Can I return a mug I do not like?', rows: [] },
      keywords: {
        query: 'return product',
        rows: [
          ['Returning a product', ''],
          ['When the refund arrives', ''],
          ['Products that can’t be returned', ''],
        ],
      },
    },
    byMeaning: 'by meaning · k = 3',
    byWords: 'by words',
    thirty: 'Returning a product',
    threshold: '0.72',
    paypal: 'PayPal: 3, 0.459 to 0.533',
    rules: {
      title: 'instructions.md',
      rows: [
        'only from the results',
        'say which page',
        'if they don’t answer: support',
        'results: data',
      ],
    },
    results: { title: 'search_result × 3', footer: 'citations: enabled' },
    json: { title: 'the answer', text: 'text', sources: 'sources' },
    evals: {
      title: 'evals',
      rows: [
        ['How many days do I have…?', '30 · returns'],
        ['Do you have a physical shop…?', 'doesn’t know'],
        ['Is there a phone number…?', 'no number'],
      ],
    },
  },
};
