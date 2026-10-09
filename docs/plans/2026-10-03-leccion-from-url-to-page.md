# Plan corto: lección 8, «De la URL a la página»

**Objetivo:** la lección que cierra la Fase 0 y une todas las anteriores. Cuenta qué pasa desde que escribes una URL y pulsas Enter (DNS → TCP → TLS → HTTP → servidor → respuesta → navegador) y cuánto cuesta cada paso. Nivel 1 (terminal), sin playground nuevo.

**Spec:** `docs/specs/2026-10-02-web-fase-0-design.md`, §6.3: `curl -w` con el desglose de tiempos (DNS, TCP, TLS, primer byte y total), comparado con la pestaña *Timing* de DevTools.

**Origen:** el autor pidió «haz la lección 6, 7 y 8» sin preguntas. Restricciones de siempre: sin commits y salidas reales.

## Comprobaciones previas (2026-10-03, macOS)

- **`curl -w` da tiempos acumulados desde el principio,** no la duración de cada fase. Hay que restar: TCP = `time_connect` − `time_namelookup`, y así con el resto.
- **example.com (Cloudflare, cerca):**
  - 1.ª ejecución: dns 0,025 s, tcp 0,031, tls 0,042, primer byte 0,071, total 0,071;
  - 2.ª: dns 0,003 (caché del sistema), tcp 0,008, tls 0,019, primer byte 0,030, total 0,030.
  - Con `-w '%{http_version}'` sale `2`: HTTP/2, acordado con ALPN dentro de TLS.
- **www.gov.za** (Johannesburgo, AS3741): dns 0,003, tcp 0,205, tls 0,420, primer byte 0,653, total 1,058 s. Unos 200 ms de ida y vuelta: TCP y TLS cuestan un viaje cada uno.
- **Enlaces (200):** MDN «How browsers work» (solo en inglés), web.dev «Time to First Byte» (en inglés) y MDN `rel=preconnect` (en inglés).

## Contenido

- **Frontmatter:** `sidebar.order: 8` y `prerequisites: [phase-0/tls-https]`.
- **El problema:** la pregunta clásica de las entrevistas, y la práctica: cuando una web va lenta, ¿dónde se va el tiempo?
- **La analogía:** pedir algo a una tienda lejana (buscar la dirección, llamar, identificarse, pedir, que lo preparen, que llegue, montarlo). Dónde falla: las cachés y las conexiones reutilizadas se saltan pasos, y el navegador pide muchas cosas a la vez.
- **Cómo funciona de verdad:** el recorrido paso a paso, enlazando cada lección (URL y puerto, DNS, TCP, TLS, HTTP, el servidor, la respuesta y el navegador), con un diagrama de secuencia; el RTT como unidad de coste (al menos tres viajes antes del primer byte en una conexión nueva); y lo que lo acelera (cachés, reutilizar conexiones, CDN, HTTP/3).
- **Pruébalo:** `curl -w` con example.com dos veces; el mismo comando con www.gov.za; y compararlo con *Timing* en DevTools.
- **Ya lo has visto:**
  - *Timing* fase a fase;
  - `<link rel="preconnect">` y `dns-prefetch`;
  - TTFB en Lighthouse.
- **Errores comunes:**
  - «si va lenta, es culpa del servidor»;
  - «con más ancho de banda irá más rápido»;
  - «cada recurso abre una conexión nueva».
- **Cierre:** resumen (que cierra la fase), 3 `<SelfCheck>` y enlaces.

## Verificación

`pnpm test`, `check`, `build` y `format:check` en verde; entre 10 y 15 minutos; ninguna palabra prohibida; revisión técnica independiente con las correcciones aplicadas.
