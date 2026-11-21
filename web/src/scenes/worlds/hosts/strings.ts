/** The hosts world's labels in both languages (hosts.ts, Hosts.astro). */
import type { Locale } from '../../../lib/locales';

export interface HostsStrings {
  browser: string;
  server: string;
  serverSub: string;
  computer: string;
  serverProgram: string;
  otherProgram: string;
  idle: string;
  listening: string;
  os: string;
  terminal: string;
  laptop: string;
  /** The response the lesson's reader types into `nc`. */
  hello: string;
}

export const strings: Record<Locale, HostsStrings> = {
  es: {
    browser: 'tu navegador',
    server: 'servidor',
    serverSub: 'en algún lugar del mundo',
    computer: 'ordenador',
    serverProgram: 'programa servidor',
    otherProgram: 'otro programa',
    idle: 'no escucha',
    listening: 'escucha en el 8080',
    os: 'sistema operativo · puertos',
    terminal: 'terminal',
    laptop: 'tu portátil',
    hello: 'Hola desde mi servidor',
  },
  en: {
    browser: 'your browser',
    server: 'server',
    serverSub: 'somewhere in the world',
    computer: 'computer',
    serverProgram: 'server program',
    otherProgram: 'another program',
    idle: 'not listening',
    listening: 'listens on 8080',
    os: 'operating system · ports',
    terminal: 'terminal',
    laptop: 'your laptop',
    hello: 'Hello from my server',
  },
};
