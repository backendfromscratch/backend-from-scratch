import type { Locale } from '../lib/locales';

/**
 * Laboratorio: una simulación paso a paso de lo más difícil de ver. Playground: una herramienta real
 * que funciona en el navegador. (Los ejercicios de terminal, el tercer nivel, no van aquí.)
 */
export type PlaygroundLevel = 'lab' | 'playground';

/**
 * Los playgrounds y laboratorios del curso, para la página /playgrounds/ (PlaygroundList.astro).
 * Cada uno vive en el «Pruébalo» de su lección. Al añadir uno nuevo, añádelo aquí: el test
 * comprueba que su lección existe en los dos idiomas y que de verdad lo usa.
 */
export interface Playground {
  /** Su carpeta en src/playgrounds/. */
  id: string;
  phase: number;
  level: PlaygroundLevel;
  /** La translationKey de la lección donde está. */
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
