/**
 * The scenes of «Qué pasa cuando escribes una URL en el navegador» / "What happens when you type a URL
 * in the browser" (translationKey from-url-to-page), the pilot of the scene lessons. One scene per
 * part of the text, in the order of its <Scene id="…" /> cues; the numbers are each language's real
 * `curl -w` run (network.ts, TIMES), so the scenes say the same as the text.
 */
import type { Director } from '../core/director';
import { curve, pointAt } from '../core/geometry';
import { icons } from '../core/icons';
import { formatMs } from '../core/timing';
import type { Kind, LessonModule, Locale, Options, Place, Point, Text } from '../core/types';
import {
  INITIAL,
  PHASES,
  TIMES,
  dnsRoute,
  netRoute,
  network,
  resolverTop,
  timeBar,
  timeUntil,
  tube,
  type Mode,
  type NetworkState,
  type Phase,
} from '../worlds/network/network';
import { strings as net } from '../worlds/network/strings';
import { callRoute, roadLine, town } from '../worlds/town/town';

type D = Director<NetworkState>;
type State = Partial<NetworkState>;

/** A text written once per language with the same template. */
const both = (make: (lang: Locale) => string): Text => ({ es: make('es'), en: make('en') });
/** How long a phase took in each language's run, written the lesson's way. */
const took = (lang: Locale, phase: Phase, mode: Mode = 'near') =>
  formatMs(TIMES[lang][mode][phase], lang);
const until = (lang: Locale, phase?: Phase, mode: Mode = 'near') =>
  formatMs(timeUntil(lang, mode, phase), lang);
const reversed = (route: readonly Point[]) => [...route].reverse();

// What each part leaves behind: the next scene starts from it.
const typed = (): State => ({ url: true });
const afterDns = (): State => ({ url: true, ip: true, cache: true, done: ['dns'] });
const afterTcp = (): State => ({ ...afterDns(), tcp: true, done: ['dns', 'tcp'] });
const afterTls = (): State => ({ ...afterTcp(), tls: true, done: ['dns', 'tcp', 'tls'] });
const afterServer = (): State => ({ ...afterTls(), inside: true });
const afterResponse = (): State => ({ ...afterTls(), done: [...PHASES] });
const afterPaint = (): State => ({ ...afterResponse(), paint: 2 });
const modeOf = (options: Options): Mode => (options.mode === 'far' ? 'far' : 'near');

const certificate: Text = {
  es: '<div class="scene-card"><b>certificado</b><span>example.com</span><span class="scene-card__dim">lo firma: Cloudflare TLS Issuing ECC CA 3</span><ul><li>cadena hasta una raíz de confianza</li><li>el nombre es example.com</li><li>válido hasta el 25/12/2026</li></ul></div>',
  en: '<div class="scene-card"><b>certificate</b><span>example.com</span><span class="scene-card__dim">signed by: Cloudflare TLS Issuing ECC CA 3</span><ul><li>a chain up to a trusted root</li><li>the name is example.com</li><li>valid until Dec 25, 2026</li></ul></div>',
};
const request =
  '<div class="scene-card"><b>GET /</b><span class="scene-card__dim">:authority: example.com</span><span class="scene-card__dim">accept: text/html</span><span class="scene-card__dim">cookie: …</span></div>';

async function exchange(
  d: D,
  server: 'root' | 'com' | 'auth',
  ask: Text,
  answer: Text | string,
  badge: string,
) {
  const from = resolverTop(d, server);
  const to = d.pt(server, 'b');
  const bend = Math.max(6, Math.min(20, Math.hypot(to.x - from.x, to.y - from.y) * 0.2));
  await d.fly(curve(from, to, bend), ask, 'dns', { trail: { badge }, arrive: server });
  await d.fly(curve(to, from, bend), answer, 'dns', { trail: {}, arrive: 'resolver' });
}

const lesson: LessonModule<NetworkState> = {
  initial: INITIAL,
  worlds: [network, town],
  instrument: timeBar,
  scenes: [
    {
      id: 'problem',
      view: 'overview',
      kind: 'muted',
      chip: { es: 'Enter', en: 'Enter' },
      title: { es: '¿Qué pasa al pulsar Enter?', en: 'What happens when you press Enter?' },
      start: () => ({}),
      end: typed,
      async play(d) {
        await d.wait(500);
        await d.type('#sc-url', 'https://example.com/', 'sc-me');
        d.set({ url: true });
        await d.note(d.pt('browser', 'b'), '<kbd>Enter ⏎</kbd>', {
          where: 'below',
          look: 'key',
          ttl: 1100,
        });
        await d.caption({
          es: 'Pulsas Enter. ¿Qué viaja por la red hasta que ves la página?',
          en: 'You press Enter. What travels across the network before you see the page?',
        });
        await d.fly(netRoute(d), '?', 'muted', { arrive: 'server' });
        await d.fly(reversed(netRoute(d)), '?', 'muted', { arrive: 'browser' });
        const where: [Phase, Text][] = [
          ['dns', { es: 'encontrar el servidor', en: 'finding the server' }],
          ['tcp', { es: 'conectarse', en: 'connecting' }],
          ['tls', { es: 'cifrar la conexión', en: 'encrypting the connection' }],
          ['wait', { es: 'esperar al servidor', en: 'waiting for the server' }],
          ['down', { es: 'descargar la respuesta', en: 'downloading the response' }],
        ];
        let lit: Phase | null = null;
        for (const [phase, what] of where) {
          await d.caption({
            es: `El tiempo se va en <b>${what.es}</b>…`,
            en: `Time goes into <b>${what.en}</b>…`,
          });
          if (lit) d.hint(lit, false);
          d.hint(phase, true);
          lit = phase;
        }
        await d.caption({
          es: 'Si no sabes qué pasos hay, no sabes dónde mirar. Baja y míralos uno a uno.',
          en: 'Without knowing the steps, you can’t tell where to look. Scroll down to see them.',
        });
        if (lit) d.hint(lit, false);
      },
    },
    {
      id: 'analogy',
      view: 'town',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Encargar un mueble a otra ciudad', en: 'Ordering furniture from another city' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption(
          {
            es: 'Buscas la dirección y el teléfono de la tienda',
            en: 'You look up the store’s address and phone number',
          },
          { chip: 'DNS', kind: 'dns' },
        );
        await d.fly(
          [d.pt('#sc-you-head', 'r'), d.pt('book', 'l')],
          { es: '¿la tienda?', en: 'the store?' },
          'dns',
          {
            arrive: 'book',
          },
        );
        d.q('#sc-book').classList.add('is-open');
        await d.wait(350);
        await d.fly(
          [d.pt('book', 'l'), d.pt('#sc-you-head', 'r')],
          { es: 'teléfono y dirección', en: 'phone and address' },
          'dns',
        );
        await d.tag(d.pt('book', 'r'), 'DNS', 'dns', 'right');

        await d.caption(
          {
            es: 'Llamas y os aseguráis de que os oís',
            en: 'You call and make sure you can hear each other',
          },
          { chip: 'TCP', kind: 'tcp' },
        );
        const call = callRoute(d);
        const apex = pointAt(call, 0.5);
        await d.fly(call, '', 'tcp', { trail: { dashed: true } });
        await d.say('sc-you', { es: '¿Me oye?', en: 'Can you hear me?' }, { hold: 900 });
        await d.say(
          'sc-shop',
          { es: 'Sí, le oigo. ¿Me oye usted?', en: 'Yes, I can hear you. Can you hear me?' },
          { hold: 1300 },
        );
        await d.say('sc-you', { es: 'Sí.', en: 'Yes.' }, { hold: 650 });
        await d.tag(apex, { es: 'TCP · la llamada', en: 'TCP · the call' }, 'tcp', 'above');

        await d.caption(
          {
            es: 'La tienda te enseña su licencia y acordáis una palabra clave',
            en: 'The store shows you its license and you agree on a code word',
          },
          { chip: 'TLS', kind: 'tls' },
        );
        await d.fly(reversed(call), { es: 'licencia ✓', en: 'license ✓' }, 'tls');
        await Promise.all([
          d.note(d.pt('#sc-you-head', 'l'), icons.key, {
            kind: 'tls',
            look: 'icon',
            where: 'left',
            gap: 4,
          }),
          d.note(d.pt('#sc-shop-head', 'r'), icons.key, {
            kind: 'tls',
            look: 'icon',
            where: 'right',
            gap: 4,
          }),
        ]);
        const tlsTag = await d.tag(
          apex,
          { es: 'TLS · licencia y clave', en: 'TLS · license and code word' },
          'tls',
          'below',
        );

        await d.caption(
          { es: 'Haces el pedido', en: 'You place your order' },
          { chip: 'HTTP', kind: 'http' },
        );
        await d.say(
          'sc-you',
          { es: 'Una estantería, por favor.', en: 'A bookshelf, please.' },
          { hold: 1100 },
        );
        await d.fly(call, { es: 'pedido', en: 'order' }, 'http');
        const under = tlsTag ? d.box(tlsTag) : null;
        await d.tag(
          under ? { x: under.x + under.w / 2, y: under.y + under.h } : apex,
          { es: 'HTTP · el pedido', en: 'HTTP · the order' },
          'http',
          'below',
        );

        await d.caption(
          { es: 'En la tienda lo preparan', en: 'The store gets it ready' },
          {
            chip: { es: 'servidor', en: 'server' },
            kind: 'http',
          },
        );
        await d.wiggle('hammer', d.pt('.sc-shop__counter', 'tl', 10, -6), 1100);
        await d.reveal('#sc-box-shop');
        await d.tag(d.pt('shop', 'tr', -12, 0), { es: 'servidor', en: 'server' }, 'http', 'above');

        await d.caption(
          { es: 'Te lo envían', en: 'They ship it to you' },
          { chip: { es: 'respuesta', en: 'response' }, kind: 'http' },
        );
        await d.wait(300);
        d.q('#sc-box-shop').hidden = true;
        const van = d.box(await d.prop('van', roadLine(d).van));
        await d.tag(
          { x: van.x + van.w / 2, y: van.y + van.h },
          { es: 'respuesta', en: 'response' },
          'http',
          'below',
        );

        await d.caption(
          { es: 'Lo montas en casa', en: 'You put it together at home' },
          {
            chip: { es: 'navegador', en: 'browser' },
            kind: 'muted',
          },
        );
        await d.reveal('#sc-box-home');
        await d.wait(450);
        d.q('#sc-box-home').hidden = true;
        await d.reveal('#sc-shelf');
        await d.tag(d.pt('#sc-shelf', 't'), { es: 'navegador', en: 'browser' }, 'muted', 'above');
        await d.caption({
          es: 'Cada paso espera al anterior, y cada viaje cuesta más cuanto más lejos esté la tienda.',
          en: 'Each step waits for the one before it, and each round trip costs more the farther away the store is.',
        });
      },
    },
    {
      id: 'url',
      view: 'url',
      kind: 'muted',
      chip: { es: 'URL', en: 'URL' },
      title: { es: '1 · El navegador lee la URL', en: '1 · The browser reads the URL' },
      start: typed,
      end: typed,
      async play(d) {
        await d.wait(350);
        await d.caption({
          es: 'La URL tiene tres partes, y cada una le dice algo al navegador',
          en: 'The URL has three parts, and each one tells the browser something',
        });
        for (const part of ['scheme', 'host', 'path'] as const) {
          d.q(`.sc-url__part[data-part="${part}"]`).classList.add('is-marked');
          await d.show(`#sc-um-${part}`);
          await d.wait(700);
        }
        await d.note(
          d.pt('urlmap', 'b'),
          {
            es: 'Si escribes solo <b>example.com</b>, el navegador prueba primero <b>https://</b>',
            en: 'If you type just <b>example.com</b>, the browser tries <b>https://</b> first',
          },
          { where: 'below', look: 'wrap', gap: 10 },
        );
        await d.caption({
          es: 'Con el nombre, el navegador aún no sabe adónde ir: necesita la IP.',
          en: 'A name alone doesn’t tell the browser where to go: it needs the IP address.',
        });
      },
    },
    {
      id: 'dns',
      view: 'dns',
      kind: 'dns',
      chip: { es: 'DNS', en: 'DNS' },
      title: { es: '2 · Busca la IP del servidor', en: '2 · It looks up the server’s IP address' },
      start: typed,
      end: afterDns,
      async play(d) {
        await d.wait(300);
        await d.caption(
          {
            es: 'El navegador mira su caché y la del sistema: no está',
            en: 'The browser checks its cache and the system’s: it isn’t there',
          },
          { n: '1', kind: 'dns' },
        );
        await d.note(
          d.pt('browser', 't'),
          both((l) => net[l].cacheMiss),
          { where: 'above', kind: 'dns', ttl: 1700 },
        );
        await d.caption(
          {
            es: 'Pregunta al resolver: «¿IP de example.com?»',
            en: 'It asks the resolver: “IP address of example.com?”',
          },
          { n: '1', kind: 'dns' },
        );
        await d.fly(dnsRoute(d), { es: '¿IP de example.com?', en: 'IP of example.com?' }, 'dns', {
          trail: { badge: '1' },
          arrive: 'resolver',
        });
        await d.setText(
          '#sc-cache',
          both((l) => net[l].cacheMiss),
        );
        await d.caption(
          { es: 'El resolver pregunta a un servidor raíz', en: 'The resolver asks a root server' },
          { n: '2', kind: 'dns' },
        );
        await exchange(
          d,
          'root',
          { es: '¿example.com?', en: 'example.com?' },
          { es: 'pregunta a .com', en: 'ask .com' },
          '2',
        );
        await d.caption(
          {
            es: 'El de .com le dice quién lleva example.com',
            en: 'The .com server says who runs example.com',
          },
          {
            n: '3',
            kind: 'dns',
          },
        );
        await exchange(
          d,
          'com',
          { es: '¿example.com?', en: 'example.com?' },
          { es: 'pregunta a Cloudflare', en: 'ask Cloudflare' },
          '3',
        );
        await d.caption(
          {
            es: 'El autoritativo tiene la respuesta',
            en: 'The authoritative server has the answer',
          },
          { n: '4', kind: 'dns' },
        );
        await exchange(
          d,
          'auth',
          { es: '¿example.com?', en: 'example.com?' },
          'A 104.20.23.154',
          '4',
        );
        await d.setText(
          '#sc-cache',
          both((l) => net[l].cacheHit),
        );
        d.set({ cache: true });
        await d.caption(
          {
            es: 'El resolver la guarda en caché y responde al navegador',
            en: 'The resolver caches it and answers the browser',
          },
          { n: '1', kind: 'dns' },
        );
        await d.fly(reversed(dnsRoute(d)), '104.20.23.154', 'dns', { arrive: 'browser' });
        await d.reveal('#sc-ip');
        d.set({ ip: true });
        d.done('dns');
        await d.clockTo(timeUntil(d.lang, 'near', 'dns'));
        await d.caption(
          both((l) =>
            l === 'es'
              ? `DNS: ${took(l, 'dns')}. La próxima vez saldrá de la caché, en unos 3 ms.`
              : `DNS: ${took(l, 'dns')}. Next time the answer comes from the cache, in a few milliseconds.`,
          ),
        );
      },
    },
    {
      id: 'tcp',
      view: 'net',
      kind: 'tcp',
      chip: { es: 'TCP', en: 'TCP' },
      title: { es: '3 · Abre una conexión', en: '3 · It opens a connection' },
      start: afterDns,
      end: afterTcp,
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'El sistema operativo abre un socket con un puerto efímero',
          en: 'The operating system opens a socket with an ephemeral port',
        });
        await d.note(
          d.pt('browser', 't'),
          {
            es: 'socket · puerto 52814 → 104.20.23.154:443',
            en: 'socket · port 52814 → 104.20.23.154:443',
          },
          { where: 'above', kind: 'tcp' },
        );
        const route = netRoute(d);
        await d.caption(
          { es: '«¿Me oye?»', en: '“Can you hear me?”' },
          { chip: 'SYN', kind: 'tcp' },
        );
        await d.fly(route.slice(0, 2), 'SYN', 'tcp');
        d.glow('router', 'tcp');
        void d
          .note(
            d.pt(d.stage.actor('router')!, 'b'),
            {
              es: 'NAT: de tu IP privada a la pública',
              en: 'NAT: from your private IP address to the public one',
            },
            { where: 'below', kind: 'muted', ttl: 2200, gap: 4 },
          )
          .catch(() => {});
        await d.fly(route.slice(1), 'SYN', 'tcp', { arrive: 'server' });
        await d.caption(
          { es: '«Sí, le oigo. ¿Me oye usted?»', en: '“Yes, I can hear you. Can you hear me?”' },
          { chip: 'SYN-ACK', kind: 'tcp' },
        );
        await d.fly(reversed(route), 'SYN-ACK', 'tcp', { arrive: 'browser' });
        await d.caption({ es: '«Sí»', en: '“Yes”' }, { chip: 'ACK', kind: 'tcp' });
        await d.fly(route, 'ACK', 'tcp', { arrive: 'server' });
        d.set({ tcp: true });
        await tube(d, false, true);
        await d.note(pointAt(route, 0.62), 'SYN → · ← SYN-ACK · ACK →', {
          where: 'above',
          kind: 'tcp',
          gap: 20,
        });
        d.done('tcp');
        await d.clockTo(timeUntil(d.lang, 'near', 'tcp'));
        await d.caption(
          both((l) =>
            l === 'es'
              ? `TCP: un viaje de ida y vuelta, ${took(l, 'tcp')}. La conexión queda abierta.`
              : `TCP: one round trip, ${took(l, 'tcp')}. The connection stays open.`,
          ),
        );
      },
    },
    {
      id: 'tls',
      view: 'net',
      kind: 'tls',
      chip: { es: 'TLS', en: 'TLS' },
      title: { es: '4 · Cifra la conexión', en: '4 · It encrypts the connection' },
      start: afterTcp,
      end: afterTls,
      async play(d) {
        await d.wait(300);
        const route = netRoute(d);
        await d.caption(
          {
            es: 'El navegador saluda, propone cómo cifrar y pide HTTP/2',
            en: 'The browser says hello, proposes how to encrypt and asks for HTTP/2',
          },
          { chip: 'ClientHello', kind: 'tls' },
        );
        await d.fly(route, 'ClientHello', 'tls', { arrive: 'server' });
        await d.caption(
          {
            es: 'El servidor responde con su certificado y su firma',
            en: 'The server answers with its certificate and its signature',
          },
          { chip: 'ServerHello', kind: 'tls' },
        );
        await d.fly(
          reversed(route),
          { es: 'certificado + firma', en: 'certificate + signature' },
          'tls',
          { arrive: 'browser' },
        );
        const card = await d.note(d.pt('browser', 't'), certificate, {
          where: 'above',
          kind: 'tls',
          look: 'card',
        });
        await d.caption({
          es: 'El navegador comprueba la cadena, el nombre y las fechas',
          en: 'The browser checks the chain, the name and the dates',
        });
        for (const check of card ? [...card.querySelectorAll('li')] : []) {
          await d.wait(450);
          check.classList.add('is-ok');
        }
        await d.caption({
          es: 'Los dos calculan la misma clave. Desde aquí, todo viaja cifrado.',
          en: 'Both work out the same key. From here on, everything is encrypted.',
        });
        await Promise.all([d.show('#sc-key-b'), d.show('#sc-key-s')]);
        await tube(d, true, true);
        await d.show('#sc-lock');
        d.set({ tls: true });
        await d.note(
          pointAt(netRoute(d), 0.62),
          { es: 'acordado: HTTP/2', en: 'agreed: HTTP/2' },
          { where: 'below', kind: 'tls', gap: 30 },
        );
        d.done('tls');
        await d.clockTo(timeUntil(d.lang, 'near', 'tls'));
        await d.caption(
          both((l) =>
            l === 'es'
              ? `TLS: otro viaje de ida y vuelta, ${took(l, 'tls')}. El candado ya está cerrado.`
              : `TLS: another round trip, ${took(l, 'tls')}. The padlock is now closed.`,
          ),
        );
      },
    },
    {
      id: 'http',
      view: 'net',
      kind: 'http',
      chip: { es: 'HTTP', en: 'HTTP' },
      title: { es: '5 · Pide la página', en: '5 · It asks for the page' },
      start: afterTls,
      end: afterTls,
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'El navegador escribe la petición',
          en: 'The browser writes the request',
        });
        const written = await d.note(d.pt('browser', 't'), request, {
          where: 'above',
          kind: 'http',
          look: 'card',
        });
        await d.wait(1200);
        await d.caption({
          es: 'Sale cifrada, junto al último mensaje de TLS',
          en: 'It leaves encrypted, along with TLS’s last message',
        });
        await d.vanish(written);
        await d.fly(netRoute(d), 'GET /', 'http', { arrive: 'server', icon: 'lock' });
        await d.caption({
          es: 'El servidor la descifra y la lee',
          en: 'The server decrypts it and reads it',
        });
        await d.note(d.pt('server', 't'), request, { where: 'above', kind: 'http', look: 'card' });
        await d.caption({
          es: 'La petición ya está en el servidor. Ahora le toca a él.',
          en: 'The request has reached the server. Now it’s the server’s turn.',
        });
      },
    },
    {
      id: 'server',
      view: 'server',
      kind: 'http',
      chip: { es: 'servidor', en: 'server' },
      title: {
        es: '6 · El servidor prepara la respuesta',
        en: '6 · The server prepares the response',
      },
      start: afterTls,
      end: afterServer,
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Dentro del servidor, un programa escucha en el puerto 443',
          en: 'Inside the server, a program listens on port 443',
        });
        await d.show('#sc-srv-program');
        const program = d.pt('#sc-srv-program');
        await d.fly([{ x: 0, y: program.y }, d.pt('#sc-srv-program', 'l')], 'GET /', 'http', {
          arrive: '#sc-srv-program',
          icon: 'lock',
        });
        await d.caption({
          es: 'Decide qué responder. Puede consultar una base de datos…',
          en: 'It decides what to answer. It might query a database…',
        });
        await d.show('#sc-srv-db');
        await d.fly(
          [d.pt('#sc-srv-program', 'b', -24), d.pt('#sc-srv-db', 't')],
          'SELECT …',
          'http',
          { arrive: '#sc-srv-db' },
        );
        await d.fly(
          [d.pt('#sc-srv-db', 't'), d.pt('#sc-srv-program', 'b', -24)],
          { es: 'filas', en: 'rows' },
          'http',
          {
            arrive: '#sc-srv-program',
          },
        );
        await d.caption({
          es: '…leer un fichero o llamar a otros servicios',
          en: '…read a file or call other services',
        });
        await d.show('#sc-srv-file');
        await d.fly(
          [d.pt('#sc-srv-program', 'b', 24), d.pt('#sc-srv-file', 't')],
          { es: 'leer', en: 'read' },
          'http',
          {
            arrive: '#sc-srv-file',
          },
        );
        await d.fly(
          [d.pt('#sc-srv-file', 't'), d.pt('#sc-srv-program', 'b', 24)],
          'index.html',
          'http',
          {
            arrive: '#sc-srv-program',
          },
        );
        await d.caption({
          es: 'Y empieza a enviar la respuesta: 200 OK con el HTML',
          en: 'And it starts sending the response: 200 OK with the HTML',
        });
        await d.note(
          d.pt('server-room', 't'),
          { es: '200 OK · text/html, lista para enviar', en: '200 OK · text/html, ready to send' },
          { where: 'above', kind: 'http', gap: 10 },
        );
        await d.show('#sc-srv-backend');
        await d.caption({
          es: 'Todo lo que pasa aquí dentro es el backend: el resto del curso.',
          en: 'Everything that happens in here is the backend: the rest of this course.',
        });
      },
    },
    {
      id: 'response',
      view: 'net',
      kind: 'http',
      chip: { es: 'respuesta', en: 'response' },
      title: { es: '7 · La respuesta llega por trozos', en: '7 · The response arrives in pieces' },
      start: afterTls,
      end: afterResponse,
      async play(d) {
        await d.wait(300);
        const route = netRoute(d);
        const back = reversed(route);
        await d.caption({
          es: 'La respuesta sale troceada en segmentos TCP',
          en: 'The response leaves split into TCP segments',
        });
        await Promise.all(
          [0, 1, 2, 3].map(async (i) => {
            await d.wait(i * 360);
            await d.fly(back, i === 0 ? '200 OK · 1/4' : `${i + 1}/4`, 'http', {
              arrive: 'browser',
            });
            if (i === 0) {
              d.done('wait');
              void d.clockTo(timeUntil(d.lang, 'near', 'wait'), 300).catch(() => {});
              void d
                .caption(
                  both((l) =>
                    l === 'es'
                      ? `Llega el primer byte: ${until(l, 'wait')} desde que pulsaste Enter (el TTFB)`
                      : `The first byte arrives: ${until(l, 'wait')} after you pressed Enter (the TTFB)`,
                  ),
                )
                .catch(() => {});
              void d
                .note(
                  d.pt('browser', 't'),
                  both((l) => `${l === 'es' ? 'primer byte' : 'first byte'} · ${until(l, 'wait')}`),
                  { where: 'above', kind: 'http' },
                )
                .catch(() => {});
            }
            await d.fly(route, 'ACK', 'tcp', { small: true });
          }),
        );
        d.done('down');
        await d.clockTo(timeUntil(d.lang, 'near'), 200);
        await d.caption({
          es: 'Cada segmento se confirma con un ACK',
          en: 'Each segment is confirmed with an ACK',
        });
        await d.caption({
          es: 'La página es pequeña: la descarga tarda menos de 1 ms',
          en: 'The page is small: the download takes less than 1 ms',
        });
      },
    },
    {
      id: 'browser',
      view: 'browser',
      kind: 'muted',
      chip: { es: 'navegador', en: 'browser' },
      title: { es: '8 · El navegador pinta la página', en: '8 · The browser paints the page' },
      start: afterResponse,
      end: afterPaint,
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'El navegador lee el HTML y empieza a pintar',
          en: 'The browser reads the HTML and starts painting',
        });
        for (const part of d.qa('[data-paint="1"]')) {
          part.classList.add('is-painted');
          await d.wait(320);
        }
        d.q('#sc-tab-title').textContent = net[d.lang].pageTitle;
        await d.caption({
          es: 'Si la página pide estilos o imágenes, los pide por la misma conexión',
          en: 'If the page needs styles or images, it asks over the same connection',
        });
        const out = [d.pt('#sc-page'), d.pt('browser', 'r', 46)];
        const styles: Text = { es: 'estilos.css', en: 'styles.css' };
        const photo: Text = { es: 'foto.jpg', en: 'photo.jpg' };
        await Promise.all([
          d.fly(out, styles, 'http'),
          (async () => {
            await d.wait(260);
            await d.fly(out, photo, 'http');
          })(),
        ]);
        await d.fly(reversed(out), styles, 'http');
        d.q('#sc-page').classList.add('is-styled');
        await d.caption({
          es: 'Pinta en cuanto tiene el HTML y el CSS, sin esperar a las imágenes',
          en: 'It paints once it has the HTML and the CSS, without waiting for images',
        });
        await d.wait(600);
        await d.fly(reversed(out), photo, 'http');
        d.q('[data-paint="2"]').classList.add('is-painted');
        d.q('#sc-tab-spin').classList.remove('is-on');
        await d.say('sc-me', { es: '¡Ya está!', en: 'There it is!' }, { keep: true });
        await d.caption(
          both((l) =>
            l === 'es'
              ? `Fin del recorrido: ${until(l, 'wait')} hasta el primer byte.`
              : `End of the journey: ${until(l, 'wait')} to the first byte.`,
          ),
        );
      },
    },
    {
      id: 'rtt',
      view: 'net',
      kind: 'muted',
      chip: { es: 'RTT', en: 'RTT' },
      title: { es: 'Cuánto cuesta cada viaje', en: 'What each round trip costs' },
      options: ['mode'],
      start: (options) => ({ url: true, ip: true, mode: modeOf(options) }),
      end: (options) => ({ ...afterResponse(), mode: modeOf(options) }),
      async play(d) {
        const mode = d.state.mode;
        const slow = mode === 'far' ? 2.3 : 1;
        await d.wait(300);
        const route = netRoute(d);
        const back = reversed(route);
        await d.note(
          pointAt(route, 0.6),
          mode === 'far'
            ? { es: '≈ 8.000 km · RTT ≈ 200 ms', en: '≈ 8,000 km · RTT ≈ 210 ms' }
            : { es: 'servidor cerca · RTT ≈ 9 ms', en: 'nearby server · RTT ≈ 15 ms' },
          { where: 'below', kind: 'muted', gap: 36 },
        );
        await d.caption(
          mode === 'far'
            ? both((l) =>
                l === 'es'
                  ? `DNS: estaba en caché, ${took(l, 'dns', 'far')}`
                  : `DNS: it was cached, ${took(l, 'dns', 'far')}`,
              )
            : both((l) => `DNS: ${took(l, 'dns')}`),
        );
        d.done('dns');
        await d.clockTo(timeUntil(d.lang, mode, 'dns'), 500);
        const trips: [Phase, string, Text | string, Kind, Text][] = [
          [
            'tcp',
            'SYN',
            'SYN-ACK',
            'tcp',
            { es: 'Viaje 1: el handshake de TCP', en: 'Round trip 1: the TCP handshake' },
          ],
          [
            'tls',
            'ClientHello',
            { es: 'certificado', en: 'certificate' },
            'tls',
            { es: 'Viaje 2: el handshake de TLS', en: 'Round trip 2: the TLS handshake' },
          ],
          [
            'wait',
            'GET /',
            '200 OK',
            'http',
            {
              es: 'Viaje 3: la petición, más lo que tarda el servidor',
              en: 'Round trip 3: the request, plus however long the server takes',
            },
          ],
        ];
        for (const [phase, there, answer, kind, text] of trips) {
          await d.caption(text);
          await d.fly(route, there, kind, { dur: 1300 * slow, arrive: 'server' });
          await d.fly(back, answer, kind, { dur: 1300 * slow, arrive: 'browser' });
          if (phase === 'tcp') {
            d.set({ tcp: true });
            await tube(d, false, true);
          }
          if (phase === 'tls') {
            d.set({ tls: true });
            await tube(d, true, true);
          }
          d.done(phase);
          await d.clockTo(timeUntil(d.lang, mode, phase), 450);
        }
        await d.caption(
          both((l) =>
            l === 'es'
              ? `Primer byte: ${until(l, 'wait', mode)}. Tres viajes antes de recibir nada.`
              : `First byte: ${until(l, 'wait', mode)}. Three round trips before anything arrives.`,
          ),
        );
        await d.wait(900);
        if (mode === 'far') {
          await d.caption({
            es: 'TCP empieza con unos 14 KB y dobla en cada viaje',
            en: 'TCP starts with about 14 KB and doubles every round trip',
          });
          await d.caption({
            es: 'Una página de 50 KB necesita tres tandas',
            en: 'A 50 KB page needs three batches',
          });
          for (const batch of ['14 KB', '28 KB', '8 KB']) {
            await d.fly(back, batch, 'http', { dur: 1300 * slow });
            await d.fly(route, 'ACK', 'tcp', { dur: 1000 * slow, small: true });
          }
        }
        d.done('down');
        await d.clockTo(timeUntil(d.lang, mode), 500);
        await d.caption(
          mode === 'far'
            ? both((l) =>
                l === 'es'
                  ? `Total: ${until(l, undefined, 'far')}. Más de medio segundo solo esperando a la distancia.`
                  : `Total: ${until(l, undefined, 'far')}. More than half a second just waiting on distance.`,
              )
            : both((l) =>
                l === 'es'
                  ? `Total: ${until(l)}. Con el servidor cerca no lo notas. Prueba con Johannesburgo.`
                  : `Total: ${until(l)}. With the server nearby you don’t notice. Try Johannesburg.`,
              ),
        );
      },
    },
    {
      id: 'try',
      view: 'overview',
      kind: 'tcp',
      chip: { es: 'curl', en: 'curl' },
      title: { es: 'Mídelo con curl', en: 'Measure it with curl' },
      start: afterPaint,
      end: afterPaint,
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Cada número de curl marca cuándo terminó una fase, contando desde el principio',
          en: 'Each curl number marks when a phase ended, counting from the start',
        });
        // The lesson's own `curl -w` output in each language.
        const run = {
          es: {
            dns: '0.025',
            tcp: '0.033',
            tls: '0.043',
            first: 'primer byte: 0.074',
            total: '0.074',
          },
          en: {
            dns: '0.026',
            tcp: '0.043',
            tls: '0.056',
            first: 'first byte: 0.071',
            total: '0.071',
          },
        }[d.lang];
        const lock = d.stage.fx.querySelector('#sc-tube-lock');
        const marks: [Point, string, Kind, Place, number][] = [
          [d.pt('resolver', 'r'), `dns: ${run.dns}`, 'dns', 'right', 8],
          [d.pt(d.stage.actor('router')!, 'b'), `tcp: ${run.tcp}`, 'tcp', 'below', 6],
          [
            lock ? d.pt(lock, 't') : pointAt(netRoute(d), 0.5),
            `tls: ${run.tls}`,
            'tls',
            'above',
            10,
          ],
          [d.pt(d.stage.actor('server')!, 'b'), run.first, 'http', 'below', 6],
          [d.pt(d.stage.actor('browser')!, 'b'), `total: ${run.total}`, 'http', 'below', 6],
        ];
        for (const [at, text, kind, where, gap] of marks) {
          await d.note(at, text, { kind, where, gap });
          await d.wait(380);
        }
        await d.caption({
          es: 'Ejecútalo en tu terminal: tus números serán otros.',
          en: 'Run it in your terminal: your numbers will be different.',
        });
      },
    },
  ],
};

export default lesson;
