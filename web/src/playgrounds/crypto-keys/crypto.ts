/**
 * Playground crypto-keys: real cryptography with the browser's Web Crypto API.
 *
 * - Encryption with RSA-OAEP (2048 bits, SHA-256): the public key encrypts, the private key decrypts.
 * - Signing with ECDSA (P-256 curve, SHA-256): the private key signs, the public key verifies.
 *
 * It knows nothing about React or languages.
 */

const RSA_OAEP: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const ECDSA_KEYS: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDSA_SIGN: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

/** The Web Crypto API only exists in secure contexts: HTTPS or localhost. */
export function isCryptoAvailable(environment: {
  isSecureContext?: boolean;
  crypto?: Crypto;
}): boolean {
  return Boolean(environment.isSecureContext && environment.crypto?.subtle);
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

const utf8 = {
  encode: (text: string) => new TextEncoder().encode(text),
  decode: (bytes: ArrayBuffer) => new TextDecoder().decode(bytes),
};

export function generateEncryptionKeys(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(RSA_OAEP, true, ['encrypt', 'decrypt']);
}

/**
 * The private signing key is not exportable: the playground never shows it. (The public one can always
 * be exported, whatever this value is: it is the one that is shown.)
 */
export function generateSigningKeys(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDSA_KEYS, false, ['sign', 'verify']);
}

/** Encrypts a text with the public key. Returns the result in Base64. */
export async function encrypt(publicKey: CryptoKey, text: string): Promise<string> {
  const encrypted = await crypto.subtle.encrypt(RSA_OAEP, publicKey, utf8.encode(text));
  return toBase64(new Uint8Array(encrypted));
}

/** Decrypts with the private key. Fails if it is not the pair of the public key that encrypted. */
export async function decrypt(privateKey: CryptoKey, encrypted: string): Promise<string> {
  return utf8.decode(await crypto.subtle.decrypt(RSA_OAEP, privateKey, fromBase64(encrypted)));
}

/** Signs a text with the private key. Returns the signature in Base64. */
export async function sign(privateKey: CryptoKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign(ECDSA_SIGN, privateKey, utf8.encode(text));
  return toBase64(new Uint8Array(signature));
}

/** Is this signature for this text and from the pair of this public key? An unreadable signature is not valid either. */
export async function verify(
  publicKey: CryptoKey,
  text: string,
  signature: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      ECDSA_SIGN,
      publicKey,
      fromBase64(signature),
      utf8.encode(text),
    );
  } catch {
    return false;
  }
}

/** Exports a key as PEM: the public one as SPKI and the private one as PKCS #8, in 64-character lines. */
export async function exportPem(key: CryptoKey): Promise<string> {
  const isPublic = key.type === 'public';
  const der = await crypto.subtle.exportKey(isPublic ? 'spki' : 'pkcs8', key);
  const label = isPublic ? 'PUBLIC KEY' : 'PRIVATE KEY';
  const body = toBase64(new Uint8Array(der)).match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${label}-----`, ...body, `-----END ${label}-----`].join('\n');
}

/** A PEM key in five lines: the header, the first line, "…", the last line and the footer. */
export function abbreviatePem(pem: string): string {
  const lines = pem.trim().split('\n');
  if (lines.length <= 5) return lines.join('\n');
  return [lines[0], lines[1], '…', lines[lines.length - 2], lines[lines.length - 1]].join('\n');
}
