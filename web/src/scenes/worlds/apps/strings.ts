/** The apps world's labels in both languages (apps.ts, Apps.astro). */
import type { Locale } from '../../../lib/locales';

export type SeatState = 'free' | 'held' | 'sold';

export interface AppsStrings {
  /** The ticket app's header. */
  concert: string;
  buy: string;
  phone: string;
  crowd: string;
  backend: string;
  backendSub: string;
  program: string;
  /** The backend's two checks before it sells a seat (the text's steps 1 and 2). */
  checks: readonly [string, string];
  key: string;
  db: string;
  seat: Record<SeatState, string>;
  pay: string;
  mail: string;
  /** Under the payment and email services. */
  other: string;
  internet: string;
  weather: string;
  web: string;
  ios: string;
  android: string;
  /** The data scene's city and sky: the text's diagram (DataToScreen), weather_code 0. */
  city: string;
  clear: string;
  terminal: string;
  /** The try scene: each language's own `curl` run, as its text shows it (abbreviated answer). */
  curl: string;
  answer: string;
}

export const strings: Record<Locale, AppsStrings> = {
  es: {
    concert: 'Concierto',
    buy: 'Comprar 14F',
    phone: 'tu móvil · el frontend',
    crowd: 'otras personas, a la vez',
    backend: 'backend',
    backendSub: 'la tienda, en un centro de datos',
    program: 'programa',
    checks: ['¿quién eres?', '¿tiene sentido?'],
    key: 'clave de pagos',
    db: 'base de datos',
    seat: { free: 'libre', held: 'reservado', sold: 'vendido' },
    pay: 'servicio de pagos',
    mail: 'servicio de correo',
    other: 'otra empresa',
    internet: 'internet',
    weather: 'backend del tiempo',
    web: 'la web',
    ios: 'app de iPhone',
    android: 'app de Android',
    city: 'Madrid',
    clear: 'Despejado',
    terminal: 'tu terminal',
    curl: 'curl "https://api.open-meteo.com/v1/forecast?latitude=40.42&longitude=-3.70&current=temperature_2m,weather_code"',
    answer: '{"latitude":40.4375,…,"current":{…,"temperature_2m":17.4,"weather_code":95}}',
  },
  en: {
    concert: 'Concert',
    buy: 'Buy 14F',
    phone: 'your phone · the frontend',
    crowd: 'other people, at the same time',
    backend: 'backend',
    backendSub: 'the store, in a data center',
    program: 'program',
    checks: ['who are you?', 'does it make sense?'],
    key: 'payments key',
    db: 'database',
    seat: { free: 'free', held: 'reserved', sold: 'sold' },
    pay: 'payment service',
    mail: 'email service',
    other: 'another company',
    internet: 'internet',
    weather: 'weather backend',
    web: 'the website',
    ios: 'iPhone app',
    android: 'Android app',
    city: 'London',
    clear: 'Clear sky',
    terminal: 'your terminal',
    curl: 'curl "https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=-0.13&current=temperature_2m,weather_code"',
    answer: '{"latitude":51.51147,…,"current":{…,"temperature_2m":16.9,"weather_code":1}}',
  },
};
