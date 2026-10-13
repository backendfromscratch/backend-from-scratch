import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { app } from '../src/app.ts';

const run = promisify(execFile);

// A date in ISO 8601, in UTC: 2026-10-13T09:30:00.000Z.
const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('a new order carries createdAt: the current time, in ISO 8601 and in UTC', async () => {
  const before = Date.now();
  const res = await app.request('/v2/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"productId":1,"quantity":1}',
  });
  const { createdAt } = await res.json();
  assert.match(createdAt, iso8601);
  const when = Date.parse(createdAt);
  assert.ok(when >= before - 1000 && when <= Date.now() + 1000);
});

test('the sample orders have a date, and the newest ones come first', async () => {
  const orders = await (await app.request('/v2/orders?status=shipped&limit=3')).json();
  assert.deepEqual(
    orders.map((order: { createdAt: string }) => order.createdAt),
    ['2026-10-04T14:00:00.000Z', '2026-10-04T07:00:00.000Z', '2026-10-04T00:00:00.000Z'],
  );
});

test('v1 gives createdAt too: adding a field does not break anyone', async () => {
  const order = await (await app.request('/v1/orders/1')).json();
  assert.equal(order.createdAt, '2026-10-01T09:00:00.000Z');
});

test('in the contract, createdAt is a text with the date-time format, and required', async () => {
  const doc = await (await app.request('/v2/openapi.json')).json();
  const order = doc.components.schemas.Order;
  assert.equal(order.properties.createdAt.type, 'string');
  assert.equal(order.properties.createdAt.format, 'date-time');
  assert.ok(order.required.includes('createdAt'));
});

test('examples/protobuf.ts: the same order takes less in Protobuf, and reads the same', async () => {
  const { stdout } = await run('node', ['examples/protobuf.ts']);
  const json = Number(stdout.match(/^JSON: (\d+) bytes$/m)?.[1]);
  const protobuf = Number(stdout.match(/^Protobuf: (\d+) bytes$/m)?.[1]);
  assert.equal(json, 93);
  assert.equal(protobuf, 34);
  assert.match(stdout, /^08 07 10 01 18 02 20 01 2a 18/m);
  assert.match(stdout, /productId: 1,/);
  assert.match(stdout, /createdAt: '2026-10-13T09:30:00.000Z'/);
});

test('examples/money.ts: with decimals the sum is off; in cents, it is not', async () => {
  const { stdout } = await run('node', ['examples/money.ts']);
  assert.match(stdout, /^0\.1 \+ 0\.2 = 0\.30000000000000004$/m);
  assert.match(stdout, /^Is 0\.1 \+ 0\.2 equal to 0\.3\? false$/m);
  assert.match(stdout, /^In euros: 8\.799999999999999$/m);
  assert.match(stdout, /^In cents: 880$/m);
  // In English, Intl puts the symbol first and with no space.
  assert.match(stdout, /^To show it: €8\.80$/m);
});
