import { describe, expect, it } from 'vitest';
import {
  run,
  scenarioIds,
  scenarios,
  type FailureDetail,
  type Header,
  type RequestSettings,
  type ServerSettings,
  type Settings,
  type Step,
  type StepKey,
} from './cors';
import { strings } from './strings';

// Calculated by hand from the Fetch standard and from what Chromium did with a real server on
// 2026-10-13 (chrome-messages.test.ts keeps its messages).

const names = strings.es.names;

const request: RequestSettings = {
  method: 'GET',
  body: 'none',
  authorization: false,
  credentials: 'same-origin',
  destination: 'api',
};
const server: ServerSettings = {
  answersOptions: true,
  allowOrigin: 'page',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowCredentials: true,
};
const go = (req: Partial<RequestSettings> = {}, srv: Partial<ServerSettings> = {}) =>
  run({ request: { ...request, ...req }, server: { ...server, ...srv } }, names);

const keys = (steps: Step[]) => steps.map((step) => step.key);
const find = <K extends StepKey>(steps: Step[], key: K) =>
  steps.find((step): step is Extract<Step, { key: K }> => step.key === key);
const headersOf = (
  steps: Step[],
  key: 'preflight-sent' | 'preflight-answered' | 'request-sent' | 'response-answered',
) => Object.fromEntries((find(steps, key)?.headers ?? []) as Header[]);

describe('same origin', () => {
  it.each(['same-origin', 'include'] as const)(
    'with credentials %s: no preflight, the cookie travels and the page reads it',
    (credentials) => {
      const { steps, outcome, url } = go(
        {
          destination: 'same',
          credentials,
          method: 'PUT',
          body: 'application/json',
          authorization: true,
        },
        { allowOrigin: 'absent', answersOptions: false },
      );
      expect(url).toBe('https://tienda.example/api/pedidos');
      expect(keys(steps)).toEqual([
        'page-calls-fetch',
        'same-origin',
        'request-sent',
        'server-acts',
        'response-answered',
        'page-reads',
      ]);
      expect(headersOf(steps, 'request-sent').Cookie).toBe('sesion=a1b2c3');
      expect(outcome).toEqual({ reached: true, cookie: true, readable: true, failure: null });
    },
  );

  it('a GET carries no Origin; a PUT does', () => {
    expect(headersOf(go({ destination: 'same' }).steps, 'request-sent').Origin).toBeUndefined();
    expect(headersOf(go({ destination: 'same', method: 'PUT' }).steps, 'request-sent').Origin).toBe(
      'https://tienda.example',
    );
  });
});

describe('simple requests', () => {
  it.each([
    { method: 'GET', body: 'none' },
    { method: 'POST', body: 'text/plain' },
    { method: 'POST', body: 'application/x-www-form-urlencoded' },
  ] as const)('$method with $body: no preflight, straight to the server', (req) => {
    const { steps } = go(req);
    expect(keys(steps).slice(0, 3)).toEqual(['page-calls-fetch', 'simple-request', 'request-sent']);
    expect(headersOf(steps, 'request-sent').Origin).toBe('https://tienda.example');
  });

  it('a GET carries no body even if the control says so', () => {
    const { steps } = go({ body: 'application/json' });
    expect(keys(steps)).toContain('simple-request');
    expect(headersOf(steps, 'request-sent')['Content-Type']).toBeUndefined();
  });

  it.each([
    ['page', true],
    ['*', true],
    ['absent', false],
    ['other', false],
  ] as const)('readable with Access-Control-Allow-Origin %s: %s', (allowOrigin, readable) => {
    const { outcome } = go({}, { allowOrigin });
    expect(outcome.reached).toBe(true);
    expect(outcome.readable).toBe(readable);
  });
});

describe('what triggers a preflight', () => {
  it.each([
    [{ method: 'PUT' }, ['method'], 'PUT', undefined],
    [{ method: 'DELETE' }, ['method'], 'DELETE', undefined],
    [{ method: 'POST', body: 'application/json' }, ['content-type'], 'POST', 'content-type'],
    [{ authorization: true }, ['authorization'], 'GET', 'authorization'],
    [
      { method: 'PUT', body: 'application/json', authorization: true },
      ['method', 'content-type', 'authorization'],
      'PUT',
      'authorization,content-type',
    ],
  ] as const)('%o asks first, with the right headers', (req, reasons, method, requestHeaders) => {
    const { steps } = go(req);
    expect(find(steps, 'needs-preflight')?.reasons).toEqual(reasons);
    const sent = headersOf(steps, 'preflight-sent');
    expect(sent).toEqual({
      Origin: 'https://tienda.example',
      'Access-Control-Request-Method': method,
      ...(requestHeaders ? { 'Access-Control-Request-Headers': requestHeaders } : {}),
    });
  });

  it('the preflight never carries the cookie, even with include', () => {
    const { steps } = go({ method: 'PUT', credentials: 'include' });
    expect(headersOf(steps, 'preflight-sent').Cookie).toBeUndefined();
    expect(headersOf(steps, 'request-sent').Cookie).toBe('sesion=a1b2c3');
  });
});

describe('a failed preflight: the real request is never sent', () => {
  const failed = (req: Partial<RequestSettings>, srv: Partial<ServerSettings>) => {
    const { steps, outcome } = go(req, srv);
    expect(keys(steps)).not.toContain('request-sent');
    expect(keys(steps)).not.toContain('server-acts');
    expect(keys(steps).slice(-2)).toEqual(['preflight-fails', 'page-gets-error']);
    expect(outcome).toMatchObject({ reached: false, cookie: false, readable: false });
    return outcome.failure;
  };

  it.each<[string, Partial<RequestSettings>, Partial<ServerSettings>, Partial<FailureDetail>]>([
    ['a 405', { method: 'PUT' }, { answersOptions: false }, { failure: 'status' }],
    ['no Allow-Origin', { method: 'PUT' }, { allowOrigin: 'absent' }, { failure: 'origin-absent' }],
    [
      'another origin',
      { method: 'PUT' },
      { allowOrigin: 'other' },
      { failure: 'origin-mismatch', value: 'https://otra.example' },
    ],
    [
      'the method',
      { method: 'PUT' },
      { allowMethods: ['GET', 'POST'] },
      { failure: 'method', method: 'PUT' },
    ],
    [
      'Content-Type',
      { method: 'POST', body: 'application/json' },
      { allowHeaders: [] },
      { failure: 'header', header: 'content-type' },
    ],
    [
      'Authorization',
      { authorization: true },
      { allowHeaders: ['Content-Type'] },
      { failure: 'header', header: 'authorization' },
    ],
  ])('%s', (_name, req, srv, expected) => {
    expect(failed(req, srv)).toMatchObject({ ...expected, preflight: true });
  });

  // Chrome's order: the CORS check first, then the status, then the method, then the headers.
  it('a 405 without Allow-Origin fails for the origin, not for the status', () => {
    expect(
      failed({ method: 'PUT' }, { answersOptions: false, allowOrigin: 'absent' })?.failure,
    ).toBe('origin-absent');
  });

  it('a 405 fails for the status before the method', () => {
    expect(failed({ method: 'PUT' }, { answersOptions: false, allowMethods: [] })?.failure).toBe(
      'status',
    );
  });

  it('the method before the headers, and Content-Type before Authorization', () => {
    expect(
      failed(
        { method: 'PUT', body: 'application/json', authorization: true },
        { allowMethods: [], allowHeaders: [] },
      )?.failure,
    ).toBe('method');
    expect(
      failed(
        { method: 'POST', body: 'application/json', authorization: true },
        { allowHeaders: [] },
      )?.header,
    ).toBe('content-type');
  });

  it('POST does not need to be in Allow-Methods: it is a simple method', () => {
    const { outcome } = go({ method: 'POST', body: 'application/json' }, { allowMethods: ['GET'] });
    expect(outcome.readable).toBe(true);
  });
});

describe('headers per response', () => {
  it('Allow-Methods and Allow-Headers only in the preflight; Allow-Origin and -Credentials in both', () => {
    const { steps } = go({ method: 'PUT', authorization: true, credentials: 'include' });
    expect(headersOf(steps, 'preflight-answered')).toEqual({
      'Access-Control-Allow-Origin': 'https://tienda.example',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    expect(headersOf(steps, 'response-answered')).toEqual({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://tienda.example',
      'Access-Control-Allow-Credentials': 'true',
    });
  });

  it('a 405 carries no lists of methods or headers', () => {
    const { steps } = go({ method: 'PUT' }, { answersOptions: false });
    expect(find(steps, 'preflight-answered')?.status).toBe(405);
    expect(Object.keys(headersOf(steps, 'preflight-answered'))).toEqual([
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials',
    ]);
  });
});

describe('credentials', () => {
  it('`*` with include fails, even with Allow-Credentials: true', () => {
    const { outcome } = go({ credentials: 'include' }, { allowOrigin: '*' });
    expect(outcome).toMatchObject({ reached: true, cookie: true, readable: false });
    expect(outcome.failure?.failure).toBe('origin-wildcard');
  });

  it('the exact origin without Allow-Credentials fails', () => {
    const { outcome } = go({ credentials: 'include' }, { allowCredentials: false });
    expect(outcome.failure?.failure).toBe('credentials');
  });

  it('the exact origin with Allow-Credentials: true passes, and the cookie travels', () => {
    const { outcome } = go({ credentials: 'include' });
    expect(outcome).toEqual({ reached: true, cookie: true, readable: true, failure: null });
  });

  it('a wrong origin is reported before the missing Allow-Credentials', () => {
    const { outcome } = go(
      { credentials: 'include' },
      { allowOrigin: 'other', allowCredentials: false },
    );
    expect(outcome.failure?.failure).toBe('origin-mismatch');
  });

  it('without include, the cookie does not go to another origin', () => {
    const { steps, outcome } = go();
    expect(headersOf(steps, 'request-sent').Cookie).toBeUndefined();
    expect(outcome.cookie).toBe(false);
  });
});

describe('the server acts whatever the check says', () => {
  const all: Settings[] = [];
  for (const allowOrigin of ['absent', '*', 'page', 'other'] as const)
    for (const credentials of ['same-origin', 'include'] as const)
      for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const)
        all.push({
          request: { ...request, method, credentials },
          server: { ...server, allowOrigin, allowCredentials: false },
        });

  it.each(all)('%o', (settings) => {
    const { steps, outcome } = run(settings, names);
    const sent = keys(steps).indexOf('request-sent');
    if (sent === -1) {
      expect(outcome.reached).toBe(false);
      return;
    }
    expect(keys(steps)[sent + 1]).toBe('server-acts');
    expect(outcome.reached).toBe(true);
  });
});

describe('the scenarios of the lesson', () => {
  const expected = {
    'usual-error': { reached: true, cookie: false, readable: false, failure: 'origin-absent' },
    'server-allows': { reached: true, cookie: false, readable: true, failure: undefined },
    'post-json': { reached: false, cookie: false, readable: false, failure: 'status' },
    'preflight-approved': { reached: true, cookie: false, readable: true, failure: undefined },
    'cookies-wildcard': {
      reached: true,
      cookie: true,
      readable: false,
      failure: 'origin-wildcard',
    },
    'same-origin': { reached: true, cookie: true, readable: true, failure: undefined },
  } as const;

  it('there are six', () => {
    expect(scenarioIds).toHaveLength(6);
  });

  describe.each(['es', 'en'] as const)('with the %s names', (lang) => {
    it.each(scenarioIds)('%s', (id) => {
      const { outcome } = run(scenarios[id], strings[lang].names);
      const { failure, ...answers } = expected[id];
      expect(outcome).toMatchObject(answers);
      expect(outcome.failure?.failure).toBe(failure);
    });
  });

  it('the approved preflight sends the headers of the shop’s nginx', () => {
    const { steps } = run(scenarios['preflight-approved'], names);
    expect(headersOf(steps, 'preflight-answered')).toEqual({
      'Access-Control-Allow-Origin': 'https://tienda.example',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
  });
});
