/**
 * The scenes of «Modelo cliente-servidor» / "Client-server model" (translationKey client-server), one
 * per part of the text, in the order of its <Scene id="…" /> cues: who starts, the shop with a
 * counter, programs that listen on a port, the request and the response with `nc -l 8080`,
 * localhost, and the lesson's own exercise.
 */
import type { LessonModule, Point } from '../core/types';
import { INITIAL, hosts, route, type HostsState } from '../worlds/hosts/hosts';
import { strings as hostsStrings } from '../worlds/hosts/strings';
import { town } from '../worlds/town/town';

const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The terminal's text once the reader has typed the response by hand (the lesson's exercise 2). */
const response = (lang: 'es' | 'en') =>
  `HTTP/1.1 200 OK\nContent-Type: text/plain; charset=utf-8\n\n${hostsStrings[lang].hello}`;

const lesson: LessonModule<HostsState> = {
  initial: INITIAL,
  worlds: [hosts, town],
  scenes: [
    {
      id: 'problem',
      view: 'talk',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Dos programas que hablan', en: 'Two programs that talk' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Tu navegador y un programa lejano tienen que hablar',
          en: 'Your browser and a program far away need to talk',
        });
        await Promise.all([
          d.note(d.pt('browser', 't'), '…', { where: 'above', look: 'tag', ttl: 1600 }),
          d.note(d.pt('server', 't'), '…', { where: 'above', look: 'tag', ttl: 1600 }),
        ]);
        await d.caption({
          es: 'Si los dos esperan a que hable el otro, no pasa nada',
          en: 'If both wait for the other to speak, nothing happens',
        });
        const [a, b] = route(d, 'browser', 'server');
        const clash = middle(a!, b!);
        const hi = { es: 'hola', en: 'hi' };
        await Promise.all([
          d.fly([a!, clash], hi, 'muted', { small: true }),
          d.fly([b!, clash], hi, 'muted', { small: true }),
        ]);
        await d.note(clash, '✗', { where: 'center', look: 'tag', ttl: 1000 });
        await d.caption({
          es: 'Si los dos hablan a la vez, tampoco',
          en: 'If both talk at once, it doesn’t work either',
        });
        await d.tag(
          d.pt('server', 't'),
          { es: 'espera: servidor', en: 'waits: server' },
          'http',
          'above',
        );
        await d.caption({
          es: 'Uno se queda esperando, siempre disponible: el servidor',
          en: 'One of them waits, always available: the server',
        });
        await d.tag(
          d.pt('browser', 't'),
          { es: 'empieza: cliente', en: 'starts: client' },
          'muted',
          'above',
        );
        await d.caption({
          es: 'El otro empieza cuando necesita algo: el cliente',
          en: 'The other starts when it needs something: the client',
        });
        await d.fly(route(d, 'browser', 'server'), { es: 'petición', en: 'request' }, 'http', {
          arrive: 'server',
          trail: {},
        });
        await d.fly(route(d, 'server', 'browser'), { es: 'respuesta', en: 'response' }, 'http', {
          arrive: 'browser',
          trail: { dashed: true },
        });
      },
    },
    {
      id: 'analogy',
      view: 'counter',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Una tienda con mostrador', en: 'A store with a counter' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'La tienda abre en una dirección conocida y espera',
          en: 'The store opens at a known address and waits',
        });
        for (const [customer, ask] of [
          ['sc-cust1', { es: '¿tiene…?', en: 'do you have…?' }],
          ['sc-cust3', { es: 'quería…', en: 'I’d like…' }],
        ] as const) {
          await d.fly([d.pt(`#${customer}-head`, 'r'), d.pt('#sc-shop-head', 'l')], ask, 'http', {
            small: true,
          });
          await d.fly(
            [d.pt('#sc-shop-head', 'l'), d.pt(`#${customer}-head`, 'r')],
            { es: 'aquí tiene', en: 'here you are' },
            'http',
            { small: true },
          );
          if (customer === 'sc-cust1') {
            await d.caption({
              es: 'Los clientes llegan, piden en el mostrador y se van con lo que piden',
              en: 'Customers come in, ask at the counter and leave with what they asked for',
            });
          }
        }
        await d.caption({
          es: 'La tienda nunca sale a buscar a nadie: está abierta y atiende',
          en: 'The store never goes out looking for anyone: it stays open and serves',
        });
      },
    },
    {
      id: 'roles',
      view: 'roles',
      kind: 'muted',
      chip: { es: 'papeles', en: 'roles' },
      title: { es: 'Papeles, no máquinas', en: 'Roles, not machines' },
      start: () => ({ listening: true }),
      end: () => ({ listening: true }),
      async play(d) {
        await d.wait(400);
        await d.tag(
          d.pt('machine', 't'),
          { es: '¿el servidor?', en: 'the server?' },
          'muted',
          'above',
        );
        await d.caption({
          es: 'Al ordenador lo solemos llamar «servidor»…',
          en: 'We usually call the computer “the server”…',
        });
        d.glow('#hs-program', 'http');
        await d.note(
          d.pt('#hs-program', 'l'),
          { es: 'el servidor', en: 'the server' },
          {
            where: 'left',
            look: 'tag',
            kind: 'http',
            gap: 10,
          },
        );
        await d.caption({
          es: '…pero el servidor es un programa: el que escucha',
          en: '…but the server is a program: the one that listens',
        });
      },
    },
    {
      id: 'listen',
      view: 'listen',
      kind: 'http',
      chip: { es: 'escuchar', en: 'listening' },
      title: { es: 'Qué significa «escuchar»', en: 'What “listening” means' },
      start: () => ({}),
      end: () => ({ listening: true }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Al arrancar, el programa le pide un puerto al sistema operativo',
          en: 'When it starts, the program asks the operating system for a port',
        });
        await d.fly(
          [d.pt('#hs-program', 'b'), d.pt('#hs-port', 't')],
          { es: 'el 8080, para mí', en: '8080, for me' },
          'muted',
          {
            small: true,
            arrive: '#hs-port',
          },
        );
        d.set({ listening: true });
        await d.caption({
          es: 'Lo que llegue al puerto 8080 será para él',
          en: 'Whatever reaches port 8080 is for it',
        });
        await d.note(
          d.pt('#hs-program', 't'),
          { es: 'esperando…', en: 'waiting…' },
          {
            where: 'above',
            look: 'tag',
            ttl: 1800,
          },
        );
        await d.caption({
          es: 'Mientras no llega nadie, espera, a veces durante días',
          en: 'While nobody comes, it waits, sometimes for days',
        });
        await d.fly(route(d, 'browser', 'machine'), { es: 'al 8080', en: 'to 8080' }, 'http', {
          arrive: '#hs-port',
        });
        await d.fly(
          [d.pt('#hs-port', 't'), d.pt('#hs-program', 'b')],
          { es: 'petición', en: 'request' },
          'http',
          {
            small: true,
            arrive: '#hs-program',
          },
        );
        await d.caption({
          es: 'Cuando llega una petición, el sistema operativo se la pasa',
          en: 'When a request arrives, the operating system hands it over',
        });
      },
    },
    {
      id: 'exchange',
      view: 'exchange',
      kind: 'http',
      chip: { es: 'petición', en: 'request' },
      title: { es: 'Petición y respuesta', en: 'Request and response' },
      start: () => ({ local: true, listening: true, typed: true }),
      end: () => ({
        local: true,
        listening: true,
        typed: true,
        requested: true,
        responded: true,
        answered: true,
      }),
      async play(d) {
        await d.wait(400);
        await d.note(
          d.pt('terminal', 't'),
          { es: 'ya estaba escuchando en el 8080', en: 'already listening on 8080' },
          {
            where: 'above',
            look: 'tag',
          },
        );
        await d.caption({
          es: 'El cliente se conecta y envía su petición',
          en: 'The client connects and sends its request',
        });
        d.set({ waiting: true });
        await d.fly(route(d, 'browser', 'terminal'), 'GET / HTTP/1.1', 'http', {
          arrive: 'terminal',
          trail: {},
        });
        d.set({ requested: true });
        await d.caption({
          es: 'El servidor la lee y decide qué responder',
          en: 'The server reads it and decides what to answer',
        });
        d.set({ responded: true });
        await d.fly(route(d, 'terminal', 'browser'), 'HTTP/1.1 200 OK', 'http', {
          arrive: 'browser',
          trail: { dashed: true },
        });
        d.set({ waiting: false, answered: true });
        await d.caption({
          es: 'Fíjate en el orden: el cliente siempre empieza',
          en: 'Notice the order: the client always starts',
        });
      },
    },
    {
      id: 'local',
      view: 'local',
      kind: 'muted',
      chip: { es: 'localhost', en: 'localhost' },
      title: { es: 'En el mismo ordenador', en: 'On the same computer' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'El cliente y el servidor pueden estar en el mismo ordenador',
          en: 'The client and the server can be on the same computer',
        });
        const [from, to] = route(d, '#hs-mini-browser', '#hs-mini-term');
        await d.fly([from!, to!], 'localhost:8080', 'http', {
          small: true,
          arrive: '#hs-mini-term',
        });
        await d.fly([to!, from!], { es: 'respuesta', en: 'response' }, 'http', {
          small: true,
          arrive: '#hs-mini-browser',
        });
        await d.tag(d.pt('laptop', 't'), 'localhost', 'http', 'above');
        await d.caption({
          es: '«localhost» siempre significa «este ordenador»',
          en: '“localhost” always means “this computer”',
        });
      },
    },
    {
      id: 'try',
      view: 'nc',
      kind: 'http',
      chip: { es: 'nc', en: 'nc' },
      title: { es: 'Sé tú el servidor', en: 'Be the server yourself' },
      start: () => ({}),
      end: () => ({
        local: true,
        listening: true,
        typed: true,
        requested: true,
        responded: true,
        answered: true,
      }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'En una terminal, pon nc a escuchar en el 8080',
          en: 'In a terminal, have nc listen on 8080',
        });
        await d.type('#hs-cmd', 'nc -l 8080');
        d.set({ typed: true, listening: true });
        await d.caption({
          es: 'En el navegador, entra en localhost:8080',
          en: 'In the browser, go to localhost:8080',
        });
        d.set({ local: true, waiting: true });
        await d.fly(route(d, 'browser', 'terminal'), 'GET / HTTP/1.1', 'http', {
          arrive: 'terminal',
          trail: {},
        });
        d.set({ requested: true });
        await d.caption({
          es: 'La petición aparece en la terminal; el navegador espera',
          en: 'The request shows up in the terminal; the browser waits',
        });
        await d.caption({
          es: 'Escribe tú la respuesta, a mano, y pulsa Ctrl + C',
          en: 'Type the response yourself, by hand, and press Ctrl + C',
        });
        await d.type('#hs-response', response(d.lang));
        d.set({ responded: true });
        await d.fly(
          route(d, 'terminal', 'browser'),
          { es: 'tu respuesta', en: 'your response' },
          'http',
          {
            arrive: 'browser',
            trail: { dashed: true },
          },
        );
        d.set({ waiting: false, answered: true });
        await d.caption({
          es: 'Acabas de hacer, a mano, el trabajo de un servidor web',
          en: 'You just did, by hand, the job of a web server',
        });
      },
    },
  ],
};

export default lesson;
