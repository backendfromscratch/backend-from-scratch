/**
 * The scenes of «DNS» / "DNS" (translationKey dns), one per part of the text, in the order of its
 * <Scene id="…" /> cues: HOSTS.TXT, the hotel's front desk, the tree of names, a query's trip from
 * the root down, the record types, a TTL that keeps an old address, and the lesson's last `dig`
 * exercise. The servers, addresses and TTLs are the lesson's own (worlds/names/).
 */
import type { Director } from '../core/director';
import type { LessonModule, Point, Text } from '../core/types';
import { strings } from '../worlds/names/strings';
import { ADDRESS, INITIAL, names, route, type NamesState } from '../worlds/names/names';

type D = Director<NamesState>;

const ask = (d: D, from: string, to: string, label: Text | string, badge?: string) =>
  d.fly(route(d, from, to), label, 'dns', {
    arrive: to,
    ...(badge ? { trail: { badge } } : {}),
  });
const answer = (d: D, from: string, to: string, label: Text | string) =>
  d.fly(route(d, from, to), label, 'dns', { small: true, arrive: to });

/** A call from the front desk's phone to an office, and its answer back. */
async function call(d: D, office: 1 | 2 | 3, reply: Text | string): Promise<void> {
  const phone: Point = d.pt('#nm-clerk-phone');
  const desk: Point = d.pt(`#nm-off-${office}`, 'l');
  await d.fly([phone, desk], '', 'dns', { trail: { dashed: true } });
  await d.fly([desk, phone], reply, 'dns', { small: true });
}

const question = (d: D) => (d.lang === 'es' ? `¿${strings.es.domain}?` : `${strings.en.domain}?`);

const lesson: LessonModule<NamesState> = {
  initial: INITIAL,
  worlds: [names],
  scenes: [
    {
      id: 'problem',
      view: 'hosts',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Un fichero para todos', en: 'One file for everyone' },
      start: () => ({}),
      end: () => ({ file: 7, copies: [4, 7, 1] }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Al principio, un solo fichero con todos los nombres: HOSTS.TXT',
          en: 'At first, a single file with every name: HOSTS.TXT',
        });
        for (const i of [1, 2, 3]) {
          await d.fly(route(d, 'hostsfile', `#nm-copy-${i}`), 'HOSTS.TXT', 'muted', {
            small: true,
            arrive: `#nm-copy-${i}`,
          });
        }
        await d.caption({
          es: 'Cada ordenador se bajaba una copia de vez en cuando',
          en: 'Every computer downloaded a copy from time to time',
        });
        d.set({ file: 4 });
        d.glow('hostsfile', 'muted');
        await d.fly(route(d, 'hostsfile', '#nm-copy-1'), 'v4', 'muted', {
          small: true,
          arrive: '#nm-copy-1',
        });
        d.set({ copies: [4, 1, 1] });
        d.set({ file: 7 });
        d.glow('hostsfile', 'muted');
        await d.fly(route(d, 'hostsfile', '#nm-copy-2'), 'v7', 'muted', {
          small: true,
          arrive: '#nm-copy-2',
        });
        d.set({ copies: [4, 7, 1] });
        await d.caption({
          es: 'Con miles de ordenadores, no paraba de cambiar, y nadie tenía la última versión',
          en: 'With thousands of computers, it never stopped changing, and nobody had the latest version',
        });
        await d.caption({
          es: 'Hace falta una base de datos repartida: el DNS',
          en: 'What you need is a distributed database: DNS',
        });
      },
    },
    {
      id: 'analogy',
      view: 'hotel',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'La recepción del hotel', en: 'The hotel front desk' },
      start: () => ({}),
      end: () => ({ book: true }),
      async play(d) {
        await d.wait(400);
        await d.say('nm-guest', { es: '¿Dónde está la tienda?', en: 'Where’s the shop?' });
        await d.caption({
          es: 'La recepcionista no se sabe todas las tiendas, pero sabe a quién preguntar',
          en: 'The receptionist doesn’t know every shop, but she knows who to ask',
        });
        await call(d, 1, { es: 'llama a la ciudad', en: 'call the city' });
        await call(d, 2, { es: 'llama al barrio', en: 'call the association' });
        await call(d, 3, { es: strings.es.address, en: strings.en.address });
        await d.say('nm-clerk', { es: strings.es.address, en: strings.en.address });
        await d.caption({
          es: 'Tú solo has hecho una pregunta: todas las llamadas las ha hecho ella',
          en: 'You only asked one question: she made all the calls',
        });
        d.set({ book: true });
        d.glow('#nm-book', 'dns');
        await d.caption({
          es: 'Y la apunta en su libreta, válida hasta el viernes',
          en: 'And she writes it in her notebook, valid until Friday',
        });
        await d.caption({
          es: 'La recepción es tu resolver; las oficinas, los servidores DNS; la libreta, su caché',
          en: 'The front desk is your resolver; the offices, the DNS servers; the notebook, its cache',
        });
      },
    },
    {
      id: 'tree',
      view: 'tree',
      kind: 'dns',
      chip: { es: 'árbol', en: 'tree' },
      title: { es: 'Un árbol de nombres', en: 'A tree of names' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        const level = async (label: string, node: string, text: Text) => {
          d.glow(`#nm-l-${label}`, 'dns');
          d.glow(`#nm-t-${node}`, 'dns');
          await d.caption(text);
        };
        await level('root', 'root', {
          es: 'Un nombre se lee de derecha a izquierda: el punto final es la raíz',
          en: 'A name reads from right to left: the final dot is the root',
        });
        await level('com', 'com', {
          es: 'com es un dominio de primer nivel, un TLD, como es, org o dev',
          en: 'com is a top-level domain, a TLD, like es, org or dev',
        });
        await level('example', 'example', {
          es: 'example.com es el dominio que alguien ha comprado',
          en: 'example.com is the domain someone bought',
        });
        await level('www', 'www', {
          es: 'www.example.com es un nombre que su dueño crea como quiere',
          en: 'www.example.com is a name its owner creates however they like',
        });
        await d.caption({
          es: 'Cada nivel se lo encarga a otro: cada tramo es una zona, con sus propios servidores',
          en: 'Each level hands the next one over: each part is a zone, with its own servers',
        });
      },
    },
    {
      id: 'walk',
      view: 'walk',
      kind: 'dns',
      chip: { es: 'recorrido', en: 'the trip' },
      title: { es: 'El recorrido de una consulta', en: 'A query’s trip' },
      start: () => ({}),
      end: () => ({ walk: 2, left: 300 }),
      async play(d) {
        await d.wait(400);
        await ask(
          d,
          'pc',
          'resolver',
          { es: '¿IP de example.com?', en: 'IP of example.com?' },
          '1',
        );
        await d.caption({
          es: 'Tu ordenador pregunta a tu resolver, que no la tiene en caché',
          en: 'Your computer asks your resolver, which doesn’t have it cached',
        });
        await ask(d, 'resolver', 'root', { es: '¿example.com?', en: 'example.com?' }, '2');
        await answer(d, 'root', 'resolver', { es: 'pregunta a .com', en: 'ask .com' });
        d.set({ walk: 1 });
        await d.caption({
          es: 'La raíz no la sabe, pero sabe quién lleva .com',
          en: 'The root doesn’t know it, but it knows who runs .com',
        });
        await ask(d, 'resolver', 'tld', { es: '¿example.com?', en: 'example.com?' }, '3');
        await answer(d, 'tld', 'resolver', {
          es: 'pregunta a los de example.com',
          en: 'ask example.com’s servers',
        });
        await d.caption({
          es: 'Los de .com tampoco, pero saben quién lleva example.com',
          en: 'The .com servers don’t either, but they know who runs example.com',
        });
        await ask(d, 'resolver', 'auth', { es: '¿example.com?', en: 'example.com?' }, '4');
        await answer(d, 'auth', 'resolver', '104.20.23.154');
        d.set({ walk: 2 });
        await d.caption({
          es: 'Sus servidores autoritativos sí: tienen la respuesta oficial',
          en: 'Its authoritative servers do: they have the official answer',
        });
        await answer(d, 'resolver', 'pc', '104.20.23.154');
        await d.caption({
          es: 'El resolver te la da y la guarda en caché, con los pasos intermedios',
          en: 'The resolver gives it to you and caches it, with the steps in between',
        });
        await d.caption({
          es: 'Nadie conoce el mapa entero: cada servidor solo sabe a quién derivarte',
          en: 'Nobody knows the whole map: each server only knows who to send you to',
        });
        await d.caption({
          es: 'Todo por UDP, al puerto 53: una pregunta corta y una respuesta corta',
          en: 'All over UDP, to port 53: a short question and a short answer',
        });
      },
    },
    {
      id: 'records',
      view: 'zone',
      kind: 'dns',
      chip: { es: 'registros', en: 'records' },
      title: { es: 'Los tipos de registro', en: 'Record types' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        const rows = async (ids: number[], text: Text) => {
          for (const id of ids) d.glow(`#nm-r-${id}`, 'dns');
          await d.caption(text);
        };
        await rows([1, 2], {
          es: 'A y AAAA guardan una dirección: IPv4 o IPv6',
          en: 'A and AAAA store an address: IPv4 or IPv6',
        });
        await rows([3], {
          es: 'CNAME es un alias: «este nombre es otro»',
          en: 'CNAME is an alias: “this name is another one”',
        });
        await rows([4], {
          es: 'MX dice a dónde entregar el correo de @gmail.com',
          en: 'MX says where to deliver email for @gmail.com',
        });
        await rows([5], {
          es: 'TXT es texto libre, como las pruebas de que el dominio es tuyo',
          en: 'TXT is free text, like proof that the domain is yours',
        });
        await rows([6], {
          es: 'NS dice cuáles son los servidores DNS de la zona',
          en: 'NS says which are the zone’s DNS servers',
        });
      },
    },
    {
      id: 'ttl',
      view: 'ttl',
      kind: 'dns',
      chip: { es: 'TTL', en: 'TTL' },
      title: { es: 'El TTL y la «propagación»', en: 'The TTL and “propagation”' },
      start: () => ({}),
      end: () => ({ owner: 'new', mine: 'new', mineLeft: 300, other: 'new' }),
      async play(d) {
        await d.wait(400);
        const domain = strings[d.lang].domain;
        await d.caption({
          es: `Tu resolver tiene una copia de ${domain}, con un TTL de 300 segundos`,
          en: `Your resolver has a copy of ${domain}, with a TTL of 300 seconds`,
        });
        d.set({ owner: 'new' });
        d.glow('#nm-owner-row', 'dns');
        await d.caption({
          es: 'Cambias la IP de tu dominio en su servidor',
          en: 'You change your domain’s IP on its server',
        });
        await ask(d, 'pc', 'mine', question(d));
        d.set({ mineLeft: 210 });
        await answer(d, 'mine', 'pc', ADDRESS.old);
        await d.caption({
          es: 'Tu resolver sigue dando su copia, la vieja, sin volver a preguntar',
          en: 'Your resolver keeps handing out its copy, the old one, without asking again',
        });
        await ask(d, 'other', 'owner', question(d));
        await answer(d, 'owner', 'other', ADDRESS.new);
        d.set({ other: 'new' });
        await d.caption({
          es: 'Otro resolver, sin copia, pregunta y ya recibe la nueva',
          en: 'Another resolver, with no copy, asks and already gets the new one',
        });
        for (const left of [120, 30, 0]) {
          d.set({ mineLeft: left });
          await d.wait(600);
        }
        await d.caption({ es: 'Hasta que tu copia caduca…', en: 'Until your copy expires…' });
        await ask(d, 'mine', 'owner', question(d));
        await answer(d, 'owner', 'mine', ADDRESS.new);
        d.set({ mine: 'new', mineLeft: 300 });
        await d.caption({
          es: '…y tu resolver vuelve a preguntar: la nueva, con 300 segundos otra vez',
          en: '…and your resolver asks again: the new one, with 300 seconds again',
        });
        await d.caption({
          es: 'Nada se propaga: cada caché espera a que caduque su copia',
          en: 'Nothing propagates: every cache waits for its copy to expire',
        });
        await d.caption({
          es: 'Un TTL corto trae los cambios antes, a cambio de más consultas',
          en: 'A short TTL brings changes sooner, at the cost of more queries',
        });
      },
    },
    {
      id: 'try',
      view: 'dig',
      kind: 'dns',
      chip: { es: 'dig', en: 'dig' },
      title: { es: 'El TTL, contando hacia atrás', en: 'The TTL, counting down' },
      start: () => ({ left: 300 }),
      end: () => ({ left: 288, runs: 2 }),
      async play(d) {
        await d.wait(400);
        d.set({ left: 294 });
        await d.show('#nm-cmd-1');
        await ask(d, 'term', 'copy', { es: '¿example.com?', en: 'example.com?' });
        await answer(d, 'copy', 'term', 'A · 294 s');
        d.set({ runs: 1 });
        await d.caption({
          es: 'Tu resolver te da su copia y te dice cuánto le queda: 294 segundos',
          en: 'Your resolver gives you its copy and tells you how long it has left: 294 seconds',
        });
        await d.wait(600);
        d.set({ left: 288 });
        await d.show('#nm-cmd-2');
        await ask(d, 'term', 'copy', { es: '¿example.com?', en: 'example.com?' });
        await answer(d, 'copy', 'term', 'A · 288 s');
        d.set({ runs: 2 });
        await d.caption({
          es: 'Seis segundos después, 288: no ha vuelto a preguntar a los de example.com',
          en: 'Six seconds later, 288: it hasn’t asked example.com’s servers again',
        });
        await d.caption({
          es: 'Cuando llegue a cero, volverá a preguntarles, y el TTL empezará otra vez en 300',
          en: 'When it reaches zero, it will ask them again, and the TTL will start over at 300',
        });
      },
    },
  ],
};

export default lesson;
