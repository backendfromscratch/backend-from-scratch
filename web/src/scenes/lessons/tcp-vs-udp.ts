/**
 * The scenes of «TCP frente a UDP» / "TCP vs UDP" (translationKey tcp-vs-udp), one per part of the
 * text, in the order of its <Scene id="…" /> cues: IP promises nothing, a phone call and postcards,
 * the handshake, sequence numbers and ACKs, a lost segment, UDP, what each one is used for, and the
 * lesson's `nc -vz` probes. The segments and numbers are each language's (worlds/transport/strings.ts).
 * Between the client and the server, the data travels on the upper lane and the ACKs come back on
 * the lower one; the handshake's three messages take one lane each.
 */
import type { Director } from '../core/director';
import type { LessonModule, Point, Text } from '../core/types';
import { callRoute, town } from '../worlds/town/town';
import { strings } from '../worlds/transport/strings';
import {
  INITIAL,
  quote,
  route,
  transport,
  type TransportState,
} from '../worlds/transport/transport';

type D = Director<TransportState>;

const DATA = -1;
const ACKS = 1;

const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** A packet that never arrives: it flies half way and a cross marks where it was lost. */
async function lose(d: D, line: readonly Point[], label: Text | string): Promise<void> {
  const lost = middle(line[0]!, line[line.length - 1]!);
  await d.fly([line[0]!, lost], label, 'muted');
  await d.note(lost, '✗', { where: 'center', look: 'tag', ttl: 1200 });
}

/** A packet that arrives and is thrown away there, without an answer: a firewall's silence. */
async function drop(d: D, line: readonly Point[], label: Text | string): Promise<void> {
  const end = line[line.length - 1]!;
  await d.fly(line, label, 'muted');
  await d.note(end, '✗', { where: 'center', look: 'tag', ttl: 1200 });
}

const text = (d: D, i: 0 | 1 | 2) => quote(d.lang, strings[d.lang].segments[i].text);
/** A segment as the lesson's table writes it: «text» seq=N. */
const segment = (d: D, i: 0 | 1 | 2) => `${text(d, i)} seq=${strings[d.lang].segments[i].seq}`;
/** The ACK that answers a segment: the next byte the server expects. */
const ackAfter = (d: D, i: 0 | 1 | 2) => {
  const s = strings[d.lang].segments[i];
  return `ack=${s.seq + s.bytes}`;
};
const toServer = (d: D) => route(d, 'client', 'server', DATA);
const toClient = (d: D) => route(d, 'server', 'client', ACKS);
const open = (): Partial<TransportState> => ({ client: 'established', server: 'established' });

const lesson: LessonModule<TransportState> = {
  initial: INITIAL,
  worlds: [transport, town],
  scenes: [
    {
      id: 'problem',
      view: 'pair',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'IP no promete nada', en: 'IP promises nothing' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        const line = route(d, 'client', 'server');
        const packet = { es: 'paquete', en: 'packet' };
        await d.fly(line, packet, 'muted', { small: true, arrive: 'server' });
        await lose(d, line, packet);
        await d.caption({
          es: 'IP lleva cada paquete, pero no promete que llegue',
          en: 'IP carries each packet, but doesn’t promise it arrives',
        });
        await d.caption({
          es: 'Y el HTML tiene que llegar entero y en orden',
          en: 'And the HTML has to arrive whole and in order',
        });
        await d.caption(
          {
            es: 'TCP lo arregla todo, y lo paga en tiempo',
            en: 'TCP fixes it all, and pays for it in time',
          },
          { chip: 'TCP', kind: 'tcp' },
        );
        await d.caption(
          {
            es: 'UDP no arregla nada: envía y se olvida',
            en: 'UDP fixes nothing: it sends and forgets',
          },
          { chip: 'UDP', kind: 'muted' },
        );
      },
    },
    {
      id: 'analogy',
      view: 'call',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Una llamada y unas postales', en: 'A phone call and some postcards' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.fly(callRoute(d), '', 'tcp', { trail: { dashed: true } });
        await d.say('sc-you', { es: '¿Me oyes?', en: 'Can you hear me?' }, { hold: 800 });
        await d.say(
          'sc-shop',
          { es: 'Sí, te oigo. ¿Me oyes tú a mí?', en: 'Yes, I can hear you. Can you hear me?' },
          { hold: 1300 },
        );
        await d.say('sc-you', { es: 'Sí', en: 'Yes' }, { hold: 600 });
        await d.caption(
          {
            es: 'TCP es una llamada: antes de empezar, os aseguráis de que os oís',
            en: 'TCP is a phone call: first you make sure you can hear each other',
          },
          { chip: 'TCP', kind: 'tcp' },
        );
        await d.say(
          'sc-shop',
          { es: 'Cuatro, cinco, seis…', en: 'Four, five, six…' },
          { hold: 900 },
        );
        await d.say(
          'sc-you',
          { es: 'Cuatro, cinco, seis, ¿vale?', en: 'Four, five, six, right?' },
          { hold: 1100 },
        );
        await d.caption({
          es: 'Repites cada trozo para confirmarlo, y lo que no se oye se repite',
          en: 'You repeat each chunk back to confirm it, and what isn’t heard is repeated',
        });
        const post = route(d, 'home', 'shop');
        const card = { es: 'postal', en: 'postcard' };
        await d.fly(post, card, 'muted', { small: true });
        await lose(d, post, card);
        await d.fly(post, card, 'muted', { small: true });
        await d.caption(
          {
            es: 'UDP son postales: las echas al buzón y te olvidas',
            en: 'UDP is postcards: you drop them in the mailbox and forget them',
          },
          { chip: 'UDP', kind: 'muted' },
        );
      },
    },
    {
      id: 'handshake',
      view: 'pair',
      kind: 'tcp',
      chip: { es: 'handshake', en: 'handshake' },
      title: { es: 'El handshake', en: 'The handshake' },
      start: () => ({ server: 'listen' }),
      end: open,
      async play(d) {
        await d.wait(400);
        await d.caption({ es: 'El servidor escucha: LISTEN', en: 'The server listens: LISTEN' });
        await d.fly(route(d, 'client', 'server', -1), 'SYN, seq=100', 'tcp', {
          arrive: 'server',
          trail: { badge: '1' },
        });
        d.set({ client: 'syn-sent', server: 'syn-received' });
        await d.caption({
          es: 'El cliente pide la conexión y dice con qué número empieza',
          en: 'The client asks for the connection and says which number it starts at',
        });
        await d.fly(route(d, 'server', 'client', 0), 'SYN-ACK, seq=500, ack=101', 'tcp', {
          arrive: 'client',
          trail: { badge: '2' },
        });
        d.set({ client: 'established' });
        await d.caption({
          es: 'El servidor confirma ese número y dice el suyo',
          en: 'The server acknowledges that number and gives its own',
        });
        await d.fly(route(d, 'client', 'server', 1), 'ACK, ack=501', 'tcp', {
          arrive: 'server',
          trail: { badge: '3' },
        });
        d.set({ server: 'established' });
        await d.caption({
          es: 'El cliente confirma el del servidor: la conexión está abierta',
          en: 'The client acknowledges the server’s: the connection is open',
        });
        await d.caption({
          es: 'El precio: un viaje de ida y vuelta antes del primer byte de datos',
          en: 'The cost: one round trip before the first byte of data',
        });
      },
    },
    {
      id: 'seq',
      view: 'pair',
      kind: 'tcp',
      chip: { es: 'seq y ACK', en: 'seq & ACK' },
      title: { es: 'Números de secuencia y ACK', en: 'Sequence numbers and ACKs' },
      start: open,
      end: () => ({ ...open(), app: 3 }),
      async play(d) {
        await d.wait(400);
        for (const i of [0, 1, 2] as const) {
          d.set({ unacked: [i] });
          await d.fly(toServer(d), segment(d, i), 'tcp', { arrive: 'server' });
          d.set({ app: (i + 1) as 1 | 2 | 3 });
          await d.fly(toClient(d), ackAfter(d, i), 'tcp', { small: true, arrive: 'client' });
          d.set({ unacked: [] });
          if (i === 0) {
            await d.caption({
              es: 'Cada segmento lleva el número de su primer byte: seq',
              en: 'Each segment carries the number of its first byte: seq',
            });
            await d.caption({
              es: 'Y cada ACK dice el siguiente byte que espera: el seq más los bytes',
              en: 'And each ACK gives the next byte it expects: the seq plus the bytes',
            });
          }
        }
        await d.caption({
          es: `El ACK es acumulativo: ${ackAfter(d, 2)} confirma todo lo anterior de golpe`,
          en: `The ACK is cumulative: ${ackAfter(d, 2)} acknowledges everything before it at once`,
        });
      },
    },
    {
      id: 'loss',
      view: 'pair',
      kind: 'tcp',
      chip: { es: 'pérdida', en: 'loss' },
      title: { es: 'Cuando algo se pierde', en: 'When something gets lost' },
      start: () => ({ ...open(), app: 1 }),
      end: () => ({ ...open(), app: 3 }),
      async play(d) {
        await d.wait(400);
        const waiting = strings[d.lang].segments[1].seq;
        d.set({ unacked: [1] });
        await lose(d, toServer(d), segment(d, 1));
        await d.caption({
          es: `Se pierde ${text(d, 1)}; el cliente guarda una copia hasta que se la confirmen`,
          en: `${text(d, 1)} is lost; the client keeps a copy until it’s acknowledged`,
        });
        d.set({ unacked: [1, 2] });
        await d.fly(toServer(d), segment(d, 2), 'tcp', { arrive: 'server' });
        d.set({ held: true });
        await d.caption({
          es: 'El siguiente llega, pero el servidor lo guarda sin entregarlo',
          en: 'The next one arrives, but the server holds it without delivering it',
        });
        await d.fly(toClient(d), `ack=${waiting}`, 'tcp', { small: true, arrive: 'client' });
        await d.caption({
          es: `Y repite ack=${waiting}: sigue esperando el byte ${waiting}`,
          en: `And repeats ack=${waiting}: it’s still waiting for byte ${waiting}`,
        });
        await d.note(
          d.pt('client', 'b'),
          { es: 'temporizador…', en: 'timer…' },
          { where: 'below', look: 'tag', ttl: 1400 },
        );
        await d.caption({
          es: 'Vence el temporizador: el cliente reenvía el más antiguo sin confirmar',
          en: 'The timer runs out: the client resends the oldest unacknowledged one',
        });
        await d.fly(toServer(d), segment(d, 1), 'tcp', { arrive: 'server', trail: { badge: '↻' } });
        d.set({ held: false, app: 3 });
        await d.fly(toClient(d), ackAfter(d, 2), 'tcp', { small: true, arrive: 'client' });
        d.set({ unacked: [] });
        await d.caption({
          es: `El servidor entrega los dos, en orden, y responde ${ackAfter(d, 2)}`,
          en: `The server delivers both, in order, and replies ${ackAfter(d, 2)}`,
        });
        await d.caption({
          es: 'Una pérdida retiene lo que viene detrás: bloqueo de cabeza de línea',
          en: 'One loss holds up everything behind it: head-of-line blocking',
        });
      },
    },
    {
      id: 'udp',
      view: 'pair',
      kind: 'muted',
      chip: { es: 'UDP', en: 'UDP' },
      title: { es: 'UDP: enviar y olvidarse', en: 'UDP: send and forget' },
      start: () => ({}),
      end: () => ({ app: 'udp' }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Sin conexión ni handshake: el primer datagrama ya lleva datos',
          en: 'No connection, no handshake: the first datagram already carries data',
        });
        const line = route(d, 'client', 'server');
        await d.fly(line, text(d, 0), 'muted', { arrive: 'server' });
        d.set({ app: 1 });
        await lose(d, line, text(d, 1));
        await d.fly(line, text(d, 2), 'muted', { arrive: 'server' });
        d.set({ app: 'udp' });
        await d.caption({
          es: 'Ni números, ni ACK, ni reenvíos: el tercero se entrega en cuanto llega',
          en: 'No numbers, no ACKs, no resends: the third is delivered as soon as it arrives',
        });
        await d.caption({
          es: 'En una videollamada, mejor saltar lo que llega tarde que esperarlo',
          en: 'In a video call, better to skip what arrives late than wait for it',
        });
      },
    },
    {
      id: 'uses',
      view: 'uses',
      kind: 'muted',
      chip: { es: 'usos', en: 'uses' },
      title: { es: 'Cuándo se usa cada uno', en: 'When to use each one' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        d.glow('#tp-use-1', 'tcp');
        d.glow('#tp-use-2', 'tcp');
        await d.caption({
          es: 'Webs, APIs, SSH y bases de datos: TCP, porque nada puede faltar',
          en: 'Websites, APIs, SSH and databases: TCP, because nothing can go missing',
        });
        d.glow('#tp-use-3', 'http');
        d.glow('#tp-use-4', 'http');
        await d.caption({
          es: 'DNS, videollamadas y juegos: UDP, porque un dato que llega tarde ya no sirve',
          en: 'DNS, video calls and games: UDP, because data that arrives late is useless',
        });
        d.glow('#tp-use-5', 'http');
        await d.caption({
          es: 'HTTP/3 va sobre UDP con QUIC, que rehace la fiabilidad por su cuenta',
          en: 'HTTP/3 runs over UDP with QUIC, which rebuilds reliability on its own',
        });
      },
    },
    {
      id: 'try',
      view: 'probe',
      kind: 'tcp',
      chip: { es: 'nc -vz', en: 'nc -vz' },
      title: { es: '¿Hay alguien escuchando?', en: 'Is anyone listening?' },
      start: () => ({}),
      end: () => ({ results: 3 }),
      async play(d) {
        await d.wait(400);
        const to = (i: number) => route(d, 'client', `#tp-t-${i}`);
        const back = (i: number) => [...to(i)].reverse();
        await d.fly(to(1), 'SYN', 'tcp', { arrive: '#tp-t-1' });
        await d.fly(back(1), 'SYN-ACK', 'tcp', { arrive: 'client' });
        await d.fly(to(1), 'ACK', 'tcp', { small: true, arrive: '#tp-t-1' });
        d.set({ results: 1 });
        await d.caption({
          es: 'El handshake se completa: ahí hay un servidor web',
          en: 'The handshake completes: there’s a web server there',
        });
        await d.fly(to(2), 'SYN', 'tcp', { arrive: '#tp-t-2' });
        await d.fly(back(2), 'RST', 'muted', { arrive: 'client' });
        d.set({ results: 2 });
        await d.caption({
          es: 'Un rechazo inmediato, un RST: nadie escucha en el puerto 9',
          en: 'An instant refusal, an RST: nobody is listening on port 9',
        });
        await drop(d, to(3), 'SYN');
        await drop(d, to(3), 'SYN');
        d.set({ results: 3 });
        await d.caption({
          es: 'Nadie responde: el SYN se reenvía hasta que se acaba el plazo',
          en: 'Nobody answers: the SYN is resent until time runs out',
        });
        await d.caption({
          es: 'Por UDP, el silencio no distingue «hay alguien» de «no hay nadie»',
          en: 'With UDP, silence can’t tell “someone’s there” apart from “nobody’s there”',
        });
      },
    },
  ],
};

export default lesson;
