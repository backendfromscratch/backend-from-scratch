/**
 * The nat world's labels in both languages (nat.ts, Nat.astro). The addresses are the lesson's
 * (NatTranslation's example addresses, and example.com's real one).
 */
import type { Locale } from '../../../lib/locales';

export interface NatStrings {
  pc: string;
  mobile: string;
  neighbour: string;
  tokyo: string;
  browser: string;
  gw: string;
  inside: string;
  outside: string;
  table: string;
  isp: string;
  sockets: string;
  listens: string;
  routes: string;
  /** The laptop's route table, as the lesson simplifies it. */
  route: readonly (readonly [string, string])[];
  building: string;
  reception: string;
  office: string;
  notebook: string;
}

export const strings: Record<Locale, NatStrings> = {
  es: {
    pc: 'tu portátil',
    mobile: 'tu móvil',
    neighbour: 'tu vecino',
    tokyo: 'alguien en Tokio',
    browser: 'navegador',
    gw: 'router de casa',
    inside: 'dentro',
    outside: 'fuera',
    table: 'tabla NAT',
    isp: 'routers de internet',
    sockets: 'sockets',
    listens: 'escucha',
    routes: 'tabla de rutas',
    route: [
      ['127.0.0.1 o ::1', 'a sí mismo'],
      ['192.168.1.…', 'por el wifi'],
      ['cualquier otra', '192.168.1.1'],
    ],
    building: 'un edificio, una dirección',
    reception: 'recepción',
    office: 'despacho',
    notebook: 'libreta',
  },
  en: {
    pc: 'your laptop',
    mobile: 'your phone',
    neighbour: 'your neighbor',
    tokyo: 'someone in Tokyo',
    browser: 'browser',
    gw: 'home router',
    inside: 'inside',
    outside: 'outside',
    table: 'NAT table',
    isp: 'internet routers',
    sockets: 'sockets',
    listens: 'listens',
    routes: 'route table',
    route: [
      ['127.0.0.1 or ::1', 'to itself'],
      ['192.168.1.…', 'over Wi-Fi'],
      ['anything else', '192.168.1.1'],
    ],
    building: 'one building, one address',
    reception: 'front desk',
    office: 'office',
    notebook: 'notebook',
  },
};
