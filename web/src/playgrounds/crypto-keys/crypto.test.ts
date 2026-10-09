import { describe, expect, it } from 'vitest';
import {
  abbreviatePem,
  decrypt,
  encrypt,
  exportPem,
  fromBase64,
  generateEncryptionKeys,
  generateSigningKeys,
  isCryptoAvailable,
  sign,
  toBase64,
  verify,
} from './crypto';

describe('Base64', () => {
  it('encodes bytes and gets them back', () => {
    expect(toBase64(new Uint8Array([104, 111, 108, 97]))).toBe('aG9sYQ==');
    expect([...fromBase64('aG9sYQ==')]).toEqual([104, 111, 108, 97]);
    expect([...fromBase64(toBase64(new Uint8Array([0, 1, 255])))]).toEqual([0, 1, 255]);
  });
});

describe('encryption with RSA-OAEP', () => {
  it('what the public key encrypts, the private key decrypts', async () => {
    const keys = await generateEncryptionKeys();
    const encrypted = await encrypt(keys.publicKey, 'Hola, servidor');
    expect(await decrypt(keys.privateKey, encrypted)).toBe('Hola, servidor');
  });

  it('the ciphertext is 256 bytes and does not reveal the original', async () => {
    const keys = await generateEncryptionKeys();
    const encrypted = await encrypt(keys.publicKey, 'Hola, servidor');
    expect(fromBase64(encrypted)).toHaveLength(256);
    expect(encrypted).not.toContain('Hola');
  });

  it('encrypting the same thing twice gives different results (OAEP adds randomness)', async () => {
    const keys = await generateEncryptionKeys();
    const first = await encrypt(keys.publicKey, 'Hola, servidor');
    const second = await encrypt(keys.publicKey, 'Hola, servidor');
    expect(first).not.toBe(second);
    expect(await decrypt(keys.privateKey, second)).toBe('Hola, servidor');
  });

  it('another private key cannot decrypt it', async () => {
    const keys = await generateEncryptionKeys();
    const other = await generateEncryptionKeys();
    const encrypted = await encrypt(keys.publicKey, 'Hola, servidor');
    await expect(decrypt(other.privateKey, encrypted)).rejects.toThrow();
  });

  it('encrypts at most 190 bytes at once: 2048 key bits, minus what OAEP with SHA-256 takes', async () => {
    const { publicKey, privateKey } = await generateEncryptionKeys();
    const justFits = 'a'.repeat(190);
    expect(await decrypt(privateKey, await encrypt(publicKey, justFits))).toBe(justFits);
    await expect(encrypt(publicKey, 'a'.repeat(191))).rejects.toThrow();
    // Bytes are counted, not letters: "é" takes two in UTF-8.
    await expect(encrypt(publicKey, 'é'.repeat(96))).rejects.toThrow();
  });

  it('accepts accents and emojis, because it encrypts the UTF-8 bytes', async () => {
    const keys = await generateEncryptionKeys();
    const text = 'Señor del ñandú 🔐';
    expect(await decrypt(keys.privateKey, await encrypt(keys.publicKey, text))).toBe(text);
  });
});

describe('signing with ECDSA', () => {
  it('the private key cannot be exported: it is never shown here, so it is not needed', async () => {
    const { publicKey, privateKey } = await generateSigningKeys();
    expect(privateKey.extractable).toBe(false);
    await expect(exportPem(privateKey)).rejects.toThrow();
    // The public one can: it is the one that is shown.
    expect(await exportPem(publicKey)).toMatch(/^-----BEGIN PUBLIC KEY-----/);
  });

  it('a signature made with the private key is verified with the public one', async () => {
    const keys = await generateSigningKeys();
    const signature = await sign(keys.privateKey, 'Transfiere 10 € a Ana');
    expect(await verify(keys.publicKey, 'Transfiere 10 € a Ana', signature)).toBe(true);
  });

  it('the signature is 64 bytes', async () => {
    const keys = await generateSigningKeys();
    expect(fromBase64(await sign(keys.privateKey, 'Transfiere 10 € a Ana'))).toHaveLength(64);
  });

  it('if the message changes, the signature is no longer valid', async () => {
    const keys = await generateSigningKeys();
    const signature = await sign(keys.privateKey, 'Transfiere 10 € a Ana');
    expect(await verify(keys.publicKey, 'Transfiere 1000 € a Ana', signature)).toBe(false);
  });

  it('the public key of another pair does not verify it', async () => {
    const keys = await generateSigningKeys();
    const other = await generateSigningKeys();
    const signature = await sign(keys.privateKey, 'Transfiere 10 € a Ana');
    expect(await verify(other.publicKey, 'Transfiere 10 € a Ana', signature)).toBe(false);
  });

  it('a signature that is not even Base64 is not valid, and breaks nothing', async () => {
    const keys = await generateSigningKeys();
    expect(await verify(keys.publicKey, 'Transfiere 10 € a Ana', 'esto no es base64!')).toBe(false);
  });
});

describe('PEM', () => {
  it('exports the public key (SPKI) and the private key (PKCS #8) in 64-character lines', async () => {
    const keys = await generateEncryptionKeys();
    const publicPem = await exportPem(keys.publicKey);
    const privatePem = await exportPem(keys.privateKey);
    expect(publicPem.split('\n')[0]).toBe('-----BEGIN PUBLIC KEY-----');
    expect(publicPem.trimEnd().split('\n').at(-1)).toBe('-----END PUBLIC KEY-----');
    expect(privatePem.split('\n')[0]).toBe('-----BEGIN PRIVATE KEY-----');
    const body = publicPem.split('\n').slice(1, -1);
    expect(body.slice(0, -1).every((line) => line.length === 64)).toBe(true);
  });

  it('abbreviates a long key: the header, the first line, "…", the last line and the footer', async () => {
    const pem = await exportPem((await generateEncryptionKeys()).publicKey);
    const lines = pem.split('\n');
    expect(abbreviatePem(pem)).toBe(
      [lines[0], lines[1], '…', lines[lines.length - 2], lines[lines.length - 1]].join('\n'),
    );
  });

  it('leaves a short key whole, like the ECDSA public key (two lines)', async () => {
    const pem = await exportPem((await generateSigningKeys()).publicKey);
    expect(pem.split('\n')).toHaveLength(4);
    expect(abbreviatePem(pem)).toBe(pem);
  });
});

describe('isCryptoAvailable', () => {
  it('only with a secure context and crypto.subtle', () => {
    expect(isCryptoAvailable({ isSecureContext: true, crypto: globalThis.crypto })).toBe(true);
    expect(isCryptoAvailable({ isSecureContext: false, crypto: globalThis.crypto })).toBe(false);
    expect(isCryptoAvailable({ isSecureContext: true, crypto: undefined })).toBe(false);
  });
});
