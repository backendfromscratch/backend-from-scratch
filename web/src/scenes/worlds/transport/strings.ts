/**
 * The transport world's labels in both languages (transport.ts, Transport.astro). The segments and
 * their numbers are each language's lesson's: the Spanish table sends «Hola, », «todo », «bien»; the
 * English one, “Hi, ”, “how are ”, “you?”, so their sequence numbers differ.
 */
import type { Locale } from '../../../lib/locales';

interface Segment {
  text: string;
  seq: number;
  bytes: number;
}

export interface TransportStrings {
  client: string;
  server: string;
  app: string;
  held: string;
  /** The client's copy of what the server hasn't acknowledged yet. */
  unacked: string;
  segments: readonly [Segment, Segment, Segment];
  uses: readonly (readonly [string, string])[];
}

export const strings: Record<Locale, TransportStrings> = {
  es: {
    client: 'cliente',
    server: 'servidor',
    app: 'aplicación',
    held: 'en espera',
    unacked: 'sin confirmar',
    segments: [
      { text: 'Hola, ', seq: 101, bytes: 6 },
      { text: 'todo ', seq: 107, bytes: 5 },
      { text: 'bien', seq: 112, bytes: 4 },
    ],
    uses: [
      ['Webs y APIs (HTTP/1.1, HTTP/2)', 'TCP'],
      ['SSH, bases de datos, correo', 'TCP'],
      ['DNS', 'UDP'],
      ['Videollamadas y juegos', 'UDP'],
      ['HTTP/3', 'QUIC · UDP'],
    ],
  },
  en: {
    client: 'client',
    server: 'server',
    app: 'application',
    held: 'held',
    unacked: 'awaiting ACK',
    segments: [
      { text: 'Hi, ', seq: 101, bytes: 4 },
      { text: 'how are ', seq: 105, bytes: 8 },
      { text: 'you?', seq: 113, bytes: 4 },
    ],
    uses: [
      ['Websites and APIs (HTTP/1.1, HTTP/2)', 'TCP'],
      ['SSH, databases, email', 'TCP'],
      ['DNS', 'UDP'],
      ['Video calls and games', 'UDP'],
      ['HTTP/3', 'QUIC · UDP'],
    ],
  },
};
