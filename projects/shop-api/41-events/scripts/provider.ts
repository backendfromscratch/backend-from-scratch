// A practice OpenID Connect identity provider, like "Sign in with Google", but on your computer:
// http://localhost:9000. Run it with: npm run provider
// It's oauth2-mock-server, made for testing: it doesn't ask for a password, accepts any shop and
// always says that whoever signs in is Marta. Never use it outside your computer.
import { Events, OAuth2Server } from 'oauth2-mock-server';

// #region person
// The person who "signs in" at the provider. sub is their identifier at the provider, the one that
// doesn't change; email_verified: the provider has checked that the email is theirs.
export const MARTA = {
  sub: 'provider-marta-0001',
  email: 'marta@example.com',
  email_verified: true,
  name: 'Marta Ruiz',
};
// #endregion person

// #region start
// Starts the provider and returns the server. person can be changed while it runs (the tests do
// it); report writes what's going on.
export async function startProvider(
  port: number,
  host: string,
  person: Record<string, unknown> = MARTA,
  report: (text: string) => void = () => {},
) {
  const provider = new OAuth2Server();
  // The key it signs the id_tokens with (RS256: a key pair, Phase 0). It publishes the public one
  // at /jwks, for whoever wants to check the signature (the shop doesn't need to: lesson 4).
  await provider.issuer.keys.generate('RS256');

  // Before signing each token, it puts the person's data in it.
  provider.service.on(Events.BeforeTokenSigning, (token) => {
    Object.assign(token.payload, person);
  });
  provider.service.on(Events.BeforeAuthorizeRedirect, ({ url }) => {
    report(`/authorize: ${person.name} signs in. Back to ${url.origin}${url.pathname}`);
    report(
      `  with code=${url.searchParams.get('code')} and state=${url.searchParams.get('state')}`,
    );
  });
  provider.service.on(Events.BeforeResponse, (response) => {
    const body = response.body as Record<string, unknown>;
    if ('id_token' in body)
      report(`/token: the code is exchanged for an id_token of ${person.name}`);
    else report(`/token: ${response.statusCode} ${JSON.stringify(body)}`);
  });

  await provider.start(port, host);
  return provider;
}
// #endregion start

if (import.meta.main) {
  // It listens on 127.0.0.1, not on localhost: where localhost is ::1 (IPv6) first, it would only
  // listen on ::1, and the shop, which tries 127.0.0.1, wouldn't find it. Its URL is still
  // localhost:9000.
  const provider = await startProvider(9000, '127.0.0.1', MARTA, console.log);
  console.log(`Practice provider at ${provider.issuer.url}`);
  console.log(`Its configuration: ${provider.issuer.url}/.well-known/openid-configuration`);
}
