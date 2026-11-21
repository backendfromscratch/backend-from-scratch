/**
 * The scenes of «IP, puertos y sockets» / "IP addresses, ports and sockets" (translationKey
 * ip-ports-sockets), one per part of the text, in the order of its <Scene id="…" /> cues: three
 * questions, an office building's front desk, private and public addresses, NAT step by step, routing
 * hop by hop, ports, sockets, and the lesson's first and last exercises. The addresses are the text's.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { INITIAL, nat, route, type NatState } from '../worlds/nat/nat';

type D = Director<NatState>;

const ipv6: Text = {
  es: '<div class="scene-card"><b>2606:4700:10::6814:179a</b><span class="scene-card__dim">es 2606:4700:0010:0000:0000:0000:6814:179a</span></div>',
  en: '<div class="scene-card"><b>2606:4700:10::6814:179a</b><span class="scene-card__dim">is 2606:4700:0010:0000:0000:0000:6814:179a</span></div>',
};

/** The edge of the stage beyond the building, where the letters go out to and come back from. */
const outside = (d: D) => {
  const desk = d.box('#nt-desk');
  return { x: d.stage.size().w - 12, y: desk.y + desk.h / 2 };
};

const lesson: LessonModule<NatState> = {
  initial: INITIAL,
  worlds: [nat],
  scenes: [
    {
      id: 'problem',
      view: 'which',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Tres preguntas', en: 'Three questions' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        d.glow('#nt-pc-ip', 'dns');
        await d.caption({
          es: 'Tu portátil tiene una IP privada: 192.168.1.133',
          en: 'Your laptop has a private IP address: 192.168.1.133',
        });
        d.glow('twins', 'dns');
        await d.caption({
          es: 'La de tu vecino puede ser la misma, y la de alguien en Tokio, también',
          en: 'Your neighbor’s may be the same, and so may someone’s in Tokyo',
        });
        await d.fly(route(d, 'ex', 'pc'), { es: '¿a cuál?', en: 'which one?' }, 'muted', {
          small: true,
        });
        await d.caption(
          { es: '¿A qué ordenador?', en: 'Which computer?' },
          { n: '1', kind: 'dns' },
        );
        await d.caption({ es: '¿Por qué camino?', en: 'Which path?' }, { n: '2', kind: 'dns' });
        for (const program of ['browser', 'spotify', 'slack']) d.glow(`#nt-prog-${program}`, 'tcp');
        await d.caption({ es: '¿A qué programa?', en: 'Which program?' }, { n: '3', kind: 'tcp' });
      },
    },
    {
      id: 'analogy',
      view: 'office',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Una recepción con libreta', en: 'A front desk with a notebook' },
      start: () => ({}),
      end: () => ({ noted: true }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Un edificio con una sola dirección y una recepción',
          en: 'A building with a single address and a front desk',
        });
        await d.fly(route(d, '#nt-office-3', '#nt-desk'), { es: 'carta', en: 'letter' }, 'http', {
          small: true,
        });
        d.set({ noted: true });
        d.glow('#nt-note', 'http');
        await d.caption({
          es: 'Recepción pone la dirección del edificio, la «ref. 61000», y lo apunta',
          en: 'The front desk puts the building’s address, “ref. 61000,” and notes it down',
        });
        await d.fly([d.pt('#nt-desk', 'r'), outside(d)], 'ref. 61000', 'http', { small: true });
        await d.fly(
          [outside(d), d.pt('#nt-desk', 'r')],
          { es: 'respuesta · ref. 61000', en: 'reply · ref. 61000' },
          'http',
          {
            small: true,
            arrive: '#nt-desk',
          },
        );
        d.glow('#nt-note', 'http');
        await d.fly(
          route(d, '#nt-desk', '#nt-office-3'),
          { es: 'respuesta', en: 'reply' },
          'http',
          {
            small: true,
            arrive: '#nt-office-3',
          },
        );
        await d.caption({
          es: 'Mira la libreta y la sube al despacho 3: desde fuera, nadie sabe que existe',
          en: 'It checks the notebook and takes it up to office 3: from outside, nobody knows it exists',
        });
      },
    },
    {
      id: 'ip',
      view: 'addresses',
      kind: 'dns',
      chip: { es: 'IP', en: 'IP' },
      title: { es: 'Qué ordenador', en: 'Which computer' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        for (const id of ['#nt-pc-ip', '#nt-gw-in']) d.glow(id, 'dns');
        await d.tag(
          d.pt('mobile', 'b'),
          { es: 'privadas: solo en tu red', en: 'private: only on your network' },
          'muted',
          'below',
        );
        await d.caption({
          es: 'Dentro de casa, IP privadas: se repiten en todo el mundo',
          en: 'Inside your home, private addresses: they repeat all over the world',
        });
        d.glow('#nt-gw-out', 'dns');
        await d.tag(
          d.pt('ex', 'b'),
          { es: 'públicas: únicas en internet', en: 'public: unique on the internet' },
          'dns',
          'below',
        );
        await d.caption({
          es: 'Fuera, la IP pública de tu router y la de example.com',
          en: 'Outside, your router’s public address and example.com’s',
        });
        await d.note(d.pt('ex', 't'), ipv6, { where: 'above', look: 'card', gap: 12 });
        await d.caption({
          es: 'IPv6 tiene direcciones de sobra, y se escriben acortadas',
          en: 'IPv6 has addresses to spare, and they’re written shortened',
        });
      },
    },
    {
      id: 'nat',
      view: 'translate',
      kind: 'dns',
      chip: { es: 'NAT', en: 'NAT' },
      title: { es: 'Cómo sale tu IP privada', en: 'How your private IP gets out' },
      start: () => ({}),
      end: () => ({ nat: 2 }),
      async play(d) {
        await d.wait(400);
        await d.fly(
          route(d, 'pc', 'gw'),
          { es: 'de 192.168.1.133:54321', en: 'from 192.168.1.133:54321' },
          'dns',
          {
            arrive: 'gw',
          },
        );
        await d.caption(
          {
            es: 'Tu portátil envía la petición con su IP privada como origen',
            en: 'Your laptop sends the request with its private IP as the source',
          },
          { n: '1', kind: 'dns' },
        );
        d.set({ nat: 1 });
        d.glow('#nt-nat-1', 'dns');
        await d.fly(
          route(d, 'gw', 'ex'),
          { es: 'de 203.0.113.7:61000', en: 'from 203.0.113.7:61000' },
          'dns',
          { arrive: 'ex' },
        );
        await d.caption(
          {
            es: 'El router cambia el origen por su IP pública y un puerto, y lo apunta',
            en: 'The router swaps the source for its public IP and a port, and writes it down',
          },
          { n: '2', kind: 'dns' },
        );
        await d.fly(
          route(d, 'ex', 'gw'),
          { es: 'a 203.0.113.7:61000', en: 'to 203.0.113.7:61000' },
          'dns',
          { arrive: 'gw' },
        );
        await d.caption(
          {
            es: 'example.com responde a quien cree que le ha escrito: el router',
            en: 'example.com answers whoever it thinks wrote: the router',
          },
          { n: '3', kind: 'dns' },
        );
        d.glow('#nt-nat-1', 'dns');
        await d.fly(
          route(d, 'gw', 'pc'),
          { es: 'a 192.168.1.133:54321', en: 'to 192.168.1.133:54321' },
          'dns',
          { arrive: 'pc' },
        );
        await d.caption(
          {
            es: 'El router busca el 61000 en su tabla y devuelve el destino original',
            en: 'The router looks up 61000 in its table and puts back the original destination',
          },
          { n: '4', kind: 'dns' },
        );
        d.set({ nat: 2 });
        d.glow('#nt-nat-2', 'dns');
        await d.caption({
          es: 'Tu móvil sale por la misma IP pública, con otro puerto',
          en: 'Your phone goes out through the same public IP, with another port',
        });
        await d.fly(route(d, 'ex', 'gw'), '?', 'muted', { small: true, arrive: 'gw' });
        await d.note(
          d.pt('table', 'b'),
          {
            es: 'no está en la tabla <span class="ko">✗</span>',
            en: 'not in the table <span class="ko">✗</span>',
          },
          {
            where: 'below',
            gap: 10,
          },
        );
        await d.caption({
          es: 'Por eso una conversación solo se puede empezar desde dentro',
          en: 'That’s why a conversation can only be started from inside',
        });
      },
    },
    {
      id: 'routing',
      view: 'routing',
      kind: 'dns',
      chip: { es: 'camino', en: 'path' },
      title: { es: 'Por qué camino', en: 'Which path' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        for (let i = 1; i <= 3; i++) d.glow(`#nt-route-${i}`, 'dns');
        await d.caption({
          es: 'Tu portátil mira su tabla de rutas',
          en: 'Your laptop checks its route table',
        });
        d.glow('#nt-route-3', 'dns');
        await d.fly(route(d, 'pc', 'gw'), 'TTL 64', 'dns', { arrive: 'gw' });
        await d.caption({
          es: 'Lo que no es de tu red va a la puerta de enlace: el router',
          en: 'Anything not on your network goes to the gateway: the router',
        });
        await d.fly(route(d, 'gw', 'backbone'), 'TTL 63', 'dns', { arrive: 'backbone' });
        await d.caption({
          es: 'Cada router solo decide el siguiente salto',
          en: 'Each router only picks the next hop',
        });
        await d.fly(route(d, 'backbone', 'ex'), 'TTL 62', 'dns', { arrive: 'ex' });
        await d.caption({
          es: 'Y le resta uno al TTL: nada da vueltas para siempre',
          en: 'And subtracts one from the TTL: nothing goes round forever',
        });
      },
    },
    {
      id: 'ports',
      view: 'ports',
      kind: 'tcp',
      chip: { es: 'puertos', en: 'ports' },
      title: { es: 'Qué programa', en: 'Which program' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.fly(
          [d.pt('ex', 'r'), d.pt('#nt-prog-browser', 'l')],
          { es: 'al puerto 54321', en: 'to port 54321' },
          'tcp',
          {
            arrive: '#nt-prog-browser',
          },
        );
        await d.caption({
          es: 'El sistema lo entrega al programa de ese puerto: el navegador',
          en: 'The system hands it to that port’s program: the browser',
        });
        await d.caption({
          es: 'El navegador estrenó ese puerto para esta conversación: es efímero',
          en: 'The browser got that port for this conversation: it’s ephemeral',
        });
        await d.tag(
          d.pt('ex', 'b'),
          { es: 'servidores: 80, 443…', en: 'servers: 80, 443…' },
          'tcp',
          'below',
        );
        await d.caption({
          es: 'Los servidores, en cambio, escuchan en puertos fijos',
          en: 'Servers, instead, listen on fixed ports',
        });
      },
    },
    {
      id: 'sockets',
      view: 'sockets',
      kind: 'tcp',
      chip: { es: 'sockets', en: 'sockets' },
      title: { es: 'Lo que une las tres cosas', en: 'What ties the three together' },
      start: () => ({}),
      end: () => ({ sockets: 3, nat: 2 }),
      async play(d) {
        await d.wait(400);
        d.set({ sockets: 1 });
        d.glow('#nt-socket-1', 'tcp');
        await d.caption({ es: 'example.com escucha en el 443', en: 'example.com listens on 443' });
        await d.fly(route(d, 'pc', 'gw'), ':54321', 'tcp', { small: true });
        await d.fly(route(d, 'gw', 'ex'), '203.0.113.7:61000', 'tcp', { arrive: 'ex' });
        d.set({ sockets: 2, nat: 1 });
        d.glow('#nt-socket-2', 'tcp');
        await d.caption({
          es: 'Cada cliente que llega tiene su propio socket',
          en: 'Each client that arrives gets its own socket',
        });
        await d.fly(route(d, 'mobile', 'gw'), ':50122', 'tcp', { small: true });
        await d.fly(route(d, 'gw', 'ex'), '203.0.113.7:61001', 'tcp', { arrive: 'ex' });
        d.set({ sockets: 3, nat: 2 });
        d.glow('#nt-socket-3', 'tcp');
        await d.caption({
          es: 'Cuatro valores los distinguen: la IP y el puerto de cada lado',
          en: 'Four values tell them apart: the IP and the port on each side',
        });
      },
    },
    {
      id: 'try',
      view: 'routing',
      kind: 'dns',
      chip: { es: 'Pruébalo', en: 'Try it' },
      title: { es: 'Tus IP y tu camino', en: 'Your addresses and your path' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption(
          { es: 'Tu IP privada y tu IP pública', en: 'Your private and your public address' },
          { n: '1', kind: 'dns' },
        );
        await d.tag(d.pt('pc', 't'), 'ipconfig getifaddr en0', 'muted', 'above');
        await d.tag(d.pt('gw', 't'), 'curl -4 icanhazip.com', 'dns', 'above');
        await d.caption(
          { es: 'El camino, salto a salto: traceroute', en: 'The path, hop by hop: traceroute' },
          { n: '4', kind: 'dns' },
        );
        await d.fly(route(d, 'pc', 'gw'), '1', 'dns', { small: true, trail: { badge: '1' } });
        await d.fly(route(d, 'gw', 'backbone'), '2…', 'dns', { small: true, trail: {} });
        await d.fly(route(d, 'backbone', 'ex'), 'example.com', 'dns', {
          small: true,
          trail: {},
          arrive: 'ex',
        });
        await d.caption({
          es: 'Cada línea de traceroute es un salto; el primero, tu router',
          en: 'Each traceroute line is a hop; the first one, your router',
        });
      },
    },
  ],
};

export default lesson;
