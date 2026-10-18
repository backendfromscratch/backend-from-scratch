import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../src/db.ts';
import { MARTA, startProvider } from '../scripts/provider.ts';
import { useDb } from './db.ts';

useDb();

// The practice provider, right here, on a free port of 127.0.0.1: nothing leaves the computer.
// person is whoever "signs in" at it; each test changes it if it needs another one.
const person: Record<string, unknown> = { ...MARTA };
const provider = await startProvider(0, '127.0.0.1', person);
provider.issuer.url = `http://127.0.0.1:${provider.address().port}`;
after(() => provider.stop());

// The shop reads OIDC_ISSUER when it starts: first it's changed, then the app is imported.
process.env.OIDC_ISSUER = provider.issuer.url;
const { app } = await import('../src/app.ts');

/** The first cookie in a Set-Cookie header, as "name=value". */
const cookieOf = (res: Response, name: string) =>
  new RegExp(`(?:^|, )(${name}=[^;]*)`).exec(res.headers.get('set-cookie') ?? '')?.[1];

/**
 * The whole flow, following each redirect by hand, as the browser would: the shop sends to the
 * provider, the provider sends back to the shop with a code, and the shop opens the session.
 */
async function signInWithProvider() {
  const start = await app.request('/v2/session/provider');
  const toProvider = new URL(start.headers.get('location')!);
  const startCookie = cookieOf(start, 'provider')!;
  const fromProvider = await fetch(toProvider, { redirect: 'manual' });
  const back = new URL(fromProvider.headers.get('location')!);
  const callbackPath = back.pathname + back.search;
  const callback = await app.request(callbackPath, { headers: { Cookie: startCookie } });
  return { start, toProvider, startCookie, callbackPath, callback };
}

const me = async (callback: Response) =>
  (await app.request('/v2/me', { headers: { Cookie: cookieOf(callback, 'session')! } })).json();

test('the way out: to the provider, with the authorization code, PKCE S256, state and nonce', async () => {
  const start = await app.request('/v2/session/provider');
  assert.equal(start.status, 302);
  const url = new URL(start.headers.get('location')!);
  assert.equal(url.origin + url.pathname, `${provider.issuer.url}/authorize`);
  const parameters = Object.fromEntries(url.searchParams);
  assert.equal(parameters.response_type, 'code');
  assert.equal(parameters.client_id, 'shop');
  assert.equal(parameters.redirect_uri, 'http://localhost:3000/v2/session/provider/callback');
  assert.equal(parameters.scope, 'openid email profile');
  assert.equal(parameters.code_challenge_method, 'S256');
  assert.match(parameters.code_challenge!, /^[\w-]{43}$/);
  assert.ok(parameters.state && parameters.nonce);
  const cookie = start.headers.get('set-cookie')!;
  assert.match(
    cookie,
    /^provider=[\w-]+; Max-Age=600; Path=\/v2\/session\/provider; HttpOnly; Secure; SameSite=Lax$/,
  );
  // The PKCE verifier goes in the cookie, never in the URL.
  assert.ok(
    !url.href.includes(
      JSON.parse(Buffer.from(cookie.split(/[=;]/)[1]!, 'base64url').toString()).verifier,
    ),
  );
});

test('the whole flow: Marta comes back with a code, her account is created without a password and she has a session', async () => {
  const { callback } = await signInWithProvider();
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.get('location'), '/v2/me');
  assert.match(callback.headers.get('set-cookie')!, /provider=; Max-Age=0/);
  const account = await me(callback);
  assert.equal(account.type, 'user');
  assert.equal(account.email, 'marta@example.com');
  const { rows } = await pool.query('SELECT password_hash, provider_sub FROM users WHERE id = $1', [
    account.id,
  ]);
  assert.deepEqual(rows[0], { password_hash: null, provider_sub: 'provider-marta-0001' });

  // The second time, the same account: it's recognized by the sub.
  const again = await signInWithProvider();
  assert.equal((await me(again.callback)).id, account.id);
});

test('a verified email that already has an account: it is linked to it; unverified, 409 and not linked', async () => {
  Object.assign(person, {
    sub: 'provider-carmen',
    email: 'Carmen@example.com',
    email_verified: false,
  });
  const unverified = await signInWithProvider();
  assert.equal(unverified.callback.status, 409);
  assert.equal(
    (await unverified.callback.json()).type,
    'https://shop.example/problems/email-not-verified',
  );
  assert.equal(cookieOf(unverified.callback, 'session'), undefined);

  person.email_verified = true;
  const verified = await signInWithProvider();
  assert.equal(verified.callback.status, 303);
  assert.deepEqual(await me(verified.callback), {
    type: 'user',
    id: 3,
    email: 'carmen@example.com',
    role: 'customer',
  });
  const { rows } = await pool.query('SELECT provider_sub FROM users WHERE id = 3');
  assert.equal(rows[0].provider_sub, 'provider-carmen');
  Object.assign(person, MARTA);
});

test('a changed state: 400, and neither session nor account', async () => {
  const start = await app.request('/v2/session/provider');
  const fromProvider = await fetch(start.headers.get('location')!, { redirect: 'manual' });
  const back = new URL(fromProvider.headers.get('location')!);
  back.searchParams.set('state', 'a-state-from-another-browser');
  const callback = await app.request(back.pathname + back.search, {
    headers: { Cookie: cookieOf(start, 'provider')! },
  });
  assert.equal(callback.status, 400);
  assert.equal((await callback.json()).type, 'https://shop.example/problems/provider-sign-in');
  assert.equal(cookieOf(callback, 'session'), undefined);
});

test('the same code again, even if the cookie is repeated: the provider already used it up, 400', async () => {
  const { startCookie, callbackPath, callback } = await signInWithProvider();
  assert.equal(callback.status, 303);
  const repeated = await app.request(callbackPath, { headers: { Cookie: startCookie } });
  assert.equal(repeated.status, 400);
  assert.equal(cookieOf(repeated, 'session'), undefined);
});

test('the way back without the way-out cookie (another browser): 400', async () => {
  const start = await app.request('/v2/session/provider');
  const fromProvider = await fetch(start.headers.get('location')!, { redirect: 'manual' });
  const back = new URL(fromProvider.headers.get('location')!);
  const callback = await app.request(back.pathname + back.search);
  assert.equal(callback.status, 400);
});
