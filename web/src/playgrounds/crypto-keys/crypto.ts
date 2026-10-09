/**
 * Playground crypto-keys: criptografía de verdad con la Web Crypto API del navegador.
 *
 * - Cifrado con RSA-OAEP (2048 bits, SHA-256): cifra la clave pública, descifra la privada.
 * - Firma con ECDSA (curva P-256, SHA-256): firma la clave privada, verifica la pública.
 *
 * No sabe de React ni de idiomas.
 */

const RSA_OAEP: RsaHashedKeyGenParams = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};
const ECDSA_KEYS: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const ECDSA_SIGN: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

/** La Web Crypto API solo existe en contextos seguros: HTTPS o localhost. */
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
 * La clave privada de firma no es exportable: el playground nunca la enseña. (La pública siempre se
 * puede exportar, sea cual sea este valor: es la que se muestra.)
 */
export function generateSigningKeys(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDSA_KEYS, false, ['sign', 'verify']);
}

/** Cifra un texto con la clave pública. Devuelve el resultado en Base64. */
export async function encrypt(publicKey: CryptoKey, text: string): Promise<string> {
  const encrypted = await crypto.subtle.encrypt(RSA_OAEP, publicKey, utf8.encode(text));
  return toBase64(new Uint8Array(encrypted));
}

/** Descifra con la clave privada. Falla si no es la pareja de la pública que cifró. */
export async function decrypt(privateKey: CryptoKey, encrypted: string): Promise<string> {
  return utf8.decode(await crypto.subtle.decrypt(RSA_OAEP, privateKey, fromBase64(encrypted)));
}

/** Firma un texto con la clave privada. Devuelve la firma en Base64. */
export async function sign(privateKey: CryptoKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign(ECDSA_SIGN, privateKey, utf8.encode(text));
  return toBase64(new Uint8Array(signature));
}

/** ¿Esta firma es de este texto y de la pareja de esta clave pública? Una firma ilegible tampoco es válida. */
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

/** Exporta una clave en PEM: la pública como SPKI y la privada como PKCS #8, en líneas de 64 caracteres. */
export async function exportPem(key: CryptoKey): Promise<string> {
  const isPublic = key.type === 'public';
  const der = await crypto.subtle.exportKey(isPublic ? 'spki' : 'pkcs8', key);
  const label = isPublic ? 'PUBLIC KEY' : 'PRIVATE KEY';
  const body = toBase64(new Uint8Array(der)).match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${label}-----`, ...body, `-----END ${label}-----`].join('\n');
}

/** Una clave PEM en cinco líneas: la cabecera, la primera línea, «…», la última y el pie. */
export function abbreviatePem(pem: string): string {
  const lines = pem.trim().split('\n');
  if (lines.length <= 5) return lines.join('\n');
  return [lines[0], lines[1], '…', lines[lines.length - 2], lines[lines.length - 1]].join('\n');
}
