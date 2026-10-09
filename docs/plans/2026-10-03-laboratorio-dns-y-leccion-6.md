# Plan corto: laboratorio `dns-lookup` y lección 6, «DNS»

**Objetivo:** escribir en español la lección `phase-0/dns` con su laboratorio `dns-lookup`, que hace consultas DNS reales desde el navegador y reconstruye el recorrido resolver → raíz → TLD → autoritativo.

**Spec:** `docs/specs/2026-10-02-web-fase-0-design.md`, §6.4 (`dns-lookup`). **Patrón de playground:** `docs/style-guide.md`, «Playgrounds», el mismo que `tcp-handshake`.

**Origen:** el autor pidió «haz la lección 6, 7 y 8» sin parar entre medias. Las decisiones de diseño que el spec no fija están abajo y en `docs/pendientes.md`, para que el autor las revise.

**Restricciones:** sin commits. Toda salida de terminal sale de una ejecución real, y los datos personales se sustituyen (la dirección del resolver del operador). Sin pestaña de Windows; `nslookup` se menciona en el texto.

## Comprobaciones previas (2026-10-03, macOS)

- **CORS:** `https://cloudflare-dns.com/dns-query` (con `accept: application/dns-json`) y `https://dns.google/resolve` responden al navegador desde `localhost:4321`. **No hace falta proxy** ni datos grabados en la web: el punto de parada del spec no se activa.
- **Respuestas de Cloudflare:**
  - la raíz llega con `name: ""`;
  - Google añade el punto final (`example.com.`);
  - `Status` 0 es NOERROR, 2 es SERVFAIL y 3 es NXDOMAIN;
  - un NODATA es `Status` 0 sin `Answer` (`github.com AAAA`).
- **Zonas:**
  - `NS www.example.com` → sin `Answer` (no es zona);
  - `NS www.github.com` → el CNAME y los NS de `github.com` (no es zona: hay que comparar el nombre exacto);
  - `NS co.uk` → sí es zona.
- **Respuestas grabadas** para los tests en `web/src/playgrounds/dns-lookup/fixtures.ts`: 12 consultas reales (example.com, www.github.com, gmail.com MX, un NXDOMAIN y un NODATA).
- **`dig` 9.10.6 en macOS:**
  - `dig example.com`, `+short`, `gmail.com MX`, `example.com TXT` y `www.github.com` (CNAME) dan las salidas que cita la lección;
  - `dig +trace +nodnssec example.com` da cuatro saltos: raíz, `.com`, los servidores de Cloudflare y la respuesta;
  - el TTL baja en la caché del resolver: de 294 a 288 en 6 segundos.
  - La línea `SERVER` muestra el resolver IPv6 del operador: se sustituye por `2001:db8::53`.

## Diseño del laboratorio (decisiones de este plan)

- **Formulario:** dominio (texto) y tipo (A, AAAA, CNAME, MX, TXT o NS), con el botón «Consultar».
  - Si el lector pega una URL entera (`https://example.com/ruta`), se queda con el nombre: es lo que haría un dev frontend.
  - Los dominios con tildes o eñes se pasan a su forma ASCII (*punycode*) con `new URL`.
- **Datos reales:** una consulta del tipo pedido más una consulta NS por cada sufijo del nombre (`.`, `com`, `example.com`…), todas a la vez y a Cloudflare (1.1.1.1).
  - Un sufijo es zona si su respuesta NS trae registros NS **con ese mismo nombre**.
  - El recorrido son esas zonas, de la raíz hacia abajo.
- **El recorrido, paso a paso** (botón «Siguiente paso» y «Ver todo»):
  1. tu ordenador pregunta al resolver;
  2. el resolver pregunta a la raíz, que lo deriva a la zona siguiente;
  3. … cada zona deriva a la siguiente;
  4. la última zona responde: los registros, «no existe» (NXDOMAIN), «existe, pero no tiene registros de ese tipo» (NODATA) o un error;
  5. el resolver te responde y lo guarda en caché durante el TTL.
- **Honestidad didáctica (siempre visible):** «Tu resolver ya hizo este recorrido, o lo tenía en caché. Aquí lo reconstruimos preguntándole quién lleva cada nivel. `dig +trace` lo hace de verdad.»
- **Errores visibles:** sin conexión (`navigator.onLine` falso), el resolver no responde (8 s) y error del resolver (HTTP no OK, JSON raro o SERVFAIL).
- **Ficheros** (`web/src/playgrounds/dns-lookup/`):
  - `dns.ts`: lógica pura, con tests (`parseDomain`, `normalizeName`, `suffixes`, `parseDohJson`, `buildPath`, `interpret` y `explain`);
  - `resolver.ts`: las consultas, con `fetch` inyectable y tests con las respuestas grabadas;
  - `strings.ts` (es/en), `DnsLookup.tsx` y `dns-lookup.css`.

## Lección

- **Frontmatter:** `sidebar.order: 6` y `prerequisites: [phase-0/tcp-vs-udp]`.
- **El problema:** las personas usamos nombres y la red usa IPs (lección 4), y las IPs cambian. Una lista central con todos los nombres no escala (fue `HOSTS.TXT`, en los 70 y 80): hace falta una base de datos repartida.
- **La analogía:** preguntar una dirección en una ciudad que no conoces, a través de la recepción del hotel (resolver) y de oficinas cada vez más locales. Dónde falla: la caché, los TTL, que nadie lo sabe todo, y que el resolver hace él solo todo el recorrido.
- **Cómo funciona de verdad:**
  - los nombres son un árbol que se lee de derecha a izquierda (con el punto final);
  - servidores raíz, de TLD y autoritativos;
  - el resolver recursivo y su caché;
  - los registros A, AAAA, CNAME, MX, TXT y NS;
  - el TTL y la «propagación»;
  - DNS va sobre UDP, puerto 53 (lección 5), y también existe sobre HTTPS (DoH), que es lo que usa el laboratorio.
- **Pruébalo:** el laboratorio; `dig example.com` anotado; `dig +short` y los tipos (MX de gmail.com, TXT de example.com y el CNAME de `www.github.com`); `dig +trace +nodnssec`; el TTL que baja.
- **Ya lo has visto:**
  - `ERR_NAME_NOT_RESOLVED`;
  - *DNS Lookup* en *Timing*;
  - «añade un registro CNAME» al conectar un dominio en Vercel o Netlify;
  - `/etc/hosts` para nombres locales.
- **Errores comunes:**
  - «los cambios de DNS tardan 48 horas»;
  - «DNS solo traduce nombres a IPs»;
  - «nadie ve qué webs visito si uso HTTPS» (las consultas DNS clásicas van sin cifrar).
- **Cierre:** resumen, 3 `<SelfCheck>` y enlaces (Cloudflare Learning en español y RFC 1034).

## Verificación

1. Tests de `dns.ts` y `resolver.ts` en rojo y luego en verde; `pnpm test`, `pnpm check`, `pnpm build` y `pnpm format:check` en verde.
2. Laboratorio en el navegador:
   - example.com A, www.github.com A (CNAME), gmail.com MX, un dominio inexistente y github.com AAAA (NODATA);
   - una URL pegada;
   - teclado, foco, árbol de accesibilidad, claro y oscuro, 1280 y 375 px y movimiento reducido;
   - sin conexión (Playwright *offline*).
3. Entre 10 y 15 minutos de lectura y ninguna palabra prohibida.
4. Revisión técnica independiente de la lección y de los textos del laboratorio, con las correcciones aplicadas.
