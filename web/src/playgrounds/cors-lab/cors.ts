/**
 * The CORS lab's logic: what the browser does with a `fetch`, step by step, from the page's
 * JavaScript to the server and back. It follows the CORS parts of the Fetch standard, simplified
 * (no preflight cache, redirects or exposed headers), and the order in which Chrome checks things,
 * captured from Chromium when the lab was built (chrome-messages.test.ts).
 *
 * No React and no texts: the steps carry keys and data, and strings.ts turns them into sentences.
 * Spec: docs/specs/2026-10-12-cors-lab-design.md
 */

export const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;
export type Method = (typeof methods)[number];

export const bodyTypes = [
  'none',
  'text/plain',
  'application/x-www-form-urlencoded',
  'application/json',
] as const;
export type BodyType = (typeof bodyTypes)[number];

export const credentialsModes = ['same-origin', 'include'] as const;
export type Credentials = (typeof credentialsModes)[number];
export type Destination = 'api' | 'same';
export type AllowOrigin = 'absent' | '*' | 'page' | 'other';

export const allowableHeaders = ['Content-Type', 'Authorization'] as const;
type AllowableHeader = (typeof allowableHeaders)[number];

/** What the page's `fetch` asks for. */
export interface RequestSettings {
  method: Method;
  /** Ignored with GET and DELETE, which carry no body. */
  body: BodyType;
  authorization: boolean;
  credentials: Credentials;
  destination: Destination;
}

/** What the API answers, the same to every origin. */
export interface ServerSettings {
  /** True: `OPTIONS` gets a 204. False: a 405, like a server that does not know the method. */
  answersOptions: boolean;
  allowOrigin: AllowOrigin;
  allowMethods: Method[];
  allowHeaders: AllowableHeader[];
  allowCredentials: boolean;
}

export interface Settings {
  request: RequestSettings;
  server: ServerSettings;
}

/** The names of one language: the lab compares the origins it receives, never fixed ones. */
export interface Names {
  /** The page's origin, which is also the same-origin destination: `https://tienda.example`. */
  page: string;
  /** The API's origin: `https://api.tienda.example`. */
  api: string;
  apiPath: string;
  /** The path of the API on the shop's own origin: `/api/pedidos`. */
  samePath: string;
  /** The wrong origin a server can name in `Access-Control-Allow-Origin`. */
  other: string;
  /** The `Cookie` header the browser sends: `sesion=…`. */
  cookie: string;
  /** The `Authorization` header's value, invented. */
  token: string;
}

export type Actor = 'page' | 'browser' | 'server';
export type Header = readonly [name: string, value: string];

/** Why the browser does not hand the response to the page, in the order Chrome checks. */
export type Failure =
  | 'origin-absent'
  | 'origin-wildcard'
  | 'origin-mismatch'
  | 'credentials'
  | 'status'
  | 'method'
  | 'header';

/** What makes a request not simple, so that the browser asks first. */
export type PreflightReason = 'method' | 'content-type' | 'authorization';

interface Arrow {
  from: Actor;
  to: Actor;
}

/** One row of the diagram: an arrow between two actors, or a note on one actor's line. */
export type Step =
  | (Arrow & {
      key: 'page-calls-fetch';
      method: Method;
      url: string;
      credentials: Credentials;
      body: BodyType;
      authorization: boolean;
    })
  | { key: 'same-origin'; at: 'browser' }
  | { key: 'simple-request'; at: 'browser'; method: Method }
  | { key: 'needs-preflight'; at: 'browser'; reasons: PreflightReason[]; method: Method }
  | (Arrow & { key: 'preflight-sent'; path: string; headers: Header[] })
  | (Arrow & { key: 'preflight-answered'; status: 204 | 405; headers: Header[] })
  | (Arrow & { key: 'preflight-fails'; method: Method; path: string; failure: FailureDetail })
  | (Arrow & {
      key: 'request-sent';
      method: Method;
      path: string;
      headers: Header[];
      cookie: boolean;
      sameOrigin: boolean;
    })
  | { key: 'server-acts'; at: 'server'; method: Method; crossOrigin: boolean }
  | (Arrow & { key: 'response-answered'; status: 200; headers: Header[] })
  | { key: 'check-passes'; at: 'browser'; allowOrigin: string; credentials: Credentials }
  | { key: 'check-fails'; at: 'browser'; failure: FailureDetail }
  | (Arrow & { key: 'page-reads' })
  | (Arrow & { key: 'page-gets-error'; failure: FailureDetail });

export type StepKey = Step['key'];

/** A failure with what its message names: the method, the header or the value received. */
export interface FailureDetail {
  failure: Failure;
  /** True if the preflight failed: the real request was never sent. */
  preflight: boolean;
  method: Method;
  /** The header that was not allowed, in lowercase as Chrome names it. */
  header?: string;
  /** The `Access-Control-Allow-Origin` that did not match. */
  value?: string;
}

/** The three questions the lab always answers, and the failure if there was one. */
interface Outcome {
  reached: boolean;
  cookie: boolean;
  readable: boolean;
  failure: FailureDetail | null;
}

export interface Run {
  url: string;
  steps: Step[];
  outcome: Outcome;
}

/** The methods a simple request may use: the browser never asks about them. */
const safelistedMethods: readonly string[] = ['GET', 'HEAD', 'POST'];
/** The `Content-Type` values a simple request may carry (multipart/form-data is not in the lab). */
const safelistedBodies: readonly BodyType[] = ['text/plain', 'application/x-www-form-urlencoded'];

/** GET and DELETE carry no body in the lab: the control is ignored with them. */
export function bodyOf(request: RequestSettings): BodyType {
  return request.method === 'POST' || request.method === 'PUT' ? request.body : 'none';
}

/** Why a request to another origin needs a preflight; empty if it is simple. */
function preflightReasons(request: RequestSettings): PreflightReason[] {
  const reasons: PreflightReason[] = [];
  if (!safelistedMethods.includes(request.method)) reasons.push('method');
  const body = bodyOf(request);
  if (body !== 'none' && !safelistedBodies.includes(body)) reasons.push('content-type');
  if (request.authorization) reasons.push('authorization');
  return reasons;
}

/** The value the server puts in `Access-Control-Allow-Origin`, or undefined if it sends none. */
function allowOriginValue(server: ServerSettings, names: Names): string | undefined {
  switch (server.allowOrigin) {
    case 'absent':
      return undefined;
    case '*':
      return '*';
    case 'page':
      return names.page;
    case 'other':
      return names.other;
  }
}

/** The headers that go in every response, the preflight's and the real one's. */
function corsHeaders(server: ServerSettings, names: Names): Header[] {
  const headers: Header[] = [];
  const allowOrigin = allowOriginValue(server, names);
  if (allowOrigin) headers.push(['Access-Control-Allow-Origin', allowOrigin]);
  if (server.allowCredentials) headers.push(['Access-Control-Allow-Credentials', 'true']);
  return headers;
}

/** The CORS check of a response: whether its headers let this page read it. */
function corsCheck(
  server: ServerSettings,
  names: Names,
  credentials: Credentials,
): Pick<FailureDetail, 'failure' | 'value'> | null {
  const allowOrigin = allowOriginValue(server, names);
  if (allowOrigin === undefined) return { failure: 'origin-absent' };
  if (allowOrigin === '*') {
    return credentials === 'include' ? { failure: 'origin-wildcard' } : null;
  }
  if (allowOrigin !== names.page) return { failure: 'origin-mismatch', value: allowOrigin };
  if (credentials === 'include' && !server.allowCredentials) return { failure: 'credentials' };
  return null;
}

/** The headers of the request itself, as the browser sends them. */
function requestHeaders(
  request: RequestSettings,
  names: Names,
  origin: boolean,
  cookie: boolean,
): Header[] {
  const headers: Header[] = [];
  if (origin) headers.push(['Origin', names.page]);
  if (cookie) headers.push(['Cookie', names.cookie]);
  const body = bodyOf(request);
  if (body !== 'none') headers.push(['Content-Type', body]);
  if (request.authorization) headers.push(['Authorization', names.token]);
  return headers;
}

/** The whole conversation for these settings, and its outcome. */
export function run(settings: Settings, names: Names): Run {
  const { request, server } = settings;
  const same = request.destination === 'same';
  const path = same ? names.samePath : names.apiPath;
  const url = `${same ? names.page : names.api}${path}`;
  const { method, credentials } = request;
  const steps: Step[] = [
    {
      key: 'page-calls-fetch',
      from: 'page',
      to: 'browser',
      method,
      url,
      credentials,
      body: bodyOf(request),
      authorization: request.authorization,
    },
  ];
  const sent = (cookie: boolean, origin: boolean): Step => ({
    key: 'request-sent',
    from: 'browser',
    to: 'server',
    method,
    path,
    headers: requestHeaders(request, names, origin, cookie),
    cookie,
    sameOrigin: same,
  });
  const answered: Step = {
    key: 'response-answered',
    from: 'server',
    to: 'browser',
    status: 200,
    headers: [['Content-Type', 'application/json'], ...corsHeaders(server, names)],
  };

  // Same origin: no CORS at all. The cookie travels with both credentials values, and the browser
  // only adds Origin to methods that can change something.
  if (same) {
    steps.push(
      { key: 'same-origin', at: 'browser' },
      sent(true, method !== 'GET'),
      { key: 'server-acts', at: 'server', method, crossOrigin: false },
      answered,
      { key: 'page-reads', from: 'browser', to: 'page' },
    );
    return { url, steps, outcome: { reached: true, cookie: true, readable: true, failure: null } };
  }

  const reasons = preflightReasons(request);
  if (reasons.length === 0) {
    steps.push({ key: 'simple-request', at: 'browser', method });
  } else {
    steps.push({ key: 'needs-preflight', at: 'browser', reasons, method });
    const unsafeHeaders = [
      ...(request.authorization ? ['authorization'] : []),
      ...(reasons.includes('content-type') ? ['content-type'] : []),
    ];
    steps.push({
      key: 'preflight-sent',
      from: 'browser',
      to: 'server',
      path,
      headers: [
        ['Origin', names.page],
        ['Access-Control-Request-Method', method],
        ...(unsafeHeaders.length > 0
          ? [['Access-Control-Request-Headers', unsafeHeaders.join(',')] as const]
          : []),
      ],
    });
    const status = server.answersOptions ? 204 : 405;
    const allowLists: Header[] = [];
    if (server.answersOptions && server.allowMethods.length > 0) {
      const listed = methods.filter((m) => server.allowMethods.includes(m));
      allowLists.push(['Access-Control-Allow-Methods', listed.join(', ')]);
    }
    if (server.answersOptions && server.allowHeaders.length > 0) {
      const listed = allowableHeaders.filter((h) => server.allowHeaders.includes(h));
      allowLists.push(['Access-Control-Allow-Headers', listed.join(', ')]);
    }
    steps.push({
      key: 'preflight-answered',
      from: 'server',
      to: 'browser',
      status,
      headers: [...corsHeaders(server, names), ...allowLists],
    });

    // Chrome's order: the CORS check, then the status, then the method, then the headers
    // (Content-Type before Authorization).
    const allowed = (header: AllowableHeader) =>
      server.answersOptions && server.allowHeaders.includes(header);
    const check = corsCheck(server, names, credentials);
    let failure: FailureDetail | null = null;
    if (check) failure = { ...check, preflight: true, method };
    else if (status !== 204) failure = { failure: 'status', preflight: true, method };
    else if (reasons.includes('method') && !server.allowMethods.includes(method)) {
      failure = { failure: 'method', preflight: true, method };
    } else if (reasons.includes('content-type') && !allowed('Content-Type')) {
      failure = { failure: 'header', preflight: true, method, header: 'content-type' };
    } else if (request.authorization && !allowed('Authorization')) {
      failure = { failure: 'header', preflight: true, method, header: 'authorization' };
    }
    if (failure) {
      steps.push(
        { key: 'preflight-fails', from: 'browser', to: 'server', method, path, failure },
        { key: 'page-gets-error', from: 'browser', to: 'page', failure },
      );
      return { url, steps, outcome: { reached: false, cookie: false, readable: false, failure } };
    }
  }

  // The real request always reaches the server, which acts on it before any check.
  const cookie = credentials === 'include';
  steps.push(
    sent(cookie, true),
    { key: 'server-acts', at: 'server', method, crossOrigin: true },
    answered,
  );
  const check = corsCheck(server, names, credentials);
  if (check) {
    const failure: FailureDetail = { ...check, preflight: false, method };
    steps.push(
      { key: 'check-fails', at: 'browser', failure },
      { key: 'page-gets-error', from: 'browser', to: 'page', failure },
    );
    return { url, steps, outcome: { reached: true, cookie, readable: false, failure } };
  }
  steps.push(
    {
      key: 'check-passes',
      at: 'browser',
      allowOrigin: allowOriginValue(server, names)!,
      credentials,
    },
    { key: 'page-reads', from: 'browser', to: 'page' },
  );
  return { url, steps, outcome: { reached: true, cookie, readable: true, failure: null } };
}

export const scenarioIds = [
  'usual-error',
  'server-allows',
  'post-json',
  'preflight-approved',
  'cookies-wildcard',
  'same-origin',
] as const;
export type ScenarioId = (typeof scenarioIds)[number];

const simpleGet: RequestSettings = {
  method: 'GET',
  body: 'none',
  authorization: false,
  credentials: 'same-origin',
  destination: 'api',
};
const postJson: RequestSettings = { ...simpleGet, method: 'POST', body: 'application/json' };
const silentServer: ServerSettings = {
  answersOptions: false,
  allowOrigin: 'absent',
  allowMethods: [],
  allowHeaders: [],
  allowCredentials: false,
};

/** The ready-made settings the lesson names (spec §2.2). */
export const scenarios: Record<ScenarioId, Settings> = {
  'usual-error': { request: simpleGet, server: silentServer },
  'server-allows': { request: simpleGet, server: { ...silentServer, allowOrigin: 'page' } },
  // The server allows the page, but does not answer OPTIONS: the preflight gets a 405.
  'post-json': { request: postJson, server: { ...silentServer, allowOrigin: 'page' } },
  // The headers of the shop's nginx in the practice configuration (location /api/).
  'preflight-approved': {
    request: postJson,
    server: {
      answersOptions: true,
      allowOrigin: 'page',
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Content-Type'],
      allowCredentials: false,
    },
  },
  // Even with Access-Control-Allow-Credentials: true, `*` is not enough with cookies.
  'cookies-wildcard': {
    request: { ...simpleGet, credentials: 'include' },
    server: { ...silentServer, allowOrigin: '*', allowCredentials: true },
  },
  'same-origin': { request: { ...simpleGet, destination: 'same' }, server: silentServer },
};
