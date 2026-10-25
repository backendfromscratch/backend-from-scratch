// The contract tests (Phase 10, lesson 3): each /v2 route answers what the contract says, the API
// watches its own responses (src/contract-responses.ts) and the published contract doesn't change
// without it being seen (contract.json).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, mock, test } from 'node:test';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { requestId } from 'hono/request-id';
import { MARTA, startProvider } from '../scripts/provider.ts';
import { sign } from '../src/signature.ts';
import { useDb } from './db.ts';
import { ANA, CARMEN, asDelivery, asUser } from './identities.ts';

// The shop reads OIDC_ISSUER when it starts: first the practice provider is started, on a free
// port, and then everything the configuration reads is imported (as in oauth.test.ts).
const provider = await startProvider(0, '127.0.0.1', { ...MARTA });
provider.issuer.url = `http://127.0.0.1:${provider.address().port}`;
after(() => provider.stop());
process.env.OIDC_ISSUER = provider.issuer.url;
const { app } = await import('../src/app.ts');
const { config } = await import('../src/config.ts');
const { log } = await import('../src/log.ts');
const { createValidator, contractDocument, routeTemplate, validateResponses } =
  await import('../src/contract-responses.ts');
const { matchesContract } = await import('./contract.ts');

let ana: Record<string, string>;
let carmen: Record<string, string>;
let delivery: Record<string, string>;
useDb(async () => {
  ana = await asUser(ANA);
  carmen = await asUser(CARMEN);
  delivery = await asDelivery();
});

// #region validator
const mini = {
  openapi: '3.1.0',
  info: { title: 'mini', version: '1' },
  paths: {
    '/things/{id}': {
      get: {
        responses: {
          200: {
            description: 'The thing',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Thing: {
        type: 'object',
        properties: { id: { type: 'integer' }, name: { type: 'string' } },
        required: ['id', 'name'],
      },
    },
  },
};

test('createValidator: a body that fits has no failures', () => {
  const validate = createValidator(mini);
  assert.deepEqual(validate('GET', '/things/{id}', 200, { id: 1, name: 'Mug' }), []);
});

test('createValidator: a field with another name is a failure that says which one is missing', () => {
  const validate = createValidator(mini);
  const failures = validate('get', '/things/{id}', 200, { id: 1, title: 'Mug' });
  assert.equal(failures.length, 1);
  assert.equal(failures[0]!.where, '/name');
  assert.equal(failures[0]!.rule, 'required');
  assert.match(failures[0]!.message, /name/);
  // And a wrong type, where.
  const type = validate('get', '/things/{id}', 200, { id: '1', name: 'Mug' });
  assert.deepEqual(
    type.map((failure) => [failure.where, failure.rule]),
    [['/id', 'type']],
  );
});

test('createValidator: a status or a route the contract does not describe is a failure', () => {
  const validate = createValidator(mini);
  for (const [method, route, status] of [
    ['get', '/things/{id}', 500],
    ['get', '/other', 200],
    ['post', '/things/{id}', 200],
  ] as const) {
    const failures = validate(method, route, status, {});
    assert.equal(failures.length, 1);
    assert.equal(failures[0]!.rule, 'no-response-in-the-contract');
  }
});

test("routeTemplate: from Hono's route (/v2/orders/:id) to the document's (/orders/{id})", () => {
  assert.equal(routeTemplate('/v2/orders/:id/events', '/v2'), '/orders/{id}/events');
  assert.equal(routeTemplate('/v2/products', '/v2'), '/products');
  assert.equal(routeTemplate('/v2/products/:id{[0-9]+}', '/v2'), '/products/{id}');
  assert.equal(routeTemplate('/things/:id', ''), '/things/{id}');
});
// #endregion validator

// #region each-route
const send = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const event = (id: string, orderId: number) =>
  JSON.stringify({ id, type: 'payment.completed', orderId });
const payment = (body: string, signature = sign(body, config.WEBHOOK_SECRET)) =>
  app.request('/v2/webhooks/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body,
  });

// Each case: the method and the route as the document writes them, and a request that gives the
// good response (success) and another that gives an error (error: a Problem Details). They go in
// order: some change the data the following ones use.
type Case = {
  method: string;
  route: string;
  success: () => Response | Promise<Response>;
  error?: () => Response | Promise<Response>;
};
const cases: Case[] = [
  {
    method: 'get',
    route: '/products',
    success: () => send('GET', '/v2/products'),
    error: () => send('GET', '/v2/products?sort=nothing'),
  },
  {
    method: 'get',
    route: '/products/{id}',
    success: () => send('GET', '/v2/products/1'),
    error: () => send('GET', '/v2/products/999'),
  },
  {
    method: 'post',
    route: '/products',
    success: () => send('POST', '/v2/products', ana, { name: 'Sticker', priceCents: 300 }),
    error: () => send('POST', '/v2/products', carmen, { name: 'Sticker', priceCents: 300 }),
  },
  {
    method: 'patch',
    route: '/products/{id}',
    success: () => send('PATCH', '/v2/products/1', ana, { name: 'Blue T-shirt' }),
    error: () => send('PATCH', '/v2/products/999', ana, { name: 'Nothing' }),
  },
  {
    method: 'delete',
    route: '/products/{id}',
    // The sticker the previous case has just created: with no orders, it can be deleted.
    success: () => send('DELETE', '/v2/products/5', ana),
    // The mug has orders: 409.
    error: () => send('DELETE', '/v2/products/2', ana),
  },
  {
    method: 'get',
    route: '/orders',
    success: () => send('GET', '/v2/orders', carmen),
    error: () => send('GET', '/v2/orders'),
  },
  {
    method: 'get',
    route: '/orders/{id}',
    success: () => send('GET', '/v2/orders/1', carmen),
    // Number 2 is Pablo's: for Carmen, it doesn't exist.
    error: () => send('GET', '/v2/orders/2', carmen),
  },
  {
    method: 'post',
    route: '/orders',
    success: () => send('POST', '/v2/orders', carmen, { productId: 1, quantity: 1 }),
    error: () => send('POST', '/v2/orders', carmen, { productId: 1, quantity: 1000 }),
  },
  {
    method: 'patch',
    route: '/orders/{id}',
    success: () => send('PATCH', '/v2/orders/21', carmen, { quantity: 3 }),
    // Number 13 is already paid.
    error: () => send('PATCH', '/v2/orders/13', carmen, { quantity: 3 }),
  },
  {
    method: 'post',
    route: '/orders/{id}/cancellation',
    success: () => send('POST', '/v2/orders/23/cancellation', carmen),
    // Number 1 is already shipped.
    error: () => send('POST', '/v2/orders/1/cancellation', carmen),
  },
  {
    method: 'post',
    route: '/orders/{id}/shipment',
    success: () => send('POST', '/v2/orders/13/shipment', ana),
    // Number 21 is still pending: it can't be shipped.
    error: () => send('POST', '/v2/orders/21/shipment', ana),
  },
  {
    method: 'get',
    route: '/orders/{id}/events',
    // The response never ends: only its status and its type are looked at, and it is closed.
    success: async () => {
      const res = await send('GET', '/v2/orders/25/events', carmen);
      await res.body?.cancel();
      return res;
    },
    error: () => send('GET', '/v2/orders/2/events', carmen),
  },
  {
    method: 'post',
    route: '/webhooks/payments',
    success: () => payment(event('evt_contract', 25)),
    error: () => payment(event('evt_contract_2', 25), 'sha256=bad'),
  },
  {
    method: 'post',
    route: '/accounts',
    success: () =>
      send(
        'POST',
        '/v2/accounts',
        {},
        { email: 'marta@example.org', password: 'correct horse battery staple' },
      ),
    error: () => send('POST', '/v2/accounts', {}, { email: 'not-an-email', password: 'x' }),
  },
  {
    method: 'post',
    route: '/session',
    success: () =>
      send('POST', '/v2/session', {}, { email: 'ana@shop.example', password: 'ana-practice-2026' }),
    error: () => send('POST', '/v2/session', {}, { email: 'ana@shop.example', password: 'wrong' }),
  },
  // This route's contract only describes the 204: it has no error to try.
  { method: 'delete', route: '/session', success: () => send('DELETE', '/v2/session', ana) },
  {
    method: 'get',
    route: '/me',
    success: () => send('GET', '/v2/me', ana),
    error: () => send('GET', '/v2/me'),
  },
  {
    method: 'get',
    route: '/session/provider',
    success: () => send('GET', '/v2/session/provider'),
    // Its 404 (without OIDC_*) needs another configuration: optional-provider.test.ts tests it,
    // which starts the shop in another process, also with VALIDATE_RESPONSES=fail.
  },
  {
    method: 'get',
    route: '/session/provider/callback',
    success: async () => {
      const start = await send('GET', '/v2/session/provider');
      const cookie = start.headers.get('set-cookie')!.split(';')[0]!;
      const fromProvider = await fetch(start.headers.get('location')!, { redirect: 'manual' });
      const comingBack = new URL(fromProvider.headers.get('location')!);
      return send('GET', comingBack.pathname + comingBack.search, { Cookie: cookie });
    },
    // Without the cookie it started with, the callback isn't valid.
    error: () => send('GET', '/v2/session/provider/callback?code=x&state=y'),
  },
  {
    method: 'put',
    route: '/delivery/notification',
    success: () =>
      send('PUT', '/v2/delivery/notification', delivery, { url: 'https://93.184.215.14/notices' }),
    error: () =>
      send('PUT', '/v2/delivery/notification', delivery, { url: 'https://169.254.169.254/' }),
  },
];

test('every /v2 route has its case in this file: a new route without a test does not pass', async () => {
  const { paths } = contractDocument() as unknown as {
    paths: Record<string, Record<string, unknown>>;
  };
  const fromDocument = Object.entries(paths).flatMap(([route, operations]) =>
    Object.keys(operations).map((method) => `${method} ${route}`),
  );
  assert.deepEqual(cases.map((item) => `${item.method} ${item.route}`).sort(), fromDocument.sort());
});

for (const item of cases) {
  test(`${item.method.toUpperCase()} ${item.route}: the good response meets the contract`, async () => {
    await matchesContract(await item.success(), item.method, item.route);
  });
  if (item.error) {
    test(`${item.method.toUpperCase()} ${item.route}: the error is a Problem Details from the contract`, async () => {
      const res = await item.error!();
      assert.ok(res.status >= 400, `an error was expected, and it is a ${res.status}`);
      assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
      await matchesContract(res, item.method, item.route);
    });
  }
}
// #endregion each-route

// #region broken-response
// A separate API, only for this file, with a route that breaks its own contract on purpose: it
// promises {name} and answers {title}, with a value that must not end up in the log.
const SECRET = 'personal-value-that-must-not-reach-the-log';
function brokenApi(mode: 'log' | 'fail') {
  const broken = new OpenAPIHono();
  broken.use(requestId());
  broken.use(
    validateResponses(mode, {
      prefix: '',
      document: () =>
        broken.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'broken', version: '1' } }),
    }),
  );
  const route = createRoute({
    method: 'get',
    path: '/things/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'The thing',
        content: { 'application/json': { schema: z.object({ name: z.string() }) } },
      },
    },
  });
  broken.openapi(route, (c) => c.json({ title: SECRET } as never, 200));
  return broken;
}

test('log: a response outside the contract goes through, with a single warning line without the body', async () => {
  const warning = mock.method(log, 'warn', () => {});
  try {
    const res = await brokenApi('log').request('/things/7', {
      headers: { 'X-Request-Id': 'r-1' },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { title: SECRET });
    assert.equal(warning.mock.callCount(), 1);
    const [data, message] = warning.mock.calls[0]!.arguments as unknown as [
      Record<string, unknown>,
      string,
    ];
    assert.equal(message, 'response outside the contract');
    assert.equal(data.requestId, 'r-1');
    assert.equal(data.method, 'GET');
    assert.equal(data.route, '/things/{id}');
    assert.equal(data.status, 200);
    assert.deepEqual(
      (data.failures as { where: string }[]).map((failure) => failure.where),
      ['/name'],
    );
    // The body can carry personal data: neither the value nor the body goes to the log.
    assert.ok(!JSON.stringify(warning.mock.calls[0]!.arguments).includes(SECRET));
  } finally {
    warning.mock.restore();
  }
});

test('fail: the same response is a 500 Problem Details "The response does not meet the contract"', async () => {
  const res = await brokenApi('fail').request('/things/7');
  assert.equal(res.status, 500);
  assert.match(res.headers.get('content-type')!, /^application\/problem\+json/);
  const problem = await res.json();
  assert.equal(problem.title, 'The response does not meet the contract');
  assert.equal(problem.status, 500);
  assert.ok(!JSON.stringify(problem).includes(SECRET));
});

test('a 500 the route did not expect is not a broken contract: no warning, and it is not replaced', async () => {
  const crashed = new OpenAPIHono();
  crashed.use(requestId());
  const route = createRoute({
    method: 'get',
    path: '/things',
    responses: {
      200: {
        description: 'The things',
        content: { 'application/json': { schema: z.object({ name: z.string() }) } },
      },
    },
  });
  crashed.openapi(route, () => {
    throw new Error('something has crashed');
  });
  // Like app.onError: a 500 in JSON, which the contract doesn't describe.
  crashed.onError((_error, c) => c.json({ title: 'Internal Server Error', status: 500 }, 500));
  for (const mode of ['log', 'fail'] as const) {
    const mounted = new OpenAPIHono();
    mounted.use(requestId());
    mounted.use(
      validateResponses(mode, {
        prefix: '',
        document: () =>
          crashed.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'c', version: '1' } }),
      }),
    );
    mounted.route('/', crashed);
    mounted.onError((_error, c) => c.json({ title: 'Internal Server Error', status: 500 }, 500));
    const warning = mock.method(log, 'warn', () => {});
    const error = mock.method(log, 'error', () => {});
    try {
      const res = await mounted.request('/things');
      assert.equal(res.status, 500);
      assert.equal((await res.json()).title, 'Internal Server Error');
      assert.equal(warning.mock.callCount(), 0, mode);
      assert.equal(error.mock.callCount(), 0, mode);
    } finally {
      warning.mock.restore();
      error.mock.restore();
    }
  }
});

test('fail: the 500 that replaces the response keeps X-Request-Id and carries no Location or Set-Cookie', async () => {
  const broken = brokenApi('fail');
  broken.use(async (c, next) => {
    await next();
    c.res.headers.set('Location', '/things/7');
    c.res.headers.append('Set-Cookie', 'session=abc; HttpOnly');
  });
  const res = await broken.request('/things/7', { headers: { 'X-Request-Id': 'r-2' } });
  assert.equal(res.status, 500);
  assert.equal(res.headers.get('x-request-id'), 'r-2');
  assert.equal(res.headers.get('location'), null);
  assert.equal(res.headers.get('set-cookie'), null);
});
// #endregion broken-response

// #region middleware-responses
// The responses a middleware makes before reaching the route (the CSRF check, which looks at the
// cookie) also go through the validator: it is mounted first of all.
for (const [method, route, path] of [
  ['post', '/accounts', '/v2/accounts'],
  ['post', '/session', '/v2/session'],
  ['delete', '/session', '/v2/session'],
  ['post', '/webhooks/payments', '/v2/webhooks/payments'],
  ['post', '/orders', '/v2/orders'],
] as const) {
  test(`${method.toUpperCase()} ${route} with the cookie and from another site: 403 from the contract`, async () => {
    const res = await app.request(path, {
      method,
      headers: {
        'Content-Type': 'text/plain',
        Cookie: 'session=x',
        Origin: 'https://other.example',
      },
      body: method === 'delete' ? undefined : 'a=b',
    });
    assert.equal(res.status, 403);
    await matchesContract(res, method, route);
  });
}

test('the validator also sees what a middleware answers without reaching the route', async () => {
  // A middleware that cuts with a 403 the contract doesn't describe, mounted behind the validator.
  const api = new OpenAPIHono();
  api.use(requestId());
  api.use(
    validateResponses('fail', {
      prefix: '',
      document: () =>
        api.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'm', version: '1' } }),
    }),
  );
  api.use('*', async (c) => c.json({ title: 'Forbidden', status: 403 }, 403));
  api.openapi(
    createRoute({
      method: 'get',
      path: '/things/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          description: 'The thing',
          content: { 'application/json': { schema: z.object({ name: z.string() }) } },
        },
      },
    }),
    (c) => c.json({ name: 'x' }, 200),
  );
  const res = await api.request('/things/7');
  assert.equal(res.status, 500);
  assert.equal((await res.json()).title, 'The response does not meet the contract');
});
// #endregion middleware-responses

// #region untouched
test("the tests' mode is fail, and responses without a JSON body are not touched", async () => {
  assert.equal(config.VALIDATE_RESPONSES, 'fail');
  const warning = mock.method(log, 'warn', () => {});
  const failure = mock.method(log, 'error', () => {});
  try {
    // 204: no body.
    assert.equal((await send('DELETE', '/v2/session', ana)).status, 204);
    // HEAD: no body.
    const head = await send('HEAD', '/v2/products');
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    // The pages that aren't the API's: HTML, outside /v2.
    const docs = await send('GET', '/docs');
    assert.equal(docs.status, 200);
    assert.match(docs.headers.get('content-type')!, /html/);
    const shop = await send('GET', '/shop');
    assert.equal(shop.status, 200);
    assert.match(shop.headers.get('content-type')!, /html/);
    // The contract's document doesn't validate itself.
    assert.equal((await send('GET', '/v2/openapi.json')).status, 200);
    // A /v2 route that doesn't exist: the usual 404.
    assert.equal((await send('GET', '/v2/does-not-exist')).status, 404);
    assert.equal(warning.mock.callCount(), 0);
    assert.equal(failure.mock.callCount(), 0);
  } finally {
    warning.mock.restore();
    failure.mock.restore();
  }
});

test('SSE with the validator on: the headers and the first event arrive in under a second', async () => {
  // A new session: Ana's was closed by the DELETE /session case. If the validator waited for the
  // response to end, the request would never come back: that's why it goes inside the race.
  const headers = await asUser(ANA);
  const limit = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('the first event takes more than 1 s')), 1000),
  );
  const { res, first } = await Promise.race([
    (async () => {
      const res = await send('GET', '/v2/orders/7/events', headers);
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      return { res, reader, first: await reader.read() };
    })(),
    limit,
  ]).then(async (done) => {
    await done.reader.cancel();
    return done;
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')!, /text\/event-stream/);
  assert.match(first.value!, /^event: status/);
});
// #endregion untouched

// #region snapshot
// contract.json is the published contract, kept in Git: if it changes, the change shows in the
// review's diff. npm run contract writes it again.
test('contract.json is the contract the API publishes now', async () => {
  const stored = JSON.parse(await readFile('contract.json', 'utf8'));
  assert.deepEqual(
    JSON.parse(JSON.stringify(contractDocument())),
    stored,
    'The contract has changed: look at the diff of contract.json and, if the change is the one you want, npm run contract',
  );
});

// The file is, byte for byte, what npm run contract writes (scripts/contract.ts): the same order,
// the same indentation and the final line break. And generating it twice gives the same.
test('contract.json is, byte for byte, what npm run contract writes', async () => {
  const text = `${JSON.stringify(contractDocument(), null, 2)}\n`;
  assert.equal(text, `${JSON.stringify(contractDocument(), null, 2)}\n`);
  assert.equal(
    await readFile('contract.json', 'utf8'),
    text,
    'The contract has changed: look at the diff of contract.json and, if the change is the one you want, npm run contract',
  );
});
// #endregion snapshot
