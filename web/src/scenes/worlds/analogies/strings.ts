/**
 * The analogies world's labels in both languages (analogies.ts, Analogies.astro): each Phase 11
 * lesson's analogy, as its text tells it.
 */
import type { Locale } from '../../../lib/locales';

export interface AnalogiesStrings {
  /** Lesson 1: the shop's counter and the phone translation service it pays with its card. */
  counter: string;
  sign: string;
  card: string;
  interp: string;
  heard: string;
  said: string;
  /** Lesson 2: a talk, the interpreters' booth and you in the audience. */
  speaker: string;
  booth: string;
  you: string;
  /** Lesson 3: a call center, its operator and her sheet, and the warehouse that checks who is calling. */
  customer: string;
  operator: string;
  sheet: string;
  warehouse: string;
  onLine: string;
  theirs: string;
  others: string;
  /** Lesson 4: your phone, a friend's and a laptop, each with its charger. */
  devices: readonly [string, string, string];
  /** Lesson 5: a supermarket's aisles (two of them named by the text) and its entrance. */
  aisles: readonly [string, string];
  entrance: string;
  /** Lesson 6: an open-book exam: the notes and their chapters, and the exam with two answers. */
  notes: string;
  chapters: readonly [string, string, string, string];
  exam: string;
  answers: readonly [string, string];
  /** Lesson 7: a cafeteria paid with a card with a daily balance, and its kitchen. */
  till: string;
  dish: string;
  balance: string;
  kitchen: string;
  broth: string;
}

export const strings: Record<Locale, AnalogiesStrings> = {
  es: {
    counter: 'mostrador',
    sign: 'cartel',
    card: 'nº de tarjeta',
    interp: 'traducción',
    heard: 'oye',
    said: 'dice',
    speaker: 'ponente',
    booth: 'cabina',
    you: 'tú',
    customer: 'cliente',
    operator: 'teleoperadora',
    sheet: 'estado de un pedido: dime su número',
    warehouse: 'almacén',
    onLine: 'al teléfono',
    theirs: 'sus pedidos',
    others: 'los de otro',
    devices: ['tu móvil', 'el de un amigo', 'un portátil'],
    aisles: ['ropa de invierno', 'playa'],
    entrance: 'entrada',
    notes: 'apuntes',
    chapters: ['tema 1', 'tema 2', 'tema 3', 'tema 4'],
    exam: 'examen',
    answers: ['según el tema 4…', 'no lo sé'],
    till: 'caja',
    dish: 'plato',
    balance: 'saldo de hoy',
    kitchen: 'cocina',
    broth: 'caldo',
  },
  en: {
    counter: 'counter',
    sign: 'sign',
    card: 'card number',
    interp: 'translation',
    heard: 'hears',
    said: 'says',
    speaker: 'speaker',
    booth: 'booth',
    you: 'you',
    customer: 'customer',
    operator: 'operator',
    sheet: 'status of an order: give me its number',
    warehouse: 'warehouse',
    onLine: 'on the line',
    theirs: 'their orders',
    others: 'someone else’s',
    devices: ['your phone', 'a friend’s', 'a laptop'],
    aisles: ['winter clothes', 'beach'],
    entrance: 'entrance',
    notes: 'notes',
    chapters: ['chapter 1', 'chapter 2', 'chapter 3', 'chapter 4'],
    exam: 'exam',
    answers: ['according to chapter 4…', 'I don’t know'],
    till: 'register',
    dish: 'dish',
    balance: 'today’s balance',
    kitchen: 'kitchen',
    broth: 'broth',
  },
};
