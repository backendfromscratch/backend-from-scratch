// A JWT (JSON Web Token) inside: how it's made, what it carries, who can read it and what's
// rejected when checking it. With the jose library. Run it with: node examples/jwt.ts
// It doesn't need the database. The shop doesn't use JWT to sign in (it uses sessions, lesson 2):
// this example is to see what it is and what can go wrong.
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

// #region secret
// HS256 signs with an HMAC-SHA256 (Phase 4) and a secret that only whoever signs and whoever
// checks know. It comes from JWT_SECRET if it exists; if not, a random one each time it runs.
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? randomBytes(32).toString('hex'));
// #endregion secret

// #region create
// The token says who it is (sub), who issues it (iss), who it's for (aud) and until when it's
// valid (exp). expires: a text like '15m' or the seconds since 1970.
export function createToken(sub: string, aud = 'shop-api', expires: string | number = '15m') {
  return new SignJWT({ role: 'customer' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setIssuer('shop-api')
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret);
}
// #endregion create

// #region read
// The three parts, separated by dots: header, payload and signature, each one in base64url. To
// read the first two it's enough to undo the base64url: without the secret, without jose. A JWT is
// signed, not encrypted: never put in it anything that whoever has it can't see.
export function readParts(token: string) {
  const [header, payload, signature] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header!, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(payload!, 'base64url').toString()),
    signatureBytes: Buffer.from(signature!, 'base64url').length,
  };
}
// #endregion read

// #region check
// Checking is more than reading: the signature (did whoever has the secret sign it?, has anything
// changed?), the algorithm (only HS256: never the one the token itself says), the issuer, the
// audience and the expiry. If something fails, jose throws an error with a code that says what.
export async function check(token: string, aud = 'shop-api') {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'shop-api',
      audience: aud,
    });
    return { valid: true as const, payload };
  } catch (error) {
    return { valid: false as const, reason: (error as { code?: string }).code ?? String(error) };
  }
}
// #endregion check

// #region break
// Someone changes the payload (sub: pablo instead of carmen) and leaves the signature it had: it no
// longer matches.
export function tamper(token: string, sub: string) {
  const [header, payload, signature] = token.split('.');
  const changed = { ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), sub };
  return [header, Buffer.from(JSON.stringify(changed)).toString('base64url'), signature].join('.');
}

// The alg: none attack: a header that says "this token carries no signature", and the signature,
// empty. A library that listened to the token would accept it. jose doesn't: the algorithm is
// decided by whoever checks (algorithms, above).
export function unsigned(token: string) {
  const [, payload] = token.split('.');
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  return `${header}.${payload}.`;
}
// #endregion break

// #region try
// import.meta.main: only if this file is run (node examples/jwt.ts), not if another one imports it
// (the tests use its functions).
if (import.meta.main) {
  const token = await createToken('carmen');
  console.log(`The token:\n${token}\n`);
  const { header, payload, signatureBytes } = readParts(token);
  console.log('Header:', header);
  console.log('Payload:', payload);
  console.log(`Signature: ${signatureBytes} bytes\n`);

  const cases = [
    ['As is', token],
    ['With the payload changed', tamper(token, 'pablo')],
    ['With alg: none and no signature', unsigned(token)],
    [
      'Expired a minute ago',
      await createToken('carmen', 'shop-api', Math.floor(Date.now() / 1000) - 60),
    ],
    ['For another audience', await createToken('carmen', 'payment-gateway')],
  ] as const;
  for (const [name, tried] of cases) {
    const result = await check(tried);
    console.log(`${name}: ${result.valid ? 'valid' : `rejected (${result.reason})`}`);
  }
}
// #endregion try
