/** The layers world's labels in both languages (layers.ts, Layers.astro), as the lesson's tables name them. */
import type { Locale } from '../../../lib/locales';

export type Layer = 'app' | 'transport' | 'network' | 'link';

export interface LayersStrings {
  layer: Record<Layer, string>;
  protocol: Record<Layer, string>;
  /** What each layer calls what it handles. */
  unit: Record<Layer, string>;
  mine: string;
  theirs: string;
  gateway: string;
  isp: string;
  message: string;
  trailer: string;
  wrap: string;
  letter: { title: string; letter: string; name: string; address: string };
  osi: string;
  osiNames: readonly string[];
  tcpip: string;
}

export const strings: Record<Locale, LayersStrings> = {
  es: {
    layer: { app: 'Aplicación', transport: 'Transporte', network: 'Red', link: 'Enlace' },
    protocol: { app: 'HTTP', transport: 'TCP', network: 'IP', link: 'Ethernet · wifi' },
    unit: { app: 'mensaje', transport: 'segmento', network: 'paquete', link: 'trama' },
    mine: 'tu portátil',
    theirs: 'servidor',
    gateway: 'router de casa',
    isp: 'routers de internet',
    message: 'Mensaje HTTP',
    trailer: 'Cola',
    wrap: 'el mensaje y sus sobres',
    letter: {
      title: 'un sobre',
      letter: 'la carta · tu mensaje HTTP',
      name: 'el nombre · el puerto',
      address: 'la dirección · la IP',
    },
    osi: 'OSI',
    osiNames: [
      'Aplicación',
      'Presentación',
      'Sesión',
      'Transporte',
      'Red',
      'Enlace de datos',
      'Física',
    ],
    tcpip: 'TCP/IP',
  },
  en: {
    layer: { app: 'Application', transport: 'Transport', network: 'Network', link: 'Link' },
    protocol: { app: 'HTTP', transport: 'TCP', network: 'IP', link: 'Ethernet · Wi-Fi' },
    unit: { app: 'message', transport: 'segment', network: 'packet', link: 'frame' },
    mine: 'your laptop',
    theirs: 'server',
    gateway: 'home router',
    isp: 'internet routers',
    message: 'HTTP message',
    trailer: 'Trailer',
    wrap: 'the message and its envelopes',
    letter: {
      title: 'an envelope',
      letter: 'the letter · your HTTP message',
      name: 'the name · the port',
      address: 'the address · the IP',
    },
    osi: 'OSI',
    osiNames: [
      'Application',
      'Presentation',
      'Session',
      'Transport',
      'Network',
      'Data link',
      'Physical',
    ],
    tcpip: 'TCP/IP',
  },
};
