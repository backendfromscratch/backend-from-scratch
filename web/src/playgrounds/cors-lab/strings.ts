/**
 * Texts of the cors-lab lab in both languages, with the names each language uses: the shop's
 * origins, paths, cookie and token change together, so the same-origin option stays same-origin.
 */
import type { Locale } from '../../lib/locales';
import type {
  Actor,
  AllowOrigin,
  Destination,
  Failure,
  Method,
  Names,
  PreflightReason,
  ScenarioId,
} from './cors';

export interface Strings {
  title: string;
  names: Names;
  /** What the server returns when the page can read it. */
  responseBody: string;
  scenario: string;
  scenarios: Record<ScenarioId, string>;
  /** The selector's value once the reader changes a control. */
  custom: string;
  request: string;
  server: string;
  method: string;
  body: string;
  bodyNone: string;
  /** Next to the body selector when the method carries no body. */
  bodyIgnored: string;
  authorization: string;
  credentials: string;
  destination: string;
  destinations: Record<Destination, string>;
  answersOptions: string;
  answersOptionsValues: { yes: string; no: string };
  allowOrigin: string;
  /** {page} and {other} are the origins of the language. */
  allowOriginValues: Record<AllowOrigin, string>;
  allowMethods: string;
  allowHeaders: string;
  allowCredentials: string;
  actors: Record<Actor, string>;
  sequenceLabel: string;
  /** On the arrow of the real request when the preflight fails. */
  notSent: string;
  /** Short notes on an actor's line. */
  notes: {
    sameOrigin: string;
    simple: string;
    preflight: string;
    serverActs: Record<Method, string>;
    passes: string;
    fails: string;
  };
  statusText: Record<200 | 204 | 405, string>;
  /** Accessible description of a row: {n}, {from}, {to}, {label} and, if any, {headers}. */
  arrowRow: string;
  arrowRowHeaders: string;
  noteRow: string;
  /** Joins the last two items of a list: «A, B y C». */
  and: string;
  /** Between a header and its value, in the accessible descriptions. */
  colon: string;
  narration: {
    pageCallsFetch: string;
    withCookies: string;
    sameOrigin: string;
    simpleRequest: string;
    needsPreflight: string;
    reasons: Record<PreflightReason, string>;
    preflightSent: string;
    preflightAnswered: Record<204 | 405, string>;
    preflightFails: string;
    requestSent: string;
    requestSentWithCookie: string;
    requestSentWithoutCookie: string;
    requestSentSameOrigin: string;
    serverActs: Record<Method, string>;
    beforeAnyCheck: string;
    responseAnswered: string;
    responseWithOrigin: string;
    responseWithoutOrigin: string;
    /** {value}, then {why} (passesAny or passesPage) and {cookies} (passesCredentials or nothing). */
    checkPasses: string;
    passesAny: string;
    passesPage: string;
    passesCredentials: string;
    checkFails: string;
    pageReads: string;
    pageGetsError: string;
  };
  /** Why the browser says no: {value}, {page}, {method} and {header} are filled in. */
  failures: Record<Failure, string>;
  outcome: string;
  questions: { reached: string; cookie: string; readable: string };
  yes: string;
  no: string;
  pending: string;
  console: string;
  next: string;
  all: string;
  reset: string;
}

const es: Strings = {
  title: 'laboratorio · CORS',
  names: {
    page: 'https://tienda.example',
    api: 'https://api.tienda.example',
    apiPath: '/pedidos',
    samePath: '/api/pedidos',
    other: 'https://otra.example',
    cookie: 'sesion=a1b2c3',
    token: 'Bearer token-inventado',
  },
  responseBody: '{"pedidos":[]}',
  scenario: 'Escenario',
  scenarios: {
    'usual-error': 'El error de siempre',
    'server-allows': 'El servidor da permiso',
    'post-json': 'Un POST con JSON',
    'preflight-approved': 'El preflight aprobado',
    'cookies-wildcard': 'Con cookies y *',
    'same-origin': 'Mismo origen',
  },
  custom: 'A tu manera',
  request: 'La petición',
  server: 'El servidor',
  method: 'Método',
  body: 'Cuerpo (Content-Type)',
  bodyNone: 'sin cuerpo',
  bodyIgnored: 'GET y DELETE no llevan cuerpo.',
  authorization: 'Con cabecera Authorization',
  credentials: 'credentials',
  destination: 'Destino',
  destinations: {
    api: 'La API (otro origen)',
    same: 'La propia tienda (mismo origen)',
  },
  answersOptions: 'Responde a OPTIONS',
  answersOptionsValues: { yes: 'Sí, con un 204', no: 'No, con un 405' },
  allowOrigin: 'Access-Control-Allow-Origin',
  allowOriginValues: {
    absent: 'no la envía',
    '*': '* (cualquier origen)',
    page: '{page} (el de la página)',
    other: '{other} (otro)',
  },
  allowMethods: 'Access-Control-Allow-Methods (en el preflight)',
  allowHeaders: 'Access-Control-Allow-Headers (en el preflight)',
  allowCredentials: 'Access-Control-Allow-Credentials: true',
  actors: { page: 'La página', browser: 'El navegador', server: 'El servidor' },
  sequenceLabel: 'Lo que pasa, paso a paso',
  notSent: 'no se envía',
  notes: {
    sameOrigin: 'mismo origen: sin CORS',
    simple: 'petición sencilla',
    preflight: 'hay que preguntar antes',
    serverActs: {
      GET: 'busca los pedidos',
      POST: 'guarda el pedido',
      PUT: 'cambia el pedido',
      DELETE: 'borra el pedido',
    },
    passes: '✓ la página puede leerla',
    fails: '✕ la página no puede leerla',
  },
  statusText: { 200: '200 OK', 204: '204 No Content', 405: '405 Method Not Allowed' },
  arrowRow: '{n}. {from} → {to}: {label}',
  arrowRowHeaders: '{n}. {from} → {to}: {label}, con {headers}',
  noteRow: '{n}. {actor}: {note}',
  and: ' y ',
  colon: ': ',
  narration: {
    pageCallsFetch: 'El código de la página llama a fetch: un {method} a {url}.',
    withCookies: ' Pide que viajen las cookies (credentials: «include»).',
    sameOrigin:
      'La dirección es del mismo origen que la página, {page}. El navegador no aplica CORS: enviará la petición con la cookie y le dará la respuesta a la página sin mirar ninguna cabecera.',
    simpleRequest:
      'Es otro origen, pero la petición es sencilla: un {method} sin cabeceras especiales. El navegador la envía sin preguntar y, cuando llegue la respuesta, decidirá si la página puede leerla.',
    needsPreflight:
      'Es otro origen y la petición no es sencilla: {reasons}. Antes de enviarla, el navegador pregunta al servidor con una petición previa (preflight).',
    reasons: {
      method: 'usa {method}',
      'content-type': 'manda JSON',
      authorization: 'lleva la cabecera Authorization',
    },
    preflightSent:
      'El navegador envía un OPTIONS a {path}: dice de qué origen viene y qué quiere hacer. No lleva cookies ni el cuerpo de la petición.',
    preflightAnswered: {
      204: 'El servidor responde a la petición previa con un 204 y sus cabeceras de permiso.',
      405: 'El servidor no sabe qué hacer con OPTIONS y responde 405 Method Not Allowed.',
    },
    preflightFails:
      '{reason} El navegador cancela la petición real: el servidor nunca llega a ver el {method}.',
    requestSent: 'El navegador envía el {method} a {path} con Origin: {page}',
    requestSentWithCookie: ' y la cookie.',
    requestSentWithoutCookie: ', sin cookie: credentials no es «include».',
    requestSentSameOrigin:
      'El navegador envía el {method} a {path} con la cookie, como a cualquier dirección de su mismo origen.',
    serverActs: {
      GET: 'El servidor recibe la petición y busca los pedidos.',
      POST: 'El servidor recibe el pedido y lo guarda.',
      PUT: 'El servidor recibe los cambios y actualiza el pedido.',
      DELETE: 'El servidor recibe la petición y borra el pedido.',
    },
    beforeAnyCheck: ' Ya está hecho, decida lo que decida después el navegador.',
    responseAnswered: 'Llega la respuesta: un 200 con los datos',
    responseWithOrigin: ' y Access-Control-Allow-Origin: {value}.',
    responseWithoutOrigin: ', sin Access-Control-Allow-Origin.',
    checkPasses:
      'Access-Control-Allow-Origin dice {value}{why}{cookies}: el navegador deja que la página lea la respuesta.',
    passesAny: ', cualquier origen',
    passesPage: ', el origen de la página',
    passesCredentials: ', y Access-Control-Allow-Credentials: true permite las cookies',
    checkFails:
      '{reason} El navegador ya tiene la respuesta, pero no se la da a la página. El {method} sí llegó al servidor.',
    pageReads: 'La página recibe los datos: {body}.',
    pageGetsError:
      'fetch falla con «TypeError: Failed to fetch», sin más detalle. El motivo solo aparece en la consola, y el código de la página no puede leerlo.',
  },
  failures: {
    'origin-absent': 'La respuesta no trae Access-Control-Allow-Origin.',
    'origin-wildcard':
      'La respuesta dice Access-Control-Allow-Origin: *, y con cookies el comodín no vale: el servidor tiene que nombrar el origen.',
    'origin-mismatch':
      'Access-Control-Allow-Origin dice {value}, que no es el origen de la página, {page}.',
    credentials:
      'Con cookies, el servidor también tiene que decir Access-Control-Allow-Credentials: true, y no lo dice.',
    status: 'La respuesta a la petición previa no es un 2xx, así que vale como un no.',
    method: 'Access-Control-Allow-Methods no incluye {method}.',
    header: 'Access-Control-Allow-Headers no incluye {header}.',
  },
  outcome: 'El resultado',
  questions: {
    reached: '¿Llegó al servidor?',
    cookie: '¿Con la cookie?',
    readable: '¿Puede leerla la página?',
  },
  yes: 'Sí',
  no: 'No',
  pending: 'Aún no se sabe',
  console: 'Consola de Chrome',
  next: 'Siguiente paso',
  all: 'Ver todo',
  reset: 'Reiniciar',
};

const en: typeof es = {
  title: 'lab · CORS',
  names: {
    page: 'https://shop.example',
    api: 'https://api.shop.example',
    apiPath: '/orders',
    samePath: '/api/orders',
    other: 'https://other.example',
    cookie: 'session=a1b2c3',
    token: 'Bearer made-up-token',
  },
  responseBody: '{"orders":[]}',
  scenario: 'Scenario',
  scenarios: {
    'usual-error': 'The usual error',
    'server-allows': 'The server allows it',
    'post-json': 'A POST with JSON',
    'preflight-approved': 'The preflight approved',
    'cookies-wildcard': 'With cookies and *',
    'same-origin': 'Same origin',
  },
  custom: 'Your own',
  request: 'The request',
  server: 'The server',
  method: 'Method',
  body: 'Body (Content-Type)',
  bodyNone: 'no body',
  bodyIgnored: 'GET and DELETE carry no body.',
  authorization: 'With an Authorization header',
  credentials: 'credentials',
  destination: 'Destination',
  destinations: {
    api: 'The API (another origin)',
    same: 'The shop itself (same origin)',
  },
  answersOptions: 'Answers OPTIONS',
  answersOptionsValues: { yes: 'Yes, with a 204', no: 'No, with a 405' },
  allowOrigin: 'Access-Control-Allow-Origin',
  allowOriginValues: {
    absent: 'not sent',
    '*': '* (any origin)',
    page: '{page} (the page’s)',
    other: '{other} (another)',
  },
  allowMethods: 'Access-Control-Allow-Methods (in the preflight)',
  allowHeaders: 'Access-Control-Allow-Headers (in the preflight)',
  allowCredentials: 'Access-Control-Allow-Credentials: true',
  actors: { page: 'The page', browser: 'The browser', server: 'The server' },
  sequenceLabel: 'What happens, step by step',
  notSent: 'not sent',
  notes: {
    sameOrigin: 'same origin: no CORS',
    simple: 'a simple request',
    preflight: 'it has to ask first',
    serverActs: {
      GET: 'looks up the orders',
      POST: 'saves the order',
      PUT: 'changes the order',
      DELETE: 'deletes the order',
    },
    passes: '✓ the page can read it',
    fails: '✕ the page can’t read it',
  },
  statusText: { 200: '200 OK', 204: '204 No Content', 405: '405 Method Not Allowed' },
  arrowRow: '{n}. {from} → {to}: {label}',
  arrowRowHeaders: '{n}. {from} → {to}: {label}, with {headers}',
  noteRow: '{n}. {actor}: {note}',
  and: ' and ',
  colon: ': ',
  narration: {
    pageCallsFetch: 'The page’s code calls fetch: a {method} to {url}.',
    withCookies: ' It asks for the cookies to go along (credentials: “include”).',
    sameOrigin:
      'The address is on the same origin as the page, {page}. The browser doesn’t apply CORS: it will send the request with the cookie and hand the response to the page without looking at any header.',
    simpleRequest:
      'It’s another origin, but the request is simple: a {method} with no special headers. The browser sends it without asking and, when the response arrives, it will decide whether the page can read it.',
    needsPreflight:
      'It’s another origin and the request isn’t simple: {reasons}. Before sending it, the browser asks the server with a preliminary request (a preflight).',
    reasons: {
      method: 'it uses {method}',
      'content-type': 'it sends JSON',
      authorization: 'it carries the Authorization header',
    },
    preflightSent:
      'The browser sends an OPTIONS to {path}: it says which origin it comes from and what it wants to do. It carries no cookies and no body.',
    preflightAnswered: {
      204: 'The server answers the preflight with a 204 and its permission headers.',
      405: 'The server doesn’t know what to do with OPTIONS and answers 405 Method Not Allowed.',
    },
    preflightFails:
      '{reason} The browser cancels the real request: the server never sees the {method}.',
    requestSent: 'The browser sends the {method} to {path} with Origin: {page}',
    requestSentWithCookie: ' and the cookie.',
    requestSentWithoutCookie: ', without the cookie: credentials isn’t “include”.',
    requestSentSameOrigin:
      'The browser sends the {method} to {path} with the cookie, as it would to any address on its own origin.',
    serverActs: {
      GET: 'The server receives the request and looks up the orders.',
      POST: 'The server receives the order and saves it.',
      PUT: 'The server receives the changes and updates the order.',
      DELETE: 'The server receives the request and deletes the order.',
    },
    beforeAnyCheck: ' It’s done, whatever the browser decides next.',
    responseAnswered: 'The response arrives: a 200 with the data',
    responseWithOrigin: ' and Access-Control-Allow-Origin: {value}.',
    responseWithoutOrigin: ', without Access-Control-Allow-Origin.',
    checkPasses:
      'Access-Control-Allow-Origin says {value}{why}{cookies}: the browser lets the page read the response.',
    passesAny: ', any origin',
    passesPage: ', the page’s origin',
    passesCredentials: ', and Access-Control-Allow-Credentials: true allows the cookies',
    checkFails:
      '{reason} The browser already has the response, but it doesn’t hand it to the page. The {method} did reach the server.',
    pageReads: 'The page gets the data: {body}.',
    pageGetsError:
      'fetch fails with “TypeError: Failed to fetch”, and nothing more. The reason only appears in the console, and the page’s code can’t read it.',
  },
  failures: {
    'origin-absent': 'The response has no Access-Control-Allow-Origin.',
    'origin-wildcard':
      'The response says Access-Control-Allow-Origin: *, and with cookies the wildcard isn’t enough: the server has to name the origin.',
    'origin-mismatch':
      'Access-Control-Allow-Origin says {value}, which isn’t the page’s origin, {page}.',
    credentials:
      'With cookies, the server also has to say Access-Control-Allow-Credentials: true, and it doesn’t.',
    status: 'The answer to the preflight isn’t a 2xx, so it counts as a no.',
    method: 'Access-Control-Allow-Methods doesn’t include {method}.',
    header: 'Access-Control-Allow-Headers doesn’t include {header}.',
  },
  outcome: 'The outcome',
  questions: {
    reached: 'Did it reach the server?',
    cookie: 'With the cookie?',
    readable: 'Can the page read it?',
  },
  yes: 'Yes',
  no: 'No',
  pending: 'Not known yet',
  console: 'Chrome’s console',
  next: 'Next step',
  all: 'Show all',
  reset: 'Reset',
};

export const strings: Record<Locale, Strings> = { es, en };
