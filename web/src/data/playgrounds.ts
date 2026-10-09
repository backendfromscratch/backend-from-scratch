import type { Locale } from '../lib/locales';

/**
 * Lab: a step-by-step simulation of what is hardest to see. Playground: a real tool
 * that works in the browser. (Terminal exercises, the third level, do not go here.)
 */
export type PlaygroundLevel = 'lab' | 'playground';

/**
 * The course's playgrounds and labs, for the /playgrounds/ page (PlaygroundList.astro).
 * Each one lives in the "Try it" section of its lesson. When adding a new one, add it here: the test
 * checks that its lesson exists in both languages and really uses it.
 */
export interface Playground {
  /** Its folder in src/playgrounds/. */
  id: string;
  phase: number;
  level: PlaygroundLevel;
  /** The translationKey of the lesson it lives in. */
  lesson: string;
  title: Record<Locale, string>;
  summary: Record<Locale, string>;
}

export const playgrounds: Playground[] = [
  {
    id: 'tcp-handshake',
    phase: 0,
    level: 'lab',
    lesson: 'tcp-vs-udp',
    title: {
      es: 'El handshake de TCP, paso a paso',
      en: 'The TCP handshake, step by step',
    },
    summary: {
      es: 'Abre una conexión TCP, envía datos y pierde paquetes a propósito para ver cómo TCP los recupera. Después, haz lo mismo con UDP y compara.',
      en: 'Open a TCP connection, send data and drop packets on purpose to see how TCP recovers them. Then do the same with UDP and compare.',
    },
  },
  {
    id: 'dns-lookup',
    phase: 0,
    level: 'lab',
    lesson: 'dns',
    title: {
      es: 'Una consulta DNS de verdad',
      en: 'A real DNS lookup',
    },
    summary: {
      es: 'Escribe un dominio y sigue, servidor a servidor, cómo se convierte en una IP. Las consultas son reales: prueba registros A, AAAA, CNAME y MX.',
      en: 'Type a domain and follow, server by server, how it becomes an IP address. The lookups are real: try A, AAAA, CNAME and MX records.',
    },
  },
  {
    id: 'crypto-keys',
    phase: 0,
    level: 'playground',
    lesson: 'tls-https',
    title: {
      es: 'Claves pública y privada en tu navegador',
      en: 'Public and private keys in your browser',
    },
    summary: {
      es: 'Genera un par de claves, cifra con la pública y descifra con la privada. Luego firma un mensaje y comprueba qué pasa si alguien lo cambia.',
      en: 'Generate a key pair, encrypt with the public key and decrypt with the private one. Then sign a message and see what happens if someone changes it.',
    },
  },
];
