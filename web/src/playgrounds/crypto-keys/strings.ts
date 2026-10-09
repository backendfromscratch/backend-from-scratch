/** Textos del playground crypto-keys en los dos idiomas. Los huecos {así} se rellenan en CryptoKeys.tsx. */
import type { Locale } from '../../lib/locales';

const es = {
  title: 'playground · criptografía real',
  unavailable:
    'Este playground necesita la Web Crypto API, y el navegador solo la ofrece en páginas seguras: con HTTPS o en localhost. Esta página no lo es.',
  encryptTitle: 'Cifrar: lo que cierra la clave pública, solo lo abre la privada',
  encryptIntro:
    'Claves RSA de 2048 bits (RSA-OAEP), generadas en tu navegador con la Web Crypto API. No salen de esta página.',
  generate: 'Generar par de claves',
  publicKey: 'Clave pública',
  privateKey: 'Clave privada',
  privateWarning:
    'En la vida real, la clave privada nunca sale de su dueño. Aquí la ves porque es un ejemplo.',
  showFull: 'Ver entera',
  message: 'Mensaje',
  defaultMessage: 'Hola, servidor',
  encrypt: 'Cifrar con la clave pública',
  ciphertext: 'Mensaje cifrado ({bytes} bytes, en Base64)',
  ciphertextNote:
    'Si lo cifras otra vez, sale distinto: RSA-OAEP añade azar, para que nadie pueda adivinar el mensaje cifrando candidatos y comparando.',
  tooLong:
    'El mensaje es demasiado largo: con esta clave, RSA solo cifra unos 190 bytes de una vez. Por eso TLS no cifra los datos así, sino con una clave simétrica.',
  decrypt: 'Descifrar con la clave privada',
  decrypted: 'Mensaje descifrado',
  wrongKey: 'Descifrar con otra clave privada',
  wrongKeyFailed:
    'No se puede: esa clave privada no es la pareja de la pública que cifró el mensaje. El navegador solo responde con un error, sin pistas.',
  signTitle: 'Firmar: lo que firma la clave privada, cualquiera lo comprueba con la pública',
  signIntro: 'ECDSA con la curva P-256, el mismo tipo de clave que el certificado de example.com.',
  toSign: 'Mensaje que firmas',
  defaultToSign: 'Transfiere 10 € a Ana',
  sign: 'Firmar con la clave privada',
  signature: 'Firma ({bytes} bytes, en Base64)',
  received: 'Mensaje recibido (cámbialo si quieres)',
  verify: 'Verificar con la clave pública',
  valid:
    'Firma válida: el mensaje es exactamente el que se firmó, y lo firmó la clave privada de este par.',
  invalid:
    'Firma no válida: el mensaje ha cambiado desde que se firmó, o no lo firmó la clave privada de este par.',
  keysReady: 'Par de claves generado.',
  encrypted: 'Mensaje cifrado: {bytes} bytes.',
  decryptedAnnounce: 'Mensaje descifrado: «{text}».',
  signed: 'Mensaje firmado. La firma ocupa {bytes} bytes.',
  generating: 'Generando el par de claves… En un móvil puede tardar unos segundos.',
  wait: 'Un momento: todavía estoy con lo anterior.',
  failed: 'Algo ha fallado en el navegador y no se ha podido hacer. Vuelve a intentarlo.',
};

export type Strings = typeof es;

const en: Strings = {
  title: 'playground · real cryptography',
  unavailable:
    'This playground needs the Web Crypto API, and browsers only offer it on secure pages: over HTTPS or on localhost. This page is neither.',
  encryptTitle: 'Encrypt: what the public key locks, only the private key opens',
  encryptIntro:
    '2048-bit RSA keys (RSA-OAEP), generated in your browser with the Web Crypto API. They never leave this page.',
  generate: 'Generate key pair',
  publicKey: 'Public key',
  privateKey: 'Private key',
  privateWarning:
    'In real life the private key never leaves its owner. You can see it here because this is an example.',
  showFull: 'Show full key',
  message: 'Message',
  defaultMessage: 'Hello, server',
  encrypt: 'Encrypt with the public key',
  ciphertext: 'Encrypted message ({bytes} bytes, in Base64)',
  ciphertextNote:
    'Encrypt it again and you get something different: RSA-OAEP adds randomness, so nobody can guess the message by encrypting candidates and comparing.',
  tooLong:
    'The message is too long: with this key, RSA can only encrypt about 190 bytes at once. That is why TLS encrypts data with a symmetric key instead.',
  decrypt: 'Decrypt with the private key',
  decrypted: 'Decrypted message',
  wrongKey: 'Decrypt with another private key',
  wrongKeyFailed:
    'That doesn’t work: this private key doesn’t match the public key that encrypted the message. The browser just throws an error, with no hints.',
  signTitle: 'Sign: what the private key signs, anyone can check with the public key',
  signIntro: 'ECDSA on the P-256 curve, the same kind of key as example.com’s certificate.',
  toSign: 'Message you sign',
  defaultToSign: 'Send 10 € to Ana',
  sign: 'Sign with the private key',
  signature: 'Signature ({bytes} bytes, in Base64)',
  received: 'Received message (edit it if you like)',
  verify: 'Verify with the public key',
  valid:
    'Valid signature: the message is exactly the one that was signed, and it was signed with the private key that matches this public key.',
  invalid:
    'Invalid signature: the message has changed since it was signed, or it wasn’t signed with the private key that matches this public key.',
  keysReady: 'Key pair generated.',
  encrypted: 'Message encrypted: {bytes} bytes.',
  decryptedAnnounce: 'Message decrypted: “{text}”.',
  signed: 'Message signed. The signature is {bytes} bytes long.',
  generating: 'Generating the key pair… On a phone it can take a few seconds.',
  wait: 'One moment: I’m still on the previous step.',
  failed: 'Something failed in the browser and it couldn’t be done. Try again.',
};

export const strings: Record<Locale, Strings> = { es, en };
