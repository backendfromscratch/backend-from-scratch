/**
 * The crypto world's labels in both languages (crypto.ts, Crypto.astro): the lesson «TLS y HTTPS».
 * Each language keeps its lesson's examples: tubanco.com and a DNI in Spanish, yourbank.com and a
 * passport in English; the certificate's dates and the badssl.com sites are the lesson's own.
 */
import type { Locale } from '../../../lib/locales';

/** What the person on the wifi sees go past. */
export type Sight = 'none' | 'clear' | 'changed' | 'cipher' | 'key' | 'parts' | 'sni';

interface CryptoStrings {
  browser: string;
  server: string;
  eve: string;
  sights: Record<Sight, string>;
  needs: readonly [string, string, string];
  /** The analogy: padlocks with your name, a box, your key, a sealed letter, the seal's photo, the ID. */
  yourName: string;
  box: string;
  onlyYou: string;
  letter: string;
  photo: string;
  idTitle: string;
  idText: string;
  authority: string;
  /** The keys and certificate the browser and the server hold. */
  secret: string;
  certOk: string;
  /** The key pair: what each lane does with which key. */
  publicKey: string;
  privateKey: string;
  encrypt: string;
  sign: string;
  signature: string;
  message: string;
  verified: string;
  /** The chain and the checks. */
  root: string;
  inBrowser: string;
  intermediate: string;
  dates: string;
  checks: readonly [string, string, string];
  /** What HTTPS leaves visible and what it hides. */
  visible: string;
  hidden: string;
  shown: readonly string[];
  covered: readonly string[];
}

export const strings: Record<Locale, CryptoStrings> = {
  es: {
    browser: 'tu navegador',
    server: 'servidor',
    eve: 'alguien en la wifi',
    sights: {
      none: '',
      clear: 'GET /cuenta/movimientos',
      changed: 'la página + un script',
      cipher: 'x7#kQ9…',
      key: 'la clave',
      parts: 'dos partes públicas',
      sni: 'example.com',
    },
    needs: ['confidencialidad', 'integridad', 'autenticidad'],
    yourName: 'tu nombre',
    box: 'caja',
    onlyYou: 'solo tú',
    letter: 'carta',
    photo: 'foto del sello',
    idTitle: 'DNI',
    idText: 'este sello es de tubanco.com',
    authority: 'la policía',
    secret: 'clave secreta',
    certOk: 'certificado ✓',
    publicKey: 'pública',
    privateKey: 'privada',
    encrypt: 'cifrar',
    sign: 'firmar',
    signature: 'firma',
    message: 'hola',
    verified: 'firma ✓',
    root: 'CA raíz',
    inBrowser: 'en tu navegador',
    intermediate: 'CA intermedia',
    dates: '26 sep – 25 dic 2026',
    checks: ['cadena', 'nombre', 'fechas'],
    visible: 'se ve',
    hidden: 'va cifrado',
    shown: ['el dominio (SNI)', 'la IP de destino', 'cuánto y cuándo'],
    covered: ['la ruta', 'las cabeceras', 'las cookies', 'el contenido'],
  },
  en: {
    browser: 'your browser',
    server: 'server',
    eve: 'someone on the Wi-Fi',
    sights: {
      none: '',
      clear: 'GET /account/transactions',
      changed: 'the page + a script',
      cipher: 'x7#kQ9…',
      key: 'the key',
      parts: 'two public parts',
      sni: 'example.com',
    },
    needs: ['confidentiality', 'integrity', 'authenticity'],
    yourName: 'your name',
    box: 'box',
    onlyYou: 'only you',
    letter: 'letter',
    photo: 'photo of the seal',
    idTitle: 'passport',
    idText: 'this seal belongs to yourbank.com',
    authority: 'the government',
    secret: 'secret key',
    certOk: 'certificate ✓',
    publicKey: 'public',
    privateKey: 'private',
    encrypt: 'encrypt',
    sign: 'sign',
    signature: 'signature',
    message: 'hello',
    verified: 'signature ✓',
    root: 'root CA',
    inBrowser: 'in your browser',
    intermediate: 'intermediate CA',
    dates: 'Sep 26 – Dec 25, 2026',
    checks: ['chain', 'name', 'dates'],
    visible: 'visible',
    hidden: 'encrypted',
    shown: ['the domain (SNI)', 'the destination IP', 'how much and when'],
    covered: ['the path', 'the headers', 'the cookies', 'the content'],
  },
};
