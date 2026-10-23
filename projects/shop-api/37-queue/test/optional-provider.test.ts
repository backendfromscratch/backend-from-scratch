// The identity provider is optional (Phase 8): on a server where there's none within reach, the shop
// starts without it and the provider's two routes say there isn't one. Each case starts the shop in
// another process, with whichever OIDC_* apply: the configuration is read when it's imported.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { MARTA, startProvider } from '../scripts/provider.ts';
import { useDb } from './db.ts';

useDb();

const execute = promisify(execFile);

const OIDC = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI'] as const;

// The tests' environment, with only the OIDC_* that are asked for.
const environment = (keep: readonly string[] = []) => {
  const env = { ...process.env };
  for (const name of OIDC) if (!keep.includes(name)) delete env[name];
  return env;
};

// Imports the app in another process, makes the requests and writes their responses as JSON.
const fromAnotherProcess = async (requests: [string, RequestInit?][], env = environment()) => {
  const program = `
    const { app } = await import('./src/app.ts');
    const { pool } = await import('./src/db.ts');
    const responses = [];
    for (const [path, options] of ${JSON.stringify(requests)}) {
      const res = await app.request(path, options);
      responses.push({
        status: res.status,
        type: res.headers.get('content-type'),
        body: res.headers.get('content-type')?.includes('json') ? await res.json() : null,
      });
    }
    await pool.end();
    console.log(JSON.stringify(responses));
  `;
  const { stdout } = await execute('node', ['--input-type=module', '-e', program], { env });
  return JSON.parse(stdout) as {
    status: number;
    type: string;
    body: Record<string, unknown> | null;
  }[];
};

const NONE = {
  type: 'https://shop.example/problems/provider-not-configured',
  title: 'The shop has no identity provider',
  status: 404,
};

test('without any OIDC_*, the server starts and GET /v2/session/provider answers 404 with problem provider-not-configured', async () => {
  const [res] = await fromAnotherProcess([['/v2/session/provider']]);
  assert.equal(res!.status, 404);
  assert.match(res!.type, /^application\/problem\+json/);
  assert.partialDeepStrictEqual(res!.body, NONE);
});

test('the provider callback also answers 404 without configuration', async () => {
  const [res] = await fromAnotherProcess([['/v2/session/provider/callback?code=x&state=y']]);
  assert.equal(res!.status, 404);
  assert.partialDeepStrictEqual(res!.body, NONE);
});

test('with only some OIDC_*, the server does not start and the message says which are missing', async () => {
  await assert.rejects(
    fromAnotherProcess([['/v2/session/provider']], environment(['OIDC_ISSUER', 'OIDC_CLIENT_ID'])),
    (error: { code: number; stderr: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /OIDC_CLIENT_SECRET/);
      assert.match(error.stderr, /OIDC_REDIRECT_URI/);
      assert.doesNotMatch(error.stderr, /Configuration: OIDC_ISSUER/);
      return true;
    },
  );
});

test('with all four, signing in with the provider works as in step 34', async () => {
  const provider = await startProvider(0, '127.0.0.1', { ...MARTA });
  try {
    const issuer = `http://127.0.0.1:${provider.address().port}`;
    provider.issuer.url = issuer;
    const [res] = await fromAnotherProcess([['/v2/session/provider', { redirect: 'manual' }]], {
      ...environment(OIDC),
      OIDC_ISSUER: issuer,
    });
    assert.equal(res!.status, 302);
  } finally {
    await provider.stop();
  }
});

test('email and password work without a provider', async () => {
  const [res] = await fromAnotherProcess([
    [
      '/v2/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ana@shop.example', password: 'ana-practice-2026' }),
      },
    ],
  ]);
  assert.equal(res!.status, 200);
  assert.equal(res!.body!.email, 'ana@shop.example');
});
