/**
 * The scenes of «Qué es el backend» / "What is the backend" (translationKey what-is-backend), one
 * per part of the text, in the order of its <Scene id="…" /> cues. They say what the text says: the
 * concert ticket of «El problema» and the seven steps of the purchase, the restaurant of the analogy,
 * the weather data of the text's diagram and each language's own `curl` run.
 */
import type { Director } from '../core/director';
import type { LessonModule, Point, Text } from '../core/types';
import { INITIAL, above, apps, route, type AppsState } from '../worlds/apps/apps';
import { strings as appsStrings } from '../worlds/apps/strings';
import { restaurant, supplierRoute } from '../worlds/restaurant/restaurant';

type D = Director<AppsState>;

/** A packet from one actor's head (or a point) to another's: the restaurant's people. */
const between = (d: D, from: string, to: string): Point[] => {
  const a = d.box(from);
  const b = d.box(to);
  const right = b.x > a.x;
  return [d.pt(from, right ? 'r' : 'l'), d.pt(to, right ? 'l' : 'r')];
};
const json: Text = {
  es: '<div class="scene-card"><b>JSON</b><span>"temperature_2m": 17.4</span><span>"weather_code": 0</span></div>',
  en: '<div class="scene-card"><b>JSON</b><span>"temperature_2m": 17.4</span><span>"weather_code": 0</span></div>',
};

const lesson: LessonModule<AppsState> = {
  initial: INITIAL,
  worlds: [apps, restaurant],
  scenes: [
    {
      id: 'problem',
      view: 'tickets',
      kind: 'muted',
      chip: { es: 'entradas', en: 'tickets' },
      title: { es: 'Lo que ves y lo que no', en: 'What you see and what you don’t' },
      start: () => ({}),
      end: () => ({ seat: 'mine', db: 'sold', checks: 2 }),
      async play(d) {
        await d.wait(400);
        await d.caption({
          es: 'Tu móvil enseña los asientos libres, en verde',
          en: 'Your phone shows the free seats, in green',
        });
        await d.caption({
          es: 'Miles de personas los miran a la vez, cada una en su móvil',
          en: 'Thousands of people look at them at once, each on their own phone',
        });
        const ask = { es: '¿libres?', en: 'free?' };
        await Promise.all([
          d.fly(route(d, 'phone', 'backend'), ask, 'muted', { small: true }),
          d.fly(route(d, 'crowd', 'backend'), ask, 'muted', { small: true, arrive: 'backend' }),
        ]);
        await d.fly(route(d, 'backend', 'db'), ask, 'muted', { small: true, arrive: 'db' });
        const list = { es: 'la lista', en: 'the list' };
        await d.fly(route(d, 'db', 'backend'), list, 'muted', { small: true });
        await Promise.all([
          d.fly(route(d, 'backend', 'phone'), list, 'muted', { small: true, arrive: 'phone' }),
          d.fly(route(d, 'backend', 'crowd'), list, 'muted', { small: true, arrive: 'crowd' }),
        ]);
        await d.caption({
          es: 'La lista es la misma para todos: la guarda el backend',
          en: 'The list is the same for everyone: the backend keeps it',
        });
        d.set({ seat: 'picked' });
        await d.fly(route(d, 'phone', 'backend'), { es: 'comprar 14F', en: 'buy 14F' }, 'http', {
          arrive: 'backend',
        });
        d.set({ checks: 2 });
        await d.fly(route(d, 'backend', 'db'), { es: '14F: vendido', en: '14F: sold' }, 'http', {
          arrive: 'db',
        });
        d.set({ db: 'sold' });
        await d.fly(route(d, 'backend', 'phone'), { es: 'es tuyo', en: 'it’s yours' }, 'http', {
          arrive: 'phone',
        });
        d.set({ seat: 'mine' });
        await d.caption({
          es: 'El 14F se vende una sola vez: los demás ya lo ven ocupado',
          en: 'Seat 14F is sold only once: everyone else now sees it taken',
        });
        await Promise.all([
          d.tag(d.pt('phone', 't'), 'frontend', 'muted', 'above'),
          d.tag(d.pt('backend', 't'), 'backend', 'http', 'above'),
        ]);
        await d.caption({
          es: 'Lo que ves es el frontend; lo que no ves, el backend',
          en: 'What you see is the frontend; what you don’t, the backend',
        });
      },
    },
    {
      id: 'analogy',
      view: 'restaurant',
      kind: 'muted',
      chip: { es: 'analogía', en: 'analogy' },
      title: { es: 'Un restaurante', en: 'A restaurant' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(400);
        await d.caption(
          {
            es: 'La sala es lo que ves: el frontend',
            en: 'The dining room is what you see: the frontend',
          },
          { chip: 'frontend', kind: 'muted' },
        );
        await d.caption(
          {
            es: 'La cocina no la ves, pero ahí pasa casi todo: el backend',
            en: 'You don’t see the kitchen, but almost everything happens there: the backend',
          },
          { chip: 'backend', kind: 'http' },
        );
        await d.fly(
          between(d, '#rs-you-head', '#rs-waiter-head'),
          { es: 'tu pedido', en: 'your order' },
          'http',
        );
        await d.caption(
          {
            es: 'El camarero lleva tu pedido a la cocina',
            en: 'The waiter takes your order to the kitchen',
          },
          { chip: { es: 'petición', en: 'request' }, kind: 'http' },
        );
        await d.fly(
          between(d, '#rs-waiter-head', '#rs-cook-head'),
          { es: 'pedido', en: 'order' },
          'http',
        );
        await d.caption(
          {
            es: 'La despensa guarda los ingredientes, como una base de datos',
            en: 'The pantry keeps the ingredients, like a database',
          },
          { chip: { es: 'base de datos', en: 'database' }, kind: 'muted' },
        );
        await d.fly([d.pt('#rs-cook-head', 't'), d.pt('#rs-pantry', 'b', 0, 4)], '?', 'muted', {
          small: true,
        });
        await d.fly([d.pt('#rs-pantry', 'b', 0, 4), d.pt('#rs-cook-head', 't')], '✓', 'muted', {
          small: true,
        });
        await d.caption(
          {
            es: 'Si falta algo, la cocina se lo pide a un proveedor',
            en: 'When something is missing, the kitchen asks a supplier',
          },
          { chip: { es: 'otro servicio', en: 'another service' }, kind: 'muted' },
        );
        await d.prop('van', supplierRoute(d), { dur: 1700 });
        await d.caption(
          { es: 'Y el camarero te trae el plato', en: 'And the waiter brings you the dish' },
          { chip: { es: 'respuesta', en: 'response' }, kind: 'http' },
        );
        await d.fly(
          between(d, '#rs-cook-head', '#rs-waiter-head'),
          { es: 'plato', en: 'dish' },
          'http',
        );
        await d.fly(
          between(d, '#rs-waiter-head', '#rs-you-head'),
          { es: 'plato', en: 'dish' },
          'http',
        );
      },
    },
    {
      id: 'where',
      view: 'where',
      kind: 'http',
      chip: { es: 'dónde', en: 'where' },
      title: { es: 'Dónde se ejecuta cada parte', en: 'Where each part runs' },
      start: () => ({}),
      end: () => ({}),
      async play(d) {
        await d.wait(300);
        await d.tag(
          d.pt('phone', 't'),
          { es: 'en tu dispositivo', en: 'on your device' },
          'muted',
          'above',
        );
        await d.caption({
          es: 'El frontend se ejecuta en tu dispositivo: el navegador o la app',
          en: 'The frontend runs on your device: the browser or the app',
        });
        await d.tag(
          d.pt('backend', 't'),
          { es: 'en otros ordenadores', en: 'on other computers' },
          'http',
          'above',
        );
        await d.caption({
          es: 'El backend, en otros ordenadores, en un centro de datos',
          en: 'The backend runs on other computers, in a data center',
        });
        await d.caption({ es: 'Entre los dos está internet', en: 'Between them is the internet' });
        await d.fly(route(d, 'phone', 'backend'), { es: 'petición', en: 'request' }, 'http', {
          arrive: 'backend',
          trail: {},
        });
        await d.wait(500);
        await d.fly(route(d, 'backend', 'phone'), { es: 'respuesta', en: 'response' }, 'http', {
          arrive: 'phone',
          trail: { dashed: true },
        });
        await d.caption({
          es: 'El frontend pide; el backend hace su trabajo y responde',
          en: 'The frontend asks; the backend does its work and answers',
        });
      },
    },
    {
      id: 'data',
      view: 'weather',
      kind: 'http',
      chip: { es: 'datos', en: 'data' },
      title: { es: 'Viajan datos, no pantallas', en: 'Data travels, not screens' },
      start: () => ({}),
      end: () => ({ painted: true }),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'El backend del tiempo no envía la pantalla con el sol dibujado',
          en: 'The weather backend doesn’t send the screen with the sun drawn on it',
        });
        await d.note(d.pt('weather', 'b'), json, { where: 'below', look: 'card', gap: 10 });
        await d.caption({
          es: 'Envía datos: unos números y unas palabras, en JSON',
          en: 'It sends data: some numbers and some words, in JSON',
        });
        await Promise.all(
          (['web', 'ios', 'android'] as const).map((to) =>
            d.fly(route(d, 'weather', to), 'JSON', 'http', { small: true, arrive: to }),
          ),
        );
        d.set({ painted: true });
        await d.caption({
          es: 'Cada app los pinta a su manera: el 0 es «despejado»',
          en: 'Each app paints them its own way: the 0 means “clear sky”',
        });
        await d.caption({
          es: 'El mismo backend sirve a la web, al iPhone y a Android',
          en: 'The same backend serves the website, the iPhone app and the Android app',
        });
      },
    },
    {
      id: 'purchase',
      view: 'purchase',
      kind: 'http',
      chip: { es: 'compra', en: 'purchase' },
      title: { es: 'Lo que pasa al comprar una entrada', en: 'What happens when you buy a ticket' },
      start: () => ({}),
      end: () => ({ seat: 'mine', db: 'sold', checks: 2 }),
      async play(d) {
        await d.wait(300);
        d.set({ seat: 'picked' });
        await d.caption({
          es: 'Pulsas «Comprar»: tu móvil envía una sola petición',
          en: 'You tap “Buy”: your phone sends a single request',
        });
        await d.fly(
          route(d, 'phone', 'backend'),
          { es: 'quiero el 14F', en: 'I want 14F' },
          'http',
          {
            arrive: 'backend',
            trail: {},
          },
        );
        await d.caption(
          { es: 'Comprueba quién eres', en: 'It checks who you are' },
          { n: '1', kind: 'http' },
        );
        d.set({ checks: 1 });
        d.glow('#ap-check-1', 'tcp');
        await d.wait(500);
        await d.caption(
          {
            es: 'Comprueba que el pedido tiene sentido',
            en: 'It checks that the order makes sense',
          },
          { n: '2', kind: 'http' },
        );
        d.set({ checks: 2 });
        d.glow('#ap-check-2', 'tcp');
        await d.wait(500);
        await d.caption(
          { es: 'Reserva el asiento en la base de datos', en: 'It holds the seat in the database' },
          { n: '3', kind: 'http' },
        );
        await d.fly(
          route(d, 'backend', 'db'),
          { es: '¿14F libre? resérvalo', en: '14F free? hold it' },
          'http',
          {
            arrive: 'db',
            trail: { badge: '3' },
          },
        );
        d.set({ db: 'held' });
        await d.fly(route(d, 'db', 'backend'), { es: 'reservado', en: 'held' }, 'http', {
          small: true,
        });
        await d.caption(
          {
            es: 'Le pide al servicio de pagos que cobre',
            en: 'It asks the payment service to charge',
          },
          { n: '4', kind: 'http' },
        );
        await d.fly(route(d, 'backend', 'pay'), { es: 'cobra 45 €', en: 'charge €45' }, 'http', {
          arrive: 'pay',
          trail: { badge: '4' },
        });
        await d.fly(route(d, 'pay', 'backend'), { es: 'aceptado', en: 'accepted' }, 'http', {
          small: true,
        });
        await d.caption(
          {
            es: 'Guarda la compra, para que mañana siga ahí',
            en: 'It saves the purchase, so it’s still there tomorrow',
          },
          { n: '5', kind: 'http' },
        );
        await d.fly(
          route(d, 'backend', 'db'),
          { es: 'guarda la compra', en: 'save the purchase' },
          'http',
          {
            arrive: 'db',
            trail: { badge: '5' },
          },
        );
        d.set({ db: 'sold' });
        await d.caption(
          {
            es: 'Encarga el correo con tu entrada',
            en: 'It hands over the email with your ticket',
          },
          { n: '6', kind: 'http' },
        );
        await d.fly(
          route(d, 'backend', 'mail'),
          { es: 'envía la entrada', en: 'send the ticket' },
          'http',
          {
            arrive: 'mail',
            trail: { badge: '6' },
          },
        );
        await d.caption(
          { es: 'Y responde a tu móvil', en: 'And it answers your phone' },
          { n: '7', kind: 'http' },
        );
        await d.fly(
          route(d, 'backend', 'phone'),
          { es: 'compra hecha', en: 'purchase done' },
          'http',
          {
            arrive: 'phone',
            trail: { badge: '7', dashed: true },
          },
        );
        d.set({ seat: 'mine' });
        await d.caption({
          es: 'Una sola petición, y el backend da siete pasos',
          en: 'A single request, and the backend takes seven steps',
        });
      },
    },
    {
      id: 'trust',
      view: 'trust',
      kind: 'tls',
      chip: { es: 'confianza', en: 'trust' },
      title: { es: 'Nunca te fíes del cliente', en: 'Never trust the client' },
      start: () => ({ checks: 2 }),
      end: () => ({ checks: 2 }),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'El código del frontend llega entero a tu dispositivo',
          en: 'The frontend’s code reaches your device in full',
        });
        await d.wiggle('hammer', d.pt('phone', 't', 0, 18), 1500);
        await d.caption({
          es: 'Quien sepa un poco puede cambiarlo: precio, 0 €',
          en: 'Anyone who knows a little can change it: price, €0',
        });
        await d.fly(route(d, 'phone', 'backend'), { es: '14F · 0 €', en: '14F · €0' }, 'muted', {
          arrive: 'backend',
        });
        await d.note(
          d.pt('backend', 'b'),
          {
            es: 'el precio es 45 € <span class="ko">✗</span>',
            en: 'the price is €45 <span class="ko">✗</span>',
          },
          { where: 'below', gap: 10 },
        );
        await d.fly(route(d, 'backend', 'phone'), { es: 'rechazado', en: 'rejected' }, 'muted', {
          arrive: 'phone',
        });
        await d.caption({
          es: 'El backend vuelve a comprobarlo todo: nunca te fíes del cliente',
          en: 'The backend checks everything again: never trust the client',
        });
        d.glow('#ap-key', 'tls');
        await d.caption({
          es: 'La clave de pagos vive en el backend, donde nadie de fuera la ve',
          en: 'The payments key lives in the backend, where no one outside sees it',
        });
        await d.fly(route(d, 'backend', 'pay'), { es: 'cobra 45 €', en: 'charge €45' }, 'tls', {
          arrive: 'pay',
          icon: 'key',
        });
      },
    },
    {
      id: 'fullstack',
      view: 'stack',
      kind: 'muted',
      chip: { es: 'full stack', en: 'full stack' },
      title: { es: 'Frontend, backend y full stack', en: 'Frontend, backend and full stack' },
      start: () => ({ seat: 'mine', db: 'sold', checks: 2 }),
      end: () => ({ seat: 'mine', db: 'sold', checks: 2 }),
      async play(d) {
        await d.wait(300);
        await d.tag(d.pt('phone', 't'), 'frontend', 'muted', 'above');
        await d.caption({
          es: 'El frontend enseña la información y recoge lo que haces',
          en: 'The frontend shows the information and takes in what you do',
        });
        const back = above(d, ['backend', 'db'], 0);
        await d.tag({ x: (back.left + back.right) / 2, y: back.y }, 'backend', 'http', 'above');
        await d.caption({
          es: 'El backend guarda los datos, aplica las reglas y responde',
          en: 'The backend stores the data, applies the rules and answers',
        });
        // A bracket over both: whoever works on both.
        const all = above(d, ['phone', 'backend', 'db'], 44);
        const bracket = d.svg('path', {
          d: `M${all.left.toFixed(1)} ${(all.y + 9).toFixed(1)} V${all.y.toFixed(1)} H${all.right.toFixed(1)} V${(all.y + 9).toFixed(1)}`,
          class: 'scene-trail',
          'data-kind': 'muted',
        });
        d.stage.trails.append(bracket);
        await d.draw(bracket, 900);
        await d.tag({ x: (all.left + all.right) / 2, y: all.y }, 'full stack', 'muted', 'above');
        await d.caption({
          es: 'Quien trabaja en las dos partes es full stack',
          en: 'Someone who works on both parts is full stack',
        });
      },
    },
    {
      id: 'try',
      view: 'curl',
      kind: 'http',
      chip: { es: 'curl', en: 'curl' },
      title: { es: 'Un backend real, sin frontend', en: 'A real backend, no frontend' },
      start: () => ({}),
      end: () => ({ typed: true, answered: true }),
      async play(d) {
        await d.wait(300);
        await d.caption({
          es: 'Sin ningún frontend en medio: le hablas tú al backend',
          en: 'No frontend in between: you talk to the backend yourself',
        });
        await d.type('#ap-curl', appsStrings[d.lang].curl);
        d.set({ typed: true });
        await d.fly(route(d, 'terminal', 'weather'), 'GET /v1/forecast', 'http', {
          arrive: 'weather',
          trail: {},
        });
        await d.fly(route(d, 'weather', 'terminal'), 'JSON', 'http', {
          arrive: 'terminal',
          trail: { dashed: true },
        });
        await d.show('#ap-json');
        d.set({ answered: true });
        await d.caption({
          es: 'La respuesta, tal cual: JSON, sin nadie que la pinte',
          en: 'The response as it is: JSON, with no one to paint it',
        });
        await d.caption({
          es: 'Pruébalo en tu terminal: tus números serán otros',
          en: 'Try it in your terminal: your numbers will be different',
        });
      },
    },
  ],
};

export default lesson;
