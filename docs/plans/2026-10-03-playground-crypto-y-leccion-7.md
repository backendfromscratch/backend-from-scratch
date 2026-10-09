# Plan corto: playground `crypto-keys` y lección 7, «TLS y HTTPS»

**Objetivo:** escribir en español la lección `phase-0/tls-https`, con criptografía de clave pública y privada, y su playground `crypto-keys` (nivel 2): criptografía real en el navegador con la Web Crypto API.

**Spec:** `docs/specs/2026-10-02-web-fase-0-design.md`, §6.4 (`crypto-keys`). **Patrón:** `docs/style-guide.md`, «Playgrounds».

**Origen:** el autor pidió «haz la lección 6, 7 y 8» y «no me preguntes nada». Las decisiones que el spec no fija están aquí y en `docs/pendientes.md`.

**Restricciones:** sin commits. Salidas reales; los datos personales, sustituidos. Sin pestaña de Windows.

## Comprobaciones previas (2026-10-03, macOS)

- **`openssl`:** el de serie en macOS es LibreSSL 3.3.6 (`/usr/bin/openssl`), y no tiene `-brief`; aquí hay además un OpenSSL 3.6.5 de Homebrew. Los ejercicios usan opciones que tienen los dos:
  - `openssl s_client -connect example.com:443 -servername example.com </dev/null` → la cadena de certificados (en LibreSSL, hasta `AAA Certificate Services`, profundidad 4), `Protocol: TLSv1.3`, `Cipher: AEAD-CHACHA20-POLY1305-SHA256` y `Verify return code: 0 (ok)`;
  - `… | openssl x509 -noout -subject -issuer -dates` → `CN=example.com`, emitido por `Cloudflare TLS Issuing ECC CA 3`, válido del 26 de septiembre al 25 de diciembre de 2026 (unos 90 días). El formato de `subject=` cambia un poco entre LibreSSL y OpenSSL.
- **`curl -sv -o /dev/null https://example.com`** (curl 8.7.1 con LibreSSL) → el bloque `Server certificate` con `subject`, `start date`, `expire date`, `subjectAltName … matched`, `issuer` y `SSL certificate verify ok.`
- **Errores de certificado (badssl.com),** todos con el código 60 de curl:
  - `curl https://expired.badssl.com/` → `SSL certificate problem: certificate has expired`;
  - `curl https://wrong.host.badssl.com/` → `SSL: no alternative certificate subject name matches target host name 'wrong.host.badssl.com'`;
  - `curl https://self-signed.badssl.com/` → `SSL certificate problem: self signed certificate`.
- **OpenSSL 3** negocia con example.com el grupo `X25519MLKEM768`, un intercambio de claves híbrido resistente a ordenadores cuánticos. Se menciona en una frase, como curiosidad.
- **Web Crypto en Node 22:** `globalThis.crypto.subtle` existe, así que los tests de la lógica usan criptografía real, sin simulaciones.

## Diseño del playground (decisiones de este plan)

Dos partes, una debajo de otra, en el mismo panel:

1. **Cifrar (RSA-OAEP, 2048 bits, SHA-256):**
   - «Generar par de claves» muestra la clave pública y la privada en PEM, abreviadas (primera línea, `…` y la última) y desplegables enteras. La privada lleva el aviso «en la realidad, nunca sale de su dueño».
   - Un mensaje editable («Hola, servidor»).
   - «Cifrar con la clave pública» muestra el texto cifrado en Base64 (256 bytes) y avisa de que, si lo cifras otra vez, sale distinto (OAEP añade azar).
   - «Descifrar con la clave privada» devuelve el mensaje.
   - «Descifrar con otra clave privada» genera un par nuevo, lo intenta y muestra el error: solo la pareja de la clave pública puede descifrar.
2. **Firmar (ECDSA P-256, SHA-256):**
   - «Generar par de claves» muestra la pública.
   - Un mensaje («Transfiere 10 € a Ana») y «Firmar con la clave privada», que da la firma en Base64 (64 bytes).
   - Un «Mensaje recibido», editable, que empieza siendo una copia del firmado, y «Verificar con la clave pública», que dice «Firma válida» o «Firma no válida». Si cambias «10» por «1000», la verificación falla.
3. **Contexto seguro:** si la página no es segura (`isSecureContext` falso o sin `crypto.subtle`), el playground lo dice en lugar de los botones: la Web Crypto API solo funciona con HTTPS o en `localhost`. La lección lo usa como ejemplo.

**Ficheros** (`web/src/playgrounds/crypto-keys/`):
- `crypto.ts`: lógica con tests, sobre Web Crypto real (generar, exportar a PEM, cifrar, descifrar, firmar, verificar, Base64 y abreviar);
- `strings.ts` (es/en), `CryptoKeys.tsx` y `crypto-keys.css`.

## Lección

- **Frontmatter:** `sidebar.order: 7` y `prerequisites: [phase-0/dns]`.
- **El problema:** HTTP viaja sin cifrar (la postal de la lección 3). Cualquiera en el camino puede leerlo y cambiarlo, y nada garantiza que hables con el example.com de verdad. Hacen falta confidencialidad, integridad y autenticidad.
- **La analogía:** candados abiertos que repartes (clave pública) y la única llave que los abre (privada); un sello de lacre (firma); y un DNI expedido por la policía (certificado de una autoridad certificadora). Dónde falla.
- **Cómo funciona de verdad:**
  - criptografía simétrica, y el problema de compartir la clave;
  - asimétrica: cifrar con la pública y firmar con la privada;
  - TLS combina las dos: un intercambio de claves (Diffie-Hellman) para acordar una clave simétrica sin enviarla, la firma del servidor para demostrar quién es, y la clave simétrica para los datos. Sin decir que «el navegador cifra la clave con la pública del servidor», que era el TLS antiguo (RSA) y TLS 1.3 ya no permite;
  - certificados, cadena y almacén de confianza;
  - el handshake de TLS 1.3 (un viaje de ida y vuelta, con SNI);
  - qué protege HTTPS y qué no.
- **Pruébalo:** el playground; `curl -v` con el certificado; `openssl s_client` con la cadena; los tres errores de badssl.com.
- **Ya lo has visto:**
  - «No es seguro» en la barra de direcciones;
  - `NET::ERR_CERT_DATE_INVALID`, `ERR_CERT_COMMON_NAME_INVALID` y `ERR_CERT_AUTHORITY_INVALID`;
  - `crypto.subtle` es `undefined` en una web `http://` que no es `localhost`;
  - el contenido mixto.
- **Errores comunes:**
  - «el candado significa que la web es de fiar»;
  - «HTTPS oculta qué webs visito»;
  - «cifrar y firmar son lo mismo»;
  - «HTTPS hace la web lenta».
- **Cierre:** resumen, 3 `<SelfCheck>` y enlaces (Cloudflare Learning, MDN Web Crypto y RFC 8446).

## Verificación

1. Tests de `crypto.ts` en rojo y luego en verde, con criptografía real. Suite, tipos, build y formato en verde.
2. Playground en el navegador: cifrar, descifrar, la otra clave, firmar, verificar y alterar el mensaje; teclado, árbol de accesibilidad, claro y oscuro y 375 px. Y el aviso sin contexto seguro (con la página servida por la IP de la red local, que no es `localhost`).
3. Entre 10 y 15 minutos de lectura y ninguna palabra prohibida.
4. Revisión técnica independiente, con las correcciones aplicadas.
