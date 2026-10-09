# Plan corto: lección «IP, puertos y sockets» (Fase 0, lección 4)

**Objetivo:** escribir en español la lección `phase-0/ip-ports-sockets`, con NAT y routing, y crear el diagrama propio `NatTranslation`. La traducción al inglés se hará cuando el autor la apruebe.

**Spec:** `docs/specs/2026-10-02-web-fase-0-design.md`:
- §6.1: NAT y routing entran en esta lección;
- §6.3: IP privada frente a IP pública, `lsof` y `traceroute`, nivel 1;
- §5.5: NAT es uno de los diagramas que Mermaid no dibuja bien, así que es un componente propio.

**Plantilla y voz:** `docs/style-guide.md`.

**Restricciones:** sin commits. Toda salida de terminal sale de una ejecución real; los datos personales se sustituyen por valores de ejemplo de los rangos de documentación (`203.0.113.0/24`, `198.51.100.0/24` y `2001:db8::/32`) y se avisa. Sin pestaña de Windows, porque la decisión está pendiente (`docs/pendientes.md`).

## Promesas de lecciones anteriores

- **Lección 1:** por qué `curl localhost:8080` falló con `::1` y funcionó con `127.0.0.1`. Respuesta: `nc -l 8080` escucha solo en IPv4 (`lsof` lo muestra como `IPv4 … *:8080`).
- **Lección 3:** por qué existen las IP privadas, cómo se sale a internet con ellas y qué es NAT.

## Decisiones

- **`curl -4 icanhazip.com` en lugar de `curl ifconfig.me`.**
  - `ifconfig.me` no termina su respuesta en salto de línea, y zsh pinta un `%` al final.
  - Sin `-4`, en una red con IPv6 devuelve la IPv6, y el ejercicio de NAT deja de tener sentido.
  - `icanhazip.com` lo mantiene Cloudflare y responde por IPv4 y por IPv6.
- **`lsof -nP -iTCP -sTCP:LISTEN` en lugar de `lsof -i -P | grep LISTEN`.** Con `-n` se ven las direcciones en número (`127.0.0.1`, `[::1]`, `*`), que es justo lo que explica la lección, y se conserva la fila de cabecera para explicar las columnas.
- **El diagrama de NAT es HTML y CSS, no SVG**, por la misma razón que `Encapsulation`: en móvil, el texto conserva su tamaño.

## Comprobaciones previas (hechas el 2026-10-02, macOS)

- `ipconfig getifaddr en0` devuelve la IP privada (`192.168.1.133`).
- `curl -4 icanhazip.com` devuelve una IPv4 pública que no está en ninguna interfaz del portátil (hay NAT) y no está en el rango de CGNAT.
- `curl -6 icanhazip.com` devuelve una IPv6 que **sí** es una de las direcciones de `en0` (`autoconf temporary`): con IPv6 no hay NAT.
- `route -n get default` muestra `gateway: 192.168.1.1` e `interface: en0`.
- `nc -l 8080` + `lsof -nP -i :8080` muestra `TCP *:8080 (LISTEN)` de tipo IPv4. Al conectar `nc localhost 8080` aparecen dos sockets más, `127.0.0.1:8080->127.0.0.1:49419` y su contrario, los dos `ESTABLISHED`. El socket que escucha sigue abierto.
- El servidor de desarrollo de Astro escucha en `[::1]:4321`: `curl http://localhost:4321` responde y `curl http://127.0.0.1:4321` da «Connection refused».
- `traceroute -n example.com` llega en 9 saltos; los saltos 2 a 5 son IP privadas del operador y el 6 es su IP pública (se sustituye por una de ejemplo).
- Rango de puertos efímeros de macOS: `49152`–`65535`. En macOS, un usuario normal puede escuchar en el puerto 80.
- Node 22 escribe `Error: listen EADDRINUSE: address already in use :::3000`. Vite 8 escribe `Network: use --host to expose`. Node 22 ya no falla al hacer `fetch` a `localhost` contra un servidor solo IPv4 (prueba las dos familias), así que ese error no se cita.
- Enlaces verificados (200): Cloudflare Learning, «¿Qué es el enrutamiento?» (es/en, en un navegador); RFC 1918; Beej's Guide to Network Programming.

## Ficheros

- **Crear:**
  - `web/src/components/diagrams/NatTranslation.astro`
  - `web/src/content/docs/es/phase-0/ip-ports-sockets.mdx`
  - `web/src/content/glossary/es/{private-ip,public-ip,nat,routing,gateway,socket}.yaml`
- **Modificar:**
  - `web/src/content/docs/es/phase-0/index.mdx`, para enlazar la lección 4;
  - `web/src/content/glossary/es/{ip-address,port}.yaml`, con los términos relacionados nuevos;
  - `docs/style-guide.md`, con el componente nuevo;
  - `docs/pendientes.md`, con la revisión de la lección 4.

## Contenido

- **Frontmatter:** `sidebar.order: 4` y `prerequisites: [phase-0/tcp-ip-model]`.
- **El problema:** tu IP es privada y la de tu amigo puede ser la misma. Entonces, ¿cómo te encuentra la respuesta de example.com? ¿Por qué camino llega? ¿Y a qué programa de tu ordenador se entrega? Tres preguntas: qué ordenador, por dónde y qué programa.
- **La analogía:** un edificio de oficinas con una sola dirección postal y una recepción que apunta las cartas que salen. Dónde falla:
  - recepción tira las cartas que no son respuesta a nada;
  - el cliente estrena un buzón (puerto efímero) en cada conversación;
  - la libreta se borra sola;
  - con IPv6 cada despacho tiene su propia dirección.
- **Cómo funciona de verdad:**
  - Direcciones IP: IPv4 (32 bits, se agotaron en 2011), privadas y públicas, `127.0.0.1`; IPv6 (128 bits, `::`, `::1`).
  - NAT, con el componente `NatTranslation` (4 tramos y la tabla del router); qué pasa con una conexión que llega de fuera; CGNAT en una frase; IPv6 sin NAT.
  - Routing: la tabla de rutas de tu portátil (simplificada), la puerta de enlace, cada router solo decide el siguiente salto, el TTL.
  - Puertos: 16 bits, rangos de IANA, por qué 80 y 443 (el puerto por defecto de la URL), los puertos efímeros.
  - Sockets: escuchar y conversar; la conexión identificada por cuatro valores; en qué dirección escucha un servidor (`127.0.0.1`, `::1`, `0.0.0.0`, `::`). Aquí se cierra la promesa de la lección 1.
- **Pruébalo:**
  1. `ipconfig getifaddr en0`, `curl -4 icanhazip.com` y `curl -6 icanhazip.com`;
  2. `nc -l 8080` y `lsof -nP -iTCP -sTCP:LISTEN`;
  3. `nc localhost 8080` y `lsof -nP -i :8080`: una conversación, tres sockets;
  4. `traceroute -n example.com`.
- **Ya lo has visto:**
  - *Remote Address* en DevTools;
  - `Network: use --host to expose` de Vite;
  - `EADDRINUSE … :::3000`;
  - `localhost` funciona y `127.0.0.1` no.
- **Errores comunes:**
  - «mi IP es 192.168.1.133»;
  - «localhost, 127.0.0.1 y 0.0.0.0 son lo mismo»;
  - «un puerto solo admite una conexión»;
  - «un socket es un WebSocket».
- **Cierre:** resumen, 3 `<SelfCheck>` y tres enlaces.

## Verificación

1. `pnpm test`, `pnpm check` y `pnpm build` en verde, con todos los enlaces válidos.
2. Los comandos se repiten tal como se copian de la web (atributo `data-code`).
3. `NatTranslation` en modo claro y oscuro y a 375 px: el texto se lee, la página no tiene scroll horizontal y el campo que cambia el router se distingue sin depender solo del color.
4. Entre 10 y 15 minutos de lectura y ninguna palabra prohibida.
5. Una revisión técnica independiente de la lección, con las correcciones aplicadas.
