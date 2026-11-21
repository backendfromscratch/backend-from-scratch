/**
 * The scenes of «Qué es un protocolo» / "What is a protocol" (translationKey protocols), one per part
 * of the text, in the order of its <Scene id="…" /> cues: rules nobody agreed on in person, a phone
 * call, what a protocol decides, an HTTP message line by line, the written rules, many protocols, and
 * the lesson's three `nc example.com 80` runs.
 */
import type { Director } from '../core/director';
import type { LessonModule, Text } from '../core/types';
import { INITIAL, protocol, route, type ProtocolState } from '../worlds/protocol/protocol';
import { strings as words, type Run } from '../worlds/protocol/strings';
import { callRoute, town } from '../worlds/town/town';

type D = Director<ProtocolState>;

/** A terminal run as a reader sees it: the command, then what comes back. */
async function runInTerminal(d: D, run: Run, typed: boolean): Promise<void> {
  const t = words[d.lang];
  d.q('#pr-out').textContent = '';
  if (typed) {
    d.q('#pr-cmd').textContent = '';
    await d.type('#pr-cmd', t.cmd[run]);
  } else {
    d.q('#pr-cmd').textContent = t.cmd[run];
    d.glow('#pr-cmd', 'http');
  }
}

const anatomy: Text = {
  es: '<div class="scene-card"><span><b>GET / HTTP/1.1</b> · línea de petición</span><span><b>Host: example.com</b> · cabecera</span><span><b>Connection: close</b> · cabecera</span><span class="scene-card__dim">(línea vacía) · fin de las cabeceras</span></div>',
  en: '<div class="scene-card"><span><b>GET / HTTP/1.1</b> · request line</span><span><b>Host: example.com</b> · header</span><span><b>Connection: close</b> · header</span><span class="scene-card__dim">(empty line) · end of the headers</span></div>',
};
const meanings: Text = {
  es: '<div class="scene-card"><span><b>GET</b> · «dame»</span><span><b>200</b> · «aquí lo tienes»</span><span><b>404</b> · «eso no existe»</span></div>',
  en: '<div class="scene-card"><span><b>GET</b> · “give me”</span><span><b>200</b> · “here it is”</span><span><b>404</b> · “that doesn’t exist”</span></div>',
};

const lesson: LessonModule<ProtocolState> = {
  initial: INITIAL,
  worlds: [protocol, town],
  scenes: [
    {
      id: 'problem',
      view: 'agree',
      kind: 'muted',
      chip: { es: 'problema', en: 'problem' },
      title: { es: 'Reglas que nadie pactó', en: 'Rules nobody agreed on' },
      start: () => ({}),
      end: () => ({ run: 'reply', hello: true }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'A Chrome lo ha programado gente de Google',
          en: 'Chrome was programmed by people at Google',
        });
        await d.caption({
          es: 'Tú escribiste cuatro líneas en una terminal',
          en: 'You typed four lines in a terminal',
        });
        d.q('#pr-cmd').textContent = words[d.lang].cmd.reply;
        await d.type('#pr-out', words[d.lang].out.reply);
        d.set({ run: 'reply' });
        await d.fly(route(d, 'console', 'chrome'), 'HTTP/1.1 200 OK', 'http', { arrive: 'chrome' });
        d.set({ hello: true });
        await d.caption({
          es: 'Nunca os habíais puesto de acuerdo, y Chrome te entendió',
          en: 'You had never agreed on anything, and Chrome understood you',
        });
        d.glow('rfc', 'tls');
        await Promise.all([
          d.fly(route(d, 'rfc', 'console'), { es: 'reglas', en: 'rules' }, 'tls', { small: true }),
          d.fly(route(d, 'rfc', 'chrome'), { es: 'reglas', en: 'rules' }, 'tls', { small: true }),
        ]);
        await d.caption({
          es: 'Los dos seguíais las mismas reglas, escritas en un documento público',
          en: 'Both of you followed the same rules, written in a public document',
        });
        await d.caption({
          es: 'Esas reglas compartidas se llaman protocolo',
          en: 'Those shared rules are called a protocol',
        });
      },
    },
    {
      id: 'analogy',
      view: 'call',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Una llamada de teléfono', en: 'A phone call' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.fly(callRoute(d), '', 'tcp', { trail: { dashed: true } });
        await d.say('sc-shop', { es: '¿Diga?', en: 'Hello?' }, { hold: 900 });
        await d.caption({
          es: 'Quien descuelga dice «¿Diga?»',
          en: 'Whoever picks up says “Hello?”',
        });
        await d.say(
          'sc-you',
          { es: 'Hola, llamo por un pedido', en: 'Hi, I’m calling about an order' },
          { hold: 1200 },
        );
        await d.caption({
          es: 'Quien llama se presenta y explica para qué llama',
          en: 'The caller says who they are and why they’re calling',
        });
        await d.say('sc-shop', { es: 'Perdona, sigue tú', en: 'Sorry, go ahead' }, { hold: 1100 });
        await d.caption({ es: 'Se habla por turnos', en: 'You take turns' });
        await d.say('sc-you', { es: '¿Me oyes?', en: 'Can you hear me?' }, { hold: 900 });
        await d.say('sc-shop', { es: 'Sí, te oigo', en: 'Yes, I can hear you' }, { hold: 900 });
        await d.say('sc-you', { es: 'Adiós', en: 'Bye' }, { hold: 700 });
        await d.say('sc-shop', { es: 'Adiós', en: 'Bye' }, { hold: 700 });
        await d.caption({
          es: 'Un protocolo es lo mismo para dos programas: un guion que conocen antes de empezar',
          en: 'A protocol is the same for two programs: a script both know before they start',
        });
      },
    },
    {
      id: 'decides',
      view: 'decide',
      kind: 'http',
      chip: { es: 'decide', en: 'decides' },
      title: { es: 'Lo que decide un protocolo', en: 'What a protocol decides' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption(
          {
            es: 'Formato: cómo se escribe cada mensaje, letra a letra',
            en: 'Format: how each message is written, letter by letter',
          },
          { n: '1', kind: 'http' },
        );
        await d.fly(route(d, 'chrome', 'site'), 'GET / HTTP/1.1\\r\\n', 'http', {
          arrive: 'site',
          trail: {},
        });
        await d.caption(
          {
            es: 'Orden: el cliente pide y el servidor responde',
            en: 'Order: the client asks and the server answers',
          },
          { n: '2', kind: 'http' },
        );
        await d.fly(route(d, 'site', 'chrome'), 'HTTP/1.1 200 OK', 'http', {
          arrive: 'chrome',
          trail: { dashed: true },
        });
        await d.caption(
          {
            es: 'Significado: qué quiere decir cada cosa',
            en: 'Meaning: what each thing stands for',
          },
          { n: '3', kind: 'http' },
        );
        await d.note(d.pt('site', 'b'), meanings, { where: 'below', look: 'card', gap: 12 });
        await d.caption(
          { es: 'Y qué hacer cuando algo falla', en: 'And what to do when something goes wrong' },
          { n: '4', kind: 'http' },
        );
        await d.fly(
          route(d, 'chrome', 'site'),
          { es: 'HOLA SERVIDOR', en: 'HELLO SERVER' },
          'muted',
          { arrive: 'site' },
        );
        await d.fly(route(d, 'site', 'chrome'), 'HTTP/1.1 400 Bad Request', 'muted', {
          arrive: 'chrome',
        });
        await d.caption({
          es: 'El servidor no adivina: responde con un error que lo dice',
          en: 'The server doesn’t guess: it answers with an error that says so',
        });
      },
    },
    {
      id: 'anatomy',
      view: 'anatomy',
      kind: 'http',
      chip: { es: 'anatomía', en: 'anatomy' },
      title: { es: 'Un mensaje HTTP, línea a línea', en: 'An HTTP message, line by line' },
      start: () => ({}),
      end: () => ({ run: 'bad' }),
      async play(d) {
        await d.wait(400);
        await d.note(d.pt('console', 'b'), anatomy, { where: 'below', look: 'card', gap: 12 });
        await d.caption({
          es: 'La petición: su primera línea y sus cabeceras, y una línea vacía',
          en: 'The request: its first line and its headers, then an empty line',
        });
        await runInTerminal(d, 'ok', false);
        await d.fly(route(d, 'console', 'site'), 'GET / · Host', 'http', {
          arrive: 'site',
          trail: {},
        });
        await d.fly(route(d, 'site', 'console'), 'HTTP/1.1 200 OK', 'http', { arrive: 'console' });
        d.set({ run: 'ok' });
        await d.caption({
          es: 'La respuesta tiene la misma forma: línea de estado, cabeceras y contenido',
          en: 'The response has the same shape: status line, headers and content',
        });
        await runInTerminal(d, 'bad', false);
        await d.fly(
          route(d, 'console', 'site'),
          { es: 'GET / · sin Host', en: 'GET / · no Host' },
          'muted',
          {
            arrive: 'site',
          },
        );
        await d.fly(route(d, 'site', 'console'), 'HTTP/1.1 400 Bad Request', 'muted', {
          arrive: 'console',
        });
        d.set({ run: 'bad' });
        await d.caption({
          es: 'Sin Host, el mensaje no cumple las reglas: 400',
          en: 'Without Host, the message breaks the rules: 400',
        });
      },
    },
    {
      id: 'written',
      view: 'written',
      kind: 'tls',
      chip: { es: 'RFC', en: 'RFC' },
      title: { es: 'Las reglas están escritas', en: 'The rules are written down' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        d.glow('rfc', 'tls');
        await d.caption({
          es: 'Las reglas de HTTP se publican en documentos llamados RFC',
          en: 'HTTP’s rules are published in documents called RFCs',
        });
        for (const name of ['chrome', 'curl', 'nginx', 'nc']) {
          await d.fly([d.pt(`#pr-impl-${name}`, 't'), d.pt('rfc', 'b')], '✓', 'tls', {
            small: true,
          });
        }
        await d.caption({
          es: 'Chrome, curl, nginx o tu nc son implementaciones: programas que las cumplen',
          en: 'Chrome, curl, nginx or your nc are implementations: programs that follow them',
        });
        await d.caption({
          es: 'Por eso se entienden, aunque estén escritos en lenguajes distintos',
          en: 'That’s why they understand each other, even if written in different languages',
        });
      },
    },
    {
      id: 'many',
      view: 'many',
      kind: 'muted',
      chip: { es: 'muchos', en: 'many' },
      title: { es: 'Hay muchos protocolos', en: 'There are many protocols' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'HTTP es solo uno de muchos protocolos',
          en: 'HTTP is just one of many protocols',
        });
        for (const [id, kind] of [
          ['http', 'http'],
          ['dns', 'dns'],
          ['tcp', 'tcp'],
          ['tls', 'tls'],
          ['ssh', 'muted'],
          ['smtp', 'muted'],
        ] as const) {
          d.glow(`#pr-p-${id}`, kind);
          await d.wait(450);
        }
        const right = d.box('stack').x + d.box('stack').w;
        await d.note({ x: right, y: d.pt('#pr-p-http').y }, 'GET / HTTP/1.1', {
          where: 'right',
          look: 'tag',
          kind: 'http',
          gap: 10,
        });
        await d.caption({
          es: 'Algunos, como HTTP/1.1, son de texto: los puedes escribir con el teclado',
          en: 'Some, like HTTP/1.1, are text: you can type them on the keyboard',
        });
        await d.note({ x: right, y: d.pt('#pr-p-tcp').y }, '01000101 00000000…', {
          where: 'right',
          look: 'tag',
          kind: 'tcp',
          gap: 10,
        });
        await d.caption({
          es: 'Otros, como TCP o DNS, son binarios: números pensados para máquinas',
          en: 'Others, like TCP or DNS, are binary: numbers meant for machines',
        });
      },
    },
    {
      id: 'try',
      view: 'anatomy',
      kind: 'http',
      chip: { es: 'nc', en: 'nc' },
      title: { es: 'Habla HTTP a mano', en: 'Speak HTTP by hand' },
      start: () => ({}),
      end: () => ({ run: 'missing' }),
      async play(d) {
        await d.wait(400);
        await d.caption(
          { es: 'Habla HTTP a mano con example.com', en: 'Speak HTTP by hand with example.com' },
          { n: '1', kind: 'http' },
        );
        await runInTerminal(d, 'ok', true);
        await d.fly(route(d, 'console', 'site'), 'GET /', 'http', { arrive: 'site', trail: {} });
        await d.fly(route(d, 'site', 'console'), '200 OK', 'http', { arrive: 'console' });
        d.set({ run: 'ok' });
        await d.caption(
          { es: 'Rompe las reglas: sin Host', en: 'Break the rules: no Host' },
          { n: '2', kind: 'http' },
        );
        await runInTerminal(d, 'bad', false);
        await d.fly(route(d, 'console', 'site'), 'GET /', 'muted', { arrive: 'site' });
        await d.fly(route(d, 'site', 'console'), '400 Bad Request', 'muted', { arrive: 'console' });
        d.set({ run: 'bad' });
        await d.caption(
          { es: 'Pide algo que no existe', en: 'Ask for something that doesn’t exist' },
          { n: '3', kind: 'http' },
        );
        await runInTerminal(d, 'missing', false);
        await d.fly(
          route(d, 'console', 'site'),
          { es: 'GET /no-existe', en: 'GET /does-not-exist' },
          'http',
          {
            arrive: 'site',
          },
        );
        await d.fly(route(d, 'site', 'console'), '404 Not Found', 'http', { arrive: 'console' });
        d.set({ run: 'missing' });
        await d.caption({
          es: '«Mal hecha» es un 400; «bien hecha, pero no existe», un 404',
          en: '“Badly formed” is a 400; “well formed, but it doesn’t exist” is a 404',
        });
      },
    },
  ],
};

export default lesson;
