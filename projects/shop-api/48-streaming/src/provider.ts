// The shop as an OpenID Connect client: "Sign in with…" an identity provider. The flow is the
// authorization code one with PKCE (RFC 9700: the one recommended for everyone). openid-client does
// it; here is each step, to see it.
import * as oidc from 'openid-client';
import { config } from './config.ts';
import { log } from './log.ts';

// The provider is optional: without the four OIDC_*, the shop doesn't offer it (config.ts
// guarantees that all four are there or none is). Whoever uses it has to ask first; nothing in this
// file touches the settings if there is no provider.
function settings() {
  const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI } = config;
  if (!OIDC_ISSUER || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET || !OIDC_REDIRECT_URI) {
    return undefined;
  }
  return {
    issuer: OIDC_ISSUER,
    clientId: OIDC_CLIENT_ID,
    clientSecret: OIDC_CLIENT_SECRET,
    redirectUri: OIDC_REDIRECT_URI,
  };
}

export const providerConfigured = () => settings() !== undefined;

// The callback URL registered at the provider, for the routes that need it.
export const callbackUrl = () => {
  const data = settings();
  if (!data) throw new Error('The shop has no identity provider');
  return data.redirectUri;
};

// #region discover
// Discovery: the shop reads the provider's /.well-known/openid-configuration, which says where
// each thing is (where to send the person, where to exchange the code, where its keys are). It's
// done once, the first time it's needed, and kept. If it fails, it's tried again the next time.
let configuration: Promise<oidc.Configuration> | undefined;

function provider(): Promise<oidc.Configuration> {
  configuration ??= discover().catch((error) => {
    configuration = undefined;
    throw error;
  });
  return configuration;
}

async function discover() {
  const data = settings();
  if (!data) throw new Error('The shop has no identity provider');
  const issuer = new URL(data.issuer);
  // A real provider always speaks HTTPS, and openid-client accepts nothing else. The practice one
  // (npm run provider) speaks HTTP on your computer: only for it, and only on localhost, is it
  // allowed.
  const forPractice =
    issuer.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(issuer.hostname);
  return oidc.discovery(
    issuer,
    data.clientId,
    data.clientSecret,
    undefined,
    forPractice ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
}
// #endregion discover

// #region start
// What the shop keeps between the way out and the way back, to check the response:
// - state: a random value the provider returns as is. If it doesn't match, that way back wasn't
//   started by this browser: someone is trying to slip their own code in (CSRF on sign-in).
// - nonce: another random value, which comes back inside the id_token. It ties the token to this
//   sign-in.
// - verifier (PKCE): a random secret. The provider only gets its hash (code_challenge); when
//   exchanging the code the verifier is sent, and that way whoever steals the code can't use it.
export interface SavedStart {
  state: string;
  nonce: string;
  verifier: string;
}

// #region outbound
export async function startSignIn(): Promise<{ url: URL; saved: SavedStart }> {
  const saved = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verifier: oidc.randomPKCECodeVerifier(),
  };
  const url = oidc.buildAuthorizationUrl(await provider(), {
    redirect_uri: callbackUrl(),
    // openid: we want to know who it is (OpenID Connect, not just OAuth); email and profile, their
    // data.
    scope: 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(saved.verifier),
    code_challenge_method: 'S256',
    state: saved.state,
    nonce: saved.nonce,
  });
  return { url, saved };
}
// #endregion outbound
// #endregion start

// #region finish
// Who the person is, according to the provider.
export interface Identity {
  sub: string;
  email?: string;
  emailVerified: boolean;
}

// The way back: checks the state, exchanges the code for the tokens (with the shop's secret and
// the verifier) and checks the id_token: the issuer (iss), that it's for this shop (aud), the
// nonce and that it hasn't expired. Not its signature: the token comes straight from the provider,
// and OpenID Connect allows trusting that connection. If something fails, it returns undefined,
// and the reason goes to the log.
export async function finishSignIn(
  callback: URL,
  saved: SavedStart,
): Promise<Identity | undefined> {
  try {
    // #region exchange-code
    const tokens = await oidc.authorizationCodeGrant(await provider(), callback, {
      expectedState: saved.state,
      expectedNonce: saved.nonce,
      pkceCodeVerifier: saved.verifier,
      idTokenExpected: true,
    });
    // #endregion exchange-code
    const claims = tokens.claims()!;
    return {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      emailVerified: claims.email_verified === true,
    };
  } catch (error) {
    const fromTheFlow =
      error instanceof oidc.ClientError ||
      error instanceof oidc.ResponseBodyError ||
      error instanceof oidc.AuthorizationResponseError;
    if (!fromTheFlow) throw error;
    log.warn({ err: error }, 'sign-in with the provider rejected');
    return undefined;
  }
}
// #endregion finish
