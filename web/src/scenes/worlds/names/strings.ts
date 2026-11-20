/**
 * The names world's labels in both languages (names.ts, Names.astro): the lesson «DNS». The names,
 * servers and addresses are the lesson's own (example.com and its real servers); the domain whose
 * address changes is a documentation one (`.example`), with documentation addresses (RFC 5737).
 */
import type { Locale } from '../../../lib/locales';

interface NamesStrings {
  /** HOSTS.TXT: a few of its lines, and the computers that keep a copy. */
  hostsLines: readonly string[];
  computer: string;
  /** The hotel of the analogy. */
  guest: string;
  clerk: string;
  offices: readonly [string, string, string];
  shop: string;
  address: string;
  until: string;
  /** The servers of a query. */
  pc: string;
  resolver: string;
  root: string;
  cache: string;
  cacheEmpty: string;
  /** The text's table of records: type, name and value. */
  records: readonly (readonly [string, string, string])[];
  /** The TTL scene: your resolver, someone else's and the domain whose address changes. */
  yours: string;
  other: string;
  domain: string;
  owner: string;
  terminal: string;
}

export const strings: Record<Locale, NamesStrings> = {
  es: {
    hostsLines: ['host-a  10.0.0.1', 'host-b  10.0.0.2', 'host-c  10.0.0.3'],
    computer: 'ordenador',
    guest: 'tú',
    clerk: 'recepción',
    offices: ['turismo del país', 'turismo de la ciudad', 'comerciantes del barrio'],
    shop: 'la tienda',
    address: 'C/ Mayor, 5',
    until: 'hasta el viernes',
    pc: 'tu ordenador',
    resolver: 'resolver',
    root: 'raíz',
    cache: 'caché',
    cacheEmpty: 'vacía',
    records: [
      ['A', 'example.com', '104.20.23.154'],
      ['AAAA', 'example.com', '2606:4700:10::6814:179a'],
      ['CNAME', 'www.github.com', 'github.com'],
      ['MX', 'gmail.com', 'gmail-smtp-in.l.google.com'],
      ['TXT', 'example.com', '"v=spf1 -all"'],
      ['NS', 'example.com', 'hera.ns.cloudflare.com'],
    ],
    yours: 'tu resolver',
    other: 'otro resolver',
    domain: 'tienda.example',
    owner: 'servidor autoritativo',
    terminal: 'terminal',
  },
  en: {
    hostsLines: ['host-a  10.0.0.1', 'host-b  10.0.0.2', 'host-c  10.0.0.3'],
    computer: 'computer',
    guest: 'you',
    clerk: 'front desk',
    offices: ['country tourist office', 'city tourist office', 'business association'],
    shop: 'the shop',
    address: '5 Main St',
    until: 'until Friday',
    pc: 'your computer',
    resolver: 'resolver',
    root: 'root',
    cache: 'cache',
    cacheEmpty: 'empty',
    records: [
      ['A', 'example.com', '104.20.23.154'],
      ['AAAA', 'example.com', '2606:4700:10::6814:179a'],
      ['CNAME', 'www.github.com', 'github.com'],
      ['MX', 'gmail.com', 'gmail-smtp-in.l.google.com'],
      ['TXT', 'example.com', '"v=spf1 -all"'],
      ['NS', 'example.com', 'hera.ns.cloudflare.com'],
    ],
    yours: 'your resolver',
    other: 'another resolver',
    domain: 'shop.example',
    owner: 'authoritative server',
    terminal: 'terminal',
  },
};
