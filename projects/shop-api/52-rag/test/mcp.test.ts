// The MCP server (Phase 11, lesson 4), src/mcp.ts: the shop really listening on a free port, and
// the MCP SDK's own client (the one agents use) talking to it over HTTP, with a key of each role.
// The last test speaks the protocol by hand, with fetch, like curl in the lesson.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { serve, type ServerType } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { app } from '../src/app.ts';
import { QUERY_BY_MEANING, searchCatalogue } from '../src/assistant/tools/search-products.ts';
import { pool } from '../src/db.ts';
import { useEmbedder } from '../src/embeddings.ts';
import { useDb } from './db.ts';
import { createFakeEmbedder } from './fake-embedder.ts';
import { asDelivery, asKey, asUser, CARMEN } from './identities.ts';

// Since Phase 11 (lesson 5), search_products searches by meaning: with the fake embedder, never
// with the real model. The practice products have no vector (the worker computes them), so here it
// finds by name: the search by meaning, with its vectors, is tested in embeddings.test.ts.
useEmbedder(createFakeEmbedder());

// A key of each role a key can have, and the session of Carmen, a customer.
const who: Record<string, Record<string, string>> = {};
useDb(async () => {
  who.delivery = await asDelivery();
  who.admin = await asKey('admin');
  who.catalogue = await asKey('catalogue');
  who.carmen = await asUser(CARMEN);
});

// The shop, on a free port of 127.0.0.1 (port: 0: the system picks it).
let server: ServerType;
let url: URL;
before(async () => {
  await new Promise<void>((ready) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => ready());
  });
  url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`);
});

// Every connected client, to close them all at the end, before the shop.
const clients: Client[] = [];
after(async () => {
  for (const client of clients) await client.close();
  await new Promise((closed) => server.close(closed));
});

/** An MCP client connected to the shop with those headers: initialize, and ready to use. */
async function connect(headers: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'shop-tests', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
  clients.push(client);
  return client;
}

const names = async (client: Client) => (await client.listTools()).tools.map((tool) => tool.name);

/** The text of a result's only block, and whether it's an error. */
function read(result: unknown): { text: string; error: boolean } {
  const { content, isError } = result as CallToolResult;
  assert.equal(content.length, 1);
  assert.equal(content[0]!.type, 'text');
  return { text: (content[0] as { text: string }).text, error: isError === true };
}

/** The JSON of a result that isn't an error. */
function json(result: unknown) {
  const { text, error } = read(result);
  assert.equal(error, false, text);
  return JSON.parse(text);
}

const statusOf = async (id: number) =>
  (await pool.query('SELECT status FROM orders WHERE id = $1', [id])).rows[0].status;

test('tools/list with the delivery key: all five, with their description and the JSON Schema of their input', async () => {
  const { tools } = await (await connect(who.delivery!)).listTools();
  // search_help, since Phase 11 (lesson 6).
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['search_products', 'get_product', 'search_help', 'orders_to_ship', 'mark_shipped'],
  );
  for (const tool of tools) assert.ok(tool.description!.length > 100);

  // The Zod schema, turned by the SDK into the JSON Schema the agent reads.
  const [search, , , orders, mark] = tools;
  assert.deepEqual(search!.inputSchema.required, ['query']);
  assert.equal(search!.inputSchema.additionalProperties, false);
  assert.deepEqual(search!.inputSchema.properties!.query, {
    type: 'string',
    minLength: 1,
    maxLength: 100,
    // Since Phase 11 (lesson 5), the search by meaning's (SEMANTIC_SEARCH=yes).
    description: QUERY_BY_MEANING,
  });
  // limit has a default and cursor is optional: neither is required. Of the cursor, the agent sees
  // that it's text: what's inside, the shop reads.
  assert.equal(orders!.inputSchema.required, undefined);
  assert.equal((orders!.inputSchema.properties!.cursor as { type: string }).type, 'string');
  assert.equal((orders!.inputSchema.properties!.limit as { default: number }).default, 10);
  // The hints for the client: the ones that read only read; mark_shipped changes something.
  assert.equal(search!.annotations?.readOnlyHint, true);
  assert.equal(mark!.annotations?.readOnlyHint, undefined);
  assert.equal(mark!.annotations?.idempotentHint, true);
});

test('tools/list with other keys: admin, all five (permissions.ts lets it ship); catalogue, only the catalogue ones and the help', async () => {
  assert.deepEqual(await names(await connect(who.admin!)), [
    'search_products',
    'get_product',
    'search_help',
    'orders_to_ship',
    'mark_shipped',
  ]);
  assert.deepEqual(await names(await connect(who.catalogue!)), [
    'search_products',
    'get_product',
    'search_help',
  ]);
});

test("search_products and get_product: the result as JSON, with the shop's functions; what doesn't fit, isError", async () => {
  const client = await connect(who.catalogue!);
  const mugs = json(
    await client.callTool({ name: 'search_products', arguments: { query: 'mug' } }),
  );
  assert.deepEqual(mugs, [
    {
      id: 2,
      name: 'Mug',
      description: 'A 350 ml ceramic mug for the morning coffee or tea; it also makes a nice gift.',
      priceCents: 850,
      stock: 60,
      distance: null,
    },
  ]);
  // The same the assistant gets: the same function.
  assert.deepEqual(mugs, await searchCatalogue('mug'));

  assert.deepEqual(json(await client.callTool({ name: 'get_product', arguments: { id: 2 } })), {
    id: 2,
    name: 'Mug',
    priceCents: 850,
    stock: 60,
    description: 'A 350 ml ceramic mug for the morning coffee or tea; it also makes a nice gift.',
    categories: ['Home', 'Gifts'],
  });
  assert.deepEqual(read(await client.callTool({ name: 'get_product', arguments: { id: 999 } })), {
    text: 'There is no product with that id.',
    error: true,
  });

  // An input that doesn't match the schema never reaches the tool: the SDK says what fails, with
  // the JSON-RPC code for invalid params (-32602).
  for (const input of [{ query: '' }, { query: 'mug', other: 1 }, {}]) {
    const { text, error } = read(
      await client.callTool({ name: 'search_products', arguments: input }),
    );
    assert.equal(error, true);
    assert.match(
      text,
      /^MCP error -32602: Input validation error: Invalid arguments for tool search_products/,
    );
  }
});

test('orders_to_ship: the paid ones, newest first, in pages, like GET /v2/orders?status=paid', async () => {
  const client = await connect(who.delivery!);
  const first = json(await client.callTool({ name: 'orders_to_ship', arguments: { limit: 3 } }));
  assert.deepEqual(
    first.orders.map((order: { id: number }) => order.id),
    [20, 19, 18],
  );
  assert.ok(first.orders.every((order: { status: string }) => order.status === 'paid'));
  assert.equal(typeof first.next, 'string');

  const second = json(
    await client.callTool({ name: 'orders_to_ship', arguments: { limit: 50, cursor: first.next } }),
  );
  assert.deepEqual(
    second.orders.map((order: { id: number }) => order.id),
    [17, 16, 15, 14, 13],
  );
  assert.equal(second.next, null);

  // Without limit, 10; a made-up cursor, isError with the /v2 schema's message.
  const all = json(await client.callTool({ name: 'orders_to_ship', arguments: {} }));
  assert.equal(all.orders.length, 8);
  const { text, error } = read(
    await client.callTool({ name: 'orders_to_ship', arguments: { cursor: 'made-up' } }),
  );
  assert.equal(error, true);
  assert.match(text, /The cursor is not valid/);
});

test("mark_shipped with the delivery key: the order becomes shipped; one that isn't paid, isError with its status", async () => {
  const client = await connect(who.delivery!);
  assert.equal(await statusOf(13), 'paid');
  const shipped = json(await client.callTool({ name: 'mark_shipped', arguments: { id: 13 } }));
  assert.equal(shipped.id, 13);
  assert.equal(shipped.status, 'shipped');
  assert.equal(await statusOf(13), 'shipped');

  // Again, a pending one (21) and one that doesn't exist: nothing changes, and the agent knows why.
  const attempts = [
    [13, 'The order is shipped: only a paid one is shipped.'],
    [21, 'The order is pending: only a paid one is shipped.'],
    [999, 'There is no order with that number.'],
  ] as const;
  for (const [id, text] of attempts) {
    const result = await client.callTool({ name: 'mark_shipped', arguments: { id } });
    assert.deepEqual(read(result), { text, error: true });
  }
  assert.equal(await statusOf(21), 'pending');
});

test('mark_shipped with the catalogue key: isError, and the order stays paid', async () => {
  const client = await connect(who.catalogue!);
  // Even though it isn't in its list, an agent can call it: its server doesn't have it.
  for (const [name, args] of [
    ['mark_shipped', { id: 14 }],
    ['orders_to_ship', {}],
  ] as const) {
    const { text, error } = read(await client.callTool({ name, arguments: args }));
    assert.equal(error, true);
    assert.equal(text, `MCP error -32602: Tool ${name} not found`);
  }
  assert.equal(await statusOf(14), 'paid');
});

test("without a key, with one that doesn't exist or with a customer's session: 401 before MCP, with WWW-Authenticate", async () => {
  const madeUp = { Authorization: 'Bearer shop_made-up' };
  for (const headers of [{}, madeUp, who.carmen!]) {
    // The SDK's client doesn't even get to connect: the initialize already gets the 401.
    await assert.rejects(
      connect(headers),
      (error) => error instanceof StreamableHTTPError && error.code === 401,
    );
    // And the response, seen by hand: a Problem Details, like the rest of the shop's 401s.
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="shop-api"');
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
  }
});

test("GET and DELETE on /mcp: 405 with Allow: POST; and /mcp isn't in v2's contract", async () => {
  for (const method of ['GET', 'DELETE']) {
    const res = await fetch(url, {
      method,
      headers: { ...who.delivery, Accept: 'text/event-stream' },
    });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
  }
  const { paths } = await (await app.request('/v2/openapi.json')).json();
  assert.ok(Object.keys(paths).every((path) => !path.includes('mcp')));
});

test('the protocol by hand, with fetch: initialize, notifications/initialized, tools/list and tools/call, in JSON-RPC', async () => {
  // What any client sends: the key, the body as JSON and an Accept with the two types Streamable
  // HTTP allows. This shop always answers with JSON.
  const headers = {
    ...who.delivery,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const send = (message: object, version?: string) =>
    fetch(url, {
      method: 'POST',
      // After initialize, each request says the protocol version that was agreed.
      headers: version ? { ...headers, 'MCP-Protocol-Version': version } : headers,
      body: JSON.stringify({ jsonrpc: '2.0', ...message }),
    });

  // 1. initialize: the client says which protocol version it speaks and who it is; the server
  // answers with the version they'll use, what it can do (tools) and who it is.
  const start = await send({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'curl', version: '8.14.1' },
    },
  });
  assert.equal(start.status, 200);
  assert.equal(start.headers.get('content-type'), 'application/json');
  // Stateless: no session to remember.
  assert.equal(start.headers.get('mcp-session-id'), null);
  assert.deepEqual(await start.json(), {
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: { listChanged: true } },
      serverInfo: { name: 'shop-api', version: '1.0.0' },
    },
  });

  // 2. A notification (no id): it expects no answer, and the server answers 202 with no body.
  const ready = await send({ method: 'notifications/initialized' }, '2025-11-25');
  assert.equal(ready.status, 202);
  assert.equal(await ready.text(), '');

  // 3. tools/list: the response carries the same id as the question.
  const list = await (await send({ id: 2, method: 'tools/list' }, '2025-11-25')).json();
  assert.equal(list.id, 2);
  assert.deepEqual(
    list.result.tools.map((tool: { name: string }) => tool.name),
    ['search_products', 'get_product', 'search_help', 'orders_to_ship', 'mark_shipped'],
  );

  // 4. tools/call: the name and the arguments; the result, content blocks.
  const call = await send(
    {
      id: 3,
      method: 'tools/call',
      params: { name: 'search_products', arguments: { query: 'cap' } },
    },
    '2025-11-25',
  );
  assert.deepEqual(await call.json(), {
    jsonrpc: '2.0',
    id: 3,
    result: {
      content: [
        {
          type: 'text',
          text: '[{"id":4,"name":"Cap","description":"Cotton cap with a peak, to protect your head from the summer sun.","priceCents":1500,"stock":15,"distance":null}]',
        },
      ],
    },
  });
});

test("MCP's responses carry X-Request-Id, like the whole shop's: the client's or a new one", async () => {
  const send = (headers: Record<string, string>, message: object) =>
    fetch(url, {
      method: 'POST',
      headers: {
        ...who.delivery,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...message }),
    });
  // With no X-Request-Id in the request, a new one, which is the one that goes to the log
  // (requestId() in app.ts).
  const fresh = await send({}, { id: 1, method: 'tools/list' });
  assert.equal(fresh.status, 200);
  assert.match(fresh.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  // With one, the same: that way an agent can follow its call in the shop's log.
  const theirs = await send({ 'X-Request-Id': 'agent-0001' }, { id: 2, method: 'tools/list' });
  assert.equal(theirs.headers.get('x-request-id'), 'agent-0001');
  // Also on a notification's 202 with no body.
  const notice = await send(
    { 'X-Request-Id': 'agent-0002' },
    { method: 'notifications/initialized' },
  );
  assert.equal(notice.status, 202);
  assert.equal(notice.headers.get('x-request-id'), 'agent-0002');
});
