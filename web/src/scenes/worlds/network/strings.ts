/** The network world's labels in both languages (spec §7). Same type, so neither can miss one. */
import type { Locale } from '../../../lib/locales';

export type Phase = 'dns' | 'tcp' | 'tls' | 'wait' | 'down';
export type Mode = 'near' | 'far';

export interface NetworkStrings {
  you: string;
  browser: string;
  newTab: string;
  typeUrl: string;
  pageTitle: string;
  learnMore: string;
  router: string;
  internet: string;
  resolver: string;
  resolverSub: string;
  cacheEmpty: string;
  cacheMiss: string;
  cacheHit: string;
  root: string;
  com: string;
  auth: string;
  server: string;
  serverSub: Record<Mode, string>;
  serverName: Record<Mode, string>;
  program: string;
  programSub: string;
  database: string;
  backend: string;
  /** What each part of the URL means, in the browser's page during the URL scene. */
  urlParts: { scheme: string; host: string; path: string };
  time: string;
  timeOf: Record<Mode, string>;
  phases: Record<Phase, string>;
  /** The near/far switch of the round-trip scene. */
  modeGroup: string;
  modes: Record<Mode, string>;
}

export const strings: Record<Locale, NetworkStrings> = {
  es: {
    you: 'tú',
    browser: 'navegador',
    newTab: 'Nueva pestaña',
    typeUrl: 'Escribe una URL',
    pageTitle: 'Example Domain',
    learnMore: 'Learn more',
    router: 'tu router',
    internet: 'internet',
    resolver: 'resolver DNS',
    resolverSub: 'el de tu proveedor de internet',
    cacheEmpty: 'caché: vacía',
    cacheMiss: 'caché: <span class="ko">no está</span>',
    cacheHit: 'caché: <b>example.com</b> ✓ (300 s)',
    root: 'raíz',
    com: '.com',
    auth: 'autoritativo',
    server: 'servidor',
    serverSub: { near: '104.20.23.154 · puerto 443', far: 'Johannesburgo · puerto 443' },
    serverName: { near: 'example.com', far: 'www.gov.za' },
    program: 'programa',
    programSub: 'escucha en el puerto 443',
    database: 'base de datos',
    backend: 'todo esto es el backend',
    urlParts: {
      scheme: 'el protocolo, y con él el puerto: 443',
      host: 'el nombre: hay que buscar su IP',
      path: 'la ruta: qué página pides',
    },
    time: 'tiempo',
    timeOf: { near: 'example.com, servidor cerca', far: 'www.gov.za, en Johannesburgo' },
    phases: {
      dns: 'DNS',
      tcp: 'TCP',
      tls: 'TLS',
      wait: 'petición y servidor',
      down: 'descarga',
    },
    modeGroup: 'Dónde está el servidor',
    modes: { near: 'Servidor cerca', far: 'Johannesburgo' },
  },
  en: {
    you: 'you',
    browser: 'browser',
    newTab: 'New tab',
    typeUrl: 'Type a URL',
    pageTitle: 'Example Domain',
    learnMore: 'Learn more',
    router: 'your router',
    internet: 'internet',
    resolver: 'DNS resolver',
    resolverSub: 'your internet provider’s',
    cacheEmpty: 'cache: empty',
    cacheMiss: 'cache: <span class="ko">not there</span>',
    cacheHit: 'cache: <b>example.com</b> ✓ (300 s)',
    root: 'root',
    com: '.com',
    auth: 'authoritative',
    server: 'server',
    serverSub: { near: '104.20.23.154 · port 443', far: 'Johannesburg · port 443' },
    serverName: { near: 'example.com', far: 'www.gov.za' },
    program: 'program',
    programSub: 'listens on port 443',
    database: 'database',
    backend: 'all of this is the backend',
    urlParts: {
      scheme: 'the protocol, and with it the port: 443',
      host: 'the name: its IP address must be found',
      path: 'the path: which page you ask for',
    },
    time: 'time',
    timeOf: { near: 'example.com, a nearby server', far: 'www.gov.za, in Johannesburg' },
    phases: {
      dns: 'DNS',
      tcp: 'TCP',
      tls: 'TLS',
      wait: 'request and server',
      down: 'download',
    },
    modeGroup: 'Where the server is',
    modes: { near: 'Nearby server', far: 'Johannesburg' },
  },
};
