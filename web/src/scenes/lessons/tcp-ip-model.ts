/**
 * The scenes of «El modelo TCP/IP» / "The TCP/IP model" (translationKey tcp-ip-model), one per part
 * of the text, in the order of its <Scene id="…" /> cues: the jobs the layers share out, the letter
 * and its envelope, four layers that talk to their peers, envelopes inside envelopes, the journey hop
 * by hop, OSI as a reference, and the lines of the lesson's `curl -sv`.
 */
import type { Director } from '../core/director';
import type { Kind, LessonModule, Point, Text } from '../core/types';
import { INITIAL, layers, route, row, type LayersState } from '../worlds/layers/layers';
import type { Layer } from '../worlds/layers/strings';

type D = Director<LayersState>;

const ORDER: readonly Layer[] = ['app', 'transport', 'network', 'link'];
const KIND: Record<Layer, Kind> = { app: 'http', transport: 'tcp', network: 'dns', link: 'tls' };
/** What each layer says to its peer on the other side. */
const PEER: Record<Layer, string> = { app: 'HTTP', transport: 'TCP', network: 'IP', link: '' };

/** Lights a stack's layers one after another, top to bottom (or bottom to top). */
async function light(d: D, stack: string, order: readonly Layer[], ms = 420): Promise<void> {
  for (const layer of order) {
    d.glow(row(stack, layer), KIND[layer]);
    await d.wait(ms);
  }
}

/** Down one stack, from its application row to its link row. */
const down = (d: D, stack: string): Point[] => [
  d.pt(row(stack, 'app'), 'l', -4),
  d.pt(row(stack, 'link'), 'l', -4),
];

const lesson: LessonModule<LayersState> = {
  initial: INITIAL,
  worlds: [layers],
  scenes: [
    {
      id: 'problem',
      view: 'four',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Todo lo que hay que hacer', en: 'Everything that must happen' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        const jobs: Text[] = [
          { es: 'Encontrar el ordenador de destino', en: 'Find the destination computer' },
          { es: 'Cruzar muchas redes distintas', en: 'Cross many different networks' },
          {
            es: 'Trocear los datos y que lleguen todos, en orden',
            en: 'Chop up the data and get all of it there, in order',
          },
          { es: 'Entregarlos al programa correcto', en: 'Hand it to the right program' },
          {
            es: 'Convertirlo en señales: wifi, cable o fibra',
            en: 'Turn it into signals: Wi-Fi, cable or fiber',
          },
        ];
        for (const [i, job] of jobs.entries()) {
          await d.caption(job, { n: String(i + 1), kind: 'muted' });
        }
        await d.fly(
          route(d, row('mine', 'link'), row('theirs', 'link')),
          { es: 'datos', en: 'data' },
          'muted',
          {
            arrive: 'theirs',
          },
        );
        await d.caption({
          es: 'La solución: repartirlo en capas',
          en: 'The solution: split it into layers',
        });
        await Promise.all([light(d, 'mine', ORDER), light(d, 'theirs', ORDER)]);
        await d.caption({
          es: 'Cada capa resuelve una sola parte y usa la de abajo',
          en: 'Each layer solves one part and uses the one below',
        });
      },
    },
    {
      id: 'analogy',
      view: 'letter',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Una carta por correo', en: 'A letter by mail' },
      start: () => ({}),
      end: () => ({ sealed: 2 }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Escribes la carta: el contenido es cosa tuya',
          en: 'You write the letter: the content is up to you',
        });
        d.set({ sealed: 1 });
        d.glow('#ly-name', 'tcp');
        await d.caption({
          es: 'La metes en un sobre con el nombre de la persona…',
          en: 'You put it in an envelope with the person’s name…',
        });
        d.set({ sealed: 2 });
        d.glow('#ly-address', 'dns');
        await d.caption({ es: '…y su dirección', en: '…and their address' });
        const letter = d.box('letter');
        // Under the envelope and its label: the van must not cover «un sobre».
        const y = letter.y + letter.h + 84;
        await d.prop(
          'van',
          [
            { x: -60, y },
            { x: letter.x + letter.w / 2, y },
          ],
          { dur: 1800 },
        );
        await d.caption({
          es: 'Viaja en camiones o trenes, y no te importa en cuáles',
          en: 'It travels by truck or train, and you don’t care which',
        });
        await d.tag(
          { x: letter.x + letter.w / 2, y: y + 6 },
          { es: 'el enlace', en: 'the link' },
          'tls',
          'below',
        );
        await d.caption({
          es: 'Cada parte hace su trabajo sin mirar el de las demás',
          en: 'Each part does its job without looking at the others’',
        });
      },
    },
    {
      id: 'layers',
      view: 'four',
      kind: 'muted',
      chip: { es: '4 capas', en: '4 layers' },
      title: { es: 'Las cuatro capas de TCP/IP', en: 'The four layers of TCP/IP' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Internet usa cuatro capas: aplicación, transporte, red y enlace',
          en: 'The internet uses four layers: application, transport, network and link',
        });
        await light(d, 'mine', ORDER, 550);
        await d.caption({
          es: 'Cada capa habla con la misma capa del otro lado',
          en: 'Each layer talks to the same layer on the other side',
        });
        for (const layer of ['app', 'transport', 'network'] as const) {
          await d.fly(
            route(d, row('mine', layer), row('theirs', layer)),
            PEER[layer],
            KIND[layer],
            {
              small: true,
              trail: { dashed: true },
            },
          );
        }
        await d.caption({
          es: 'Pero ninguna directamente: el mensaje solo viaja por la de abajo',
          en: 'But none of them directly: the message only travels at the bottom',
        });
        await d.fly(down(d, 'mine'), { es: 'baja', en: 'down' }, 'muted', { small: true });
        await d.fly(
          route(d, row('mine', 'link'), row('theirs', 'link')),
          { es: 'datos', en: 'data' },
          'tls',
          {
            arrive: row('theirs', 'link'),
          },
        );
        await d.fly([...down(d, 'theirs')].reverse(), { es: 'sube', en: 'up' }, 'muted', {
          small: true,
        });
      },
    },
    {
      id: 'wrap',
      view: 'wrapping',
      kind: 'muted',
      chip: { es: 'sobres', en: 'envelopes' },
      title: { es: 'Sobres dentro de sobres', en: 'Envelopes inside envelopes' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        d.glow(row('mine', 'app'), 'http');
        await d.caption({
          es: 'El mensaje HTTP baja por las capas',
          en: 'The HTTP message goes down the layers',
        });
        const steps: [Layer, 1 | 2 | 3, Text][] = [
          [
            'transport',
            1,
            {
              es: 'TCP le pone su cabecera: los puertos y el orden',
              en: 'TCP adds its header: the ports and the order',
            },
          ],
          [
            'network',
            2,
            { es: 'IP, la suya: las direcciones IP', en: 'IP adds its own: the IP addresses' },
          ],
          [
            'link',
            3,
            {
              es: 'Y el enlace, la suya y una cola: las direcciones MAC',
              en: 'And the link adds its own and a trailer: the MAC addresses',
            },
          ],
        ];
        for (const [layer, wrap, text] of steps) {
          d.glow(row('mine', layer), KIND[layer]);
          d.set({ wrap });
          await d.caption(text);
        }
        await d.fly(
          route(d, row('mine', 'link'), row('theirs', 'link')),
          { es: 'trama', en: 'frame' },
          'tls',
          {
            arrive: row('theirs', 'link'),
          },
        );
        await d.caption({
          es: 'Al otro lado, cada capa quita su sobre y entrega lo de dentro',
          en: 'On the other side, each layer takes off its envelope and hands over what’s inside',
        });
        for (const [layer, wrap] of [
          ['link', 2],
          ['network', 1],
          ['transport', 0],
        ] as const) {
          d.glow(row('theirs', layer), KIND[layer]);
          d.set({ wrap });
          await d.wait(900);
        }
        d.glow(row('theirs', 'app'), 'http');
        await d.caption({
          es: 'El mensaje llega igual que salió',
          en: 'The message arrives just as it left',
        });
      },
    },
    {
      id: 'hops',
      view: 'hops',
      kind: 'muted',
      chip: { es: 'saltos', en: 'hops' },
      title: { es: 'El viaje, salto a salto', en: 'The journey, hop by hop' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Entre tu portátil y el servidor hay varios routers',
          en: 'There are several routers between your laptop and the server',
        });
        const legs: [string, string, Text][] = [
          ['mine', 'gateway', { es: 'trama · wifi', en: 'frame · Wi-Fi' }],
          ['gateway', 'isp', { es: 'trama · fibra', en: 'frame · fiber' }],
          ['isp', 'theirs', { es: 'trama · cable', en: 'frame · cable' }],
        ];
        for (const [i, [from, to, label]] of legs.entries()) {
          await d.fly(route(d, row(from, 'link'), row(to, 'link')), label, 'tls', {
            arrive: row(to, 'link'),
          });
          if (to !== 'theirs') {
            d.glow(row(to, 'network'), 'dns');
            if (i === 0) {
              await d.caption({
                es: 'Cada router quita el sobre de enlace y lee la IP de destino…',
                en: 'Each router takes off the link envelope and reads the destination IP…',
              });
              await d.caption({
                es: '…y lo envuelve en uno nuevo para el siguiente tramo',
                en: '…and wraps it in a new one for the next stretch',
              });
            } else await d.wait(700);
          }
        }
        await light(d, 'theirs', ['link', 'network', 'transport', 'app']);
        await d.caption({
          es: 'Transporte y aplicación solo existen en los dos extremos',
          en: 'Transport and application only exist at the two ends',
        });
      },
    },
    {
      id: 'osi',
      view: 'osi',
      kind: 'muted',
      chip: { es: 'OSI', en: 'OSI' },
      title: { es: 'El modelo OSI, como referencia', en: 'The OSI model, as a reference' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'OSI tiene siete capas; TCP/IP, cuatro',
          en: 'OSI has seven layers; TCP/IP, four',
        });
        const groups: [number[], Layer, Text][] = [
          [
            [7, 6, 5],
            'app',
            { es: 'La 7, la 6 y la 5 son la aplicación', en: 'Layers 7, 6 and 5 are application' },
          ],
          [[4], 'transport', { es: 'La 4 es el transporte', en: 'Layer 4 is transport' }],
          [[3], 'network', { es: 'La 3, la red', en: 'Layer 3, network' }],
          [[2, 1], 'link', { es: 'Y la 2 y la 1, el enlace', en: 'And layers 2 and 1, link' }],
        ];
        for (const [osi, layer, text] of groups) {
          for (const n of osi) d.glow(`#ly-osi-${n}`, KIND[layer]);
          d.glow(`#ly-tcpip-${layer}`, KIND[layer]);
          await d.caption(text);
        }
        await d.caption({
          es: '«Capa 7» es HTTP; «capa 4», TCP',
          en: '“Layer 7” is HTTP; “layer 4” is TCP',
        });
      },
    },
    {
      id: 'try',
      view: 'curl',
      kind: 'muted',
      chip: { es: 'curl', en: 'curl' },
      title: { es: 'Las capas en la salida de curl', en: 'The layers in curl’s output' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'curl -v cuenta lo que hace en cada paso',
          en: 'curl -v tells you what it does at each step',
        });
        d.glow('#ly-l-dns', 'http');
        d.glow(row('mine', 'app'), 'http');
        await d.caption({
          es: 'Primero, otro protocolo de aplicación: DNS',
          en: 'First, another application protocol: DNS',
        });
        d.glow('#ly-l-try', 'dns');
        d.glow(row('mine', 'network'), 'dns');
        d.glow(row('mine', 'transport'), 'tcp');
        await d.caption({
          es: 'La IP de destino es la red; el puerto 80, el transporte',
          en: 'The destination IP is network; port 80, transport',
        });
        d.glow('#ly-l-conn', 'tcp');
        d.glow(row('mine', 'transport'), 'tcp');
        await d.caption({ es: 'La conexión TCP, abierta', en: 'The TCP connection, open' });
        d.glow('#ly-l-http', 'http');
        d.glow(row('mine', 'app'), 'http');
        await d.caption({
          es: 'Las líneas con > y <: HTTP, la aplicación',
          en: 'The lines with > and <: HTTP, the application',
        });
        d.glow(row('mine', 'link'), 'tls');
        await d.caption({
          es: 'El enlace no sale: lo llevan tu sistema y tu tarjeta de red',
          en: 'The link doesn’t show: your system and your network card handle it',
        });
      },
    },
  ],
};

export default lesson;
