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
  it('codifica bytes y los recupera', () => {
    expect(toBase64(new Uint8Array([104, 111, 108, 97]))).toBe('aG9sYQ==');
    expect([...fromBase64('aG9sYQ==')]).toEqual([104, 111, 108, 97]);
    expect([...fromBase64(toBase64(new Uint8Array([0, 1, 255])))]).toEqual([0, 1, 255]);
  });
});

describe('cifrado con RSA-OAEP', () => {
  it('lo que cifra la clave pública lo descifra la privada', async () => {
    const keys = await generateEncryptionKeys();
    const encrypted = await encrypt(keys.publicKey, 'Hola, servidor');
    expect(await decrypt(keys.privateKey, encrypted)).toBe('Hola, servidor');
  });

  it('el texto cifrado ocupa 256 bytes y no deja ver el original', async () => {
    const keys = await generateEncryptionKeys();
    const encrypted = await encrypt(keys.publicKey, 'Hola, servidor');
    expect(fromBase64(encrypted)).toHaveLength(256);
    expect(encrypted).not.toContain('Hola');
  });

  it('cifrar dos veces lo mismo da resultados distintos (OAEP añade azar)', async () => {
    const keys = await generateEncryptionKeys();
    const first = await encrypt(keys.publicKey, 'Hola, servidor');
    const second = await encrypt(keys.publicKey, 'Hola, servidor');
    expect(first).not.toBe(second);
    expect(await decrypt(keys.privateKey, second)).toBe('Hola, servidor');
  });

  it('otra clave privada no puede descifrarlo', async () => {
    const keys = await generateEncryptionKeys();
    const other = await generateEncryptionKeys();
    const encrypted = await encrypt(keys.publicKey, 'Hola, servidor');
    await expect(decrypt(other.privateKey, encrypted)).rejects.toThrow();
  });

  it('cifra como mucho 190 bytes de una vez: 2048 bits de clave, menos lo que ocupa OAEP con SHA-256', async () => {
    const { publicKey, privateKey } = await generateEncryptionKeys();
    const justFits = 'a'.repeat(190);
    expect(await decrypt(privateKey, await encrypt(publicKey, justFits))).toBe(justFits);
    await expect(encrypt(publicKey, 'a'.repeat(191))).rejects.toThrow();
    // Se cuentan bytes, no letras: «é» ocupa dos en UTF-8.
    await expect(encrypt(publicKey, 'é'.repeat(96))).rejects.toThrow();
  });

  it('admite tildes y emojis, porque cifra los bytes en UTF-8', async () => {
    const keys = await generateEncryptionKeys();
    const text = 'Señor del ñandú 🔐';
    expect(await decrypt(keys.privateKey, await encrypt(keys.publicKey, text))).toBe(text);
  });
});

describe('firma con ECDSA', () => {
  it('la clave privada no se puede exportar: aquí nunca se enseña, así que no hace falta', async () => {
    const { publicKey, privateKey } = await generateSigningKeys();
    expect(privateKey.extractable).toBe(false);
    await expect(exportPem(privateKey)).rejects.toThrow();
    // La pública sí: es la que se enseña.
    expect(await exportPem(publicKey)).toMatch(/^-----BEGIN PUBLIC KEY-----/);
  });

  it('una firma hecha con la clave privada se verifica con la pública', async () => {
    const keys = await generateSigningKeys();
    const signature = await sign(keys.privateKey, 'Transfiere 10 € a Ana');
    expect(await verify(keys.publicKey, 'Transfiere 10 € a Ana', signature)).toBe(true);
  });

  it('la firma ocupa 64 bytes', async () => {
    const keys = await generateSigningKeys();
    expect(fromBase64(await sign(keys.privateKey, 'Transfiere 10 € a Ana'))).toHaveLength(64);
  });

  it('si cambia el mensaje, la firma deja de valer', async () => {
    const keys = await generateSigningKeys();
    const signature = await sign(keys.privateKey, 'Transfiere 10 € a Ana');
    expect(await verify(keys.publicKey, 'Transfiere 1000 € a Ana', signature)).toBe(false);
  });

  it('la clave pública de otro par no la verifica', async () => {
    const keys = await generateSigningKeys();
    const other = await generateSigningKeys();
    const signature = await sign(keys.privateKey, 'Transfiere 10 € a Ana');
    expect(await verify(other.publicKey, 'Transfiere 10 € a Ana', signature)).toBe(false);
  });

  it('una firma que ni siquiera es Base64 no es válida, y no rompe nada', async () => {
    const keys = await generateSigningKeys();
    expect(await verify(keys.publicKey, 'Transfiere 10 € a Ana', 'esto no es base64!')).toBe(false);
  });
});

describe('PEM', () => {
  it('exporta la clave pública (SPKI) y la privada (PKCS #8) en líneas de 64 caracteres', async () => {
    const keys = await generateEncryptionKeys();
    const publicPem = await exportPem(keys.publicKey);
    const privatePem = await exportPem(keys.privateKey);
    expect(publicPem.split('\n')[0]).toBe('-----BEGIN PUBLIC KEY-----');
    expect(publicPem.trimEnd().split('\n').at(-1)).toBe('-----END PUBLIC KEY-----');
    expect(privatePem.split('\n')[0]).toBe('-----BEGIN PRIVATE KEY-----');
    const body = publicPem.split('\n').slice(1, -1);
    expect(body.slice(0, -1).every((line) => line.length === 64)).toBe(true);
  });

  it('abrevia una clave larga: la cabecera, la primera línea, «…», la última y el pie', async () => {
    const pem = await exportPem((await generateEncryptionKeys()).publicKey);
    const lines = pem.split('\n');
    expect(abbreviatePem(pem)).toBe(
      [lines[0], lines[1], '…', lines[lines.length - 2], lines[lines.length - 1]].join('\n'),
    );
  });

  it('deja entera una clave corta, como la pública de ECDSA (dos líneas)', async () => {
    const pem = await exportPem((await generateSigningKeys()).publicKey);
    expect(pem.split('\n')).toHaveLength(4);
    expect(abbreviatePem(pem)).toBe(pem);
  });
});

describe('isCryptoAvailable', () => {
  it('solo con un contexto seguro y crypto.subtle', () => {
    expect(isCryptoAvailable({ isSecureContext: true, crypto: globalThis.crypto })).toBe(true);
    expect(isCryptoAvailable({ isSecureContext: false, crypto: globalThis.crypto })).toBe(false);
    expect(isCryptoAvailable({ isSecureContext: true, crypto: undefined })).toBe(false);
  });
});
