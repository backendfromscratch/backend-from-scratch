import { describe, expect, it } from 'vitest';
import { chromeMessage } from './chrome-messages';
import { run, type RequestSettings, type ServerSettings } from './cors';
import { strings } from './strings';

// The lines Chromium 153 printed on 2026-10-13, word for word: a page on http://tienda.example
// calling fetch to http://api.tienda.example/pedidos, with a local server answering each case.
// Each case runs the lab with the same settings and compares its message with Chromium's.

const names = {
  ...strings.es.names,
  page: 'http://tienda.example',
  api: 'http://api.tienda.example',
};
const url = 'http://api.tienda.example/pedidos';
const head = `Access to fetch at '${url}' from origin 'http://tienda.example' has been blocked by CORS policy: `;
const preflight = "Response to preflight request doesn't pass access control check: ";

const get: RequestSettings = {
  method: 'GET',
  body: 'none',
  authorization: false,
  credentials: 'same-origin',
  destination: 'api',
};
const none: ServerSettings = {
  answersOptions: true,
  allowOrigin: 'absent',
  allowMethods: [],
  allowHeaders: [],
  allowCredentials: false,
};

const captured: [string, Partial<RequestSettings>, Partial<ServerSettings>, string][] = [
  [
    'no Allow-Origin',
    {},
    {},
    "No 'Access-Control-Allow-Origin' header is present on the requested resource.",
  ],
  [
    'another origin',
    {},
    { allowOrigin: 'other' },
    "The 'Access-Control-Allow-Origin' header has a value 'https://otra.example' that is not equal to the supplied origin. Have the server send the header with a valid value.",
  ],
  [
    'include and *',
    { credentials: 'include' },
    { allowOrigin: '*' },
    "The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.",
  ],
  [
    'include without Allow-Credentials',
    { credentials: 'include' },
    { allowOrigin: 'page' },
    "The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.",
  ],
  [
    'a 405 to the preflight',
    { method: 'PUT' },
    { answersOptions: false, allowOrigin: 'page' },
    `${preflight}It does not have HTTP ok status.`,
  ],
  [
    'a 405 without Allow-Origin',
    { method: 'PUT' },
    { answersOptions: false },
    `${preflight}No 'Access-Control-Allow-Origin' header is present on the requested resource.`,
  ],
  [
    'a preflight with another origin',
    { method: 'DELETE' },
    { allowOrigin: 'other', allowMethods: ['DELETE'] },
    `${preflight}The 'Access-Control-Allow-Origin' header has a value 'https://otra.example' that is not equal to the supplied origin. Have the server send the header with a valid value.`,
  ],
  [
    'a preflight with include and *',
    { method: 'PUT', credentials: 'include' },
    { allowOrigin: '*', allowMethods: ['PUT'] },
    `${preflight}The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.`,
  ],
  [
    'a preflight with include, without Allow-Credentials',
    { method: 'PUT', credentials: 'include' },
    { allowOrigin: 'page', allowMethods: ['PUT'] },
    `${preflight}The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.`,
  ],
  [
    'PUT not in Allow-Methods',
    { method: 'PUT' },
    { allowOrigin: 'page', allowMethods: ['GET', 'POST'] },
    'Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.',
  ],
  [
    'Content-Type not in Allow-Headers',
    { method: 'POST', body: 'application/json' },
    { allowOrigin: 'page', allowMethods: ['GET', 'POST'] },
    'Request header field content-type is not allowed by Access-Control-Allow-Headers in preflight response.',
  ],
  [
    'Content-Type and Authorization, neither allowed',
    { method: 'POST', body: 'application/json', authorization: true },
    { allowOrigin: 'page' },
    'Request header field content-type is not allowed by Access-Control-Allow-Headers in preflight response.',
  ],
  [
    'Authorization not in Allow-Headers',
    { method: 'POST', body: 'application/json', authorization: true },
    { allowOrigin: 'page', allowHeaders: ['Content-Type'] },
    'Request header field authorization is not allowed by Access-Control-Allow-Headers in preflight response.',
  ],
  [
    'PUT, JSON and Authorization, nothing allowed',
    { method: 'PUT', body: 'application/json', authorization: true },
    { allowOrigin: 'page' },
    'Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.',
  ],
];

describe('Chrome’s messages', () => {
  it.each(captured)('%s', (_name, request, server, line) => {
    const { outcome } = run(
      { request: { ...get, ...request }, server: { ...none, ...server } },
      names,
    );
    expect(outcome.failure).not.toBeNull();
    expect(chromeMessage(outcome.failure!, url, names.page)).toBe(head + line);
  });
});
