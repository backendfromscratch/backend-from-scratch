import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafePage } from '../examples/unsafe-page.ts';
import { app } from '../src/app.ts';
import { listProducts } from '../src/data.ts';
import { useDb } from './db.ts';
import { ANA, asUser } from './identities.ts';

// A product with tags in its name: Ana, who is admin, creates it.
const MALICIOUS = '<img src=x onerror=alert(1)>';
useDb(async () => {
  const res = await app.request('/v2/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await asUser(ANA)) },
    body: JSON.stringify({ name: MALICIOUS, priceCents: 100 }),
  });
  assert.equal(res.status, 201);
});

test('/shop: an HTML page with the products, and the name with tags comes out escaped', async () => {
  const res = await app.request('/shop');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')!, /^text\/html/);
  const page = await res.text();
  // Intl in English writes the € in front of the number, with no space.
  assert.match(page, /<li>Mug: €8\.50<\/li>/);
  assert.ok(page.includes('<li>&lt;img src=x onerror=alert(1)&gt;: €1.00</li>'), page);
  assert.ok(!page.includes(MALICIOUS));
});

test('/shop carries the Content Security Policy: no scripts inside the page', async () => {
  const res = await app.request('/shop');
  assert.equal(
    res.headers.get('content-security-policy'),
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; " +
      "frame-ancestors 'none'; form-action 'self'",
  );
});

test('the JSON routes stay the same, now with the security headers', async () => {
  const res = await app.request('/v2/products/2');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, 'Mug');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('strict-transport-security')!, /^max-age=\d+/);
  assert.equal(res.headers.get('content-security-policy'), null);
  assert.equal((await app.request('/docs')).status, 200);
});

test('examples/unsafe-page.ts: pasting the name, the tag reaches the browser whole', async () => {
  const page = unsafePage(await listProducts());
  assert.ok(page.includes(`<li>${MALICIOUS}</li>`));
});
