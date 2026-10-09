# Plan corto: lección «El modelo TCP/IP» (Fase 0, lección 3)

**Objetivo:** escribir en español la lección `phase-0/tcp-ip-model` y crear el primer diagrama propio, `Encapsulation`. La traducción al inglés se hará cuando el autor la apruebe.

**Spec:** `docs/specs/2026-10-02-web-fase-0-design.md`:
- §6.3: «Anotar por capas la salida de `curl -v`», nivel 1;
- §5.5: lo que Mermaid no dibuja bien se hace como componente propio, con los textos por props y los colores del tema.

**Plantilla y voz:** `docs/style-guide.md`.

**Restricciones:** sin commits. Toda salida de terminal sale de una ejecución real; los datos personales se sustituyen por valores de ejemplo y se avisa. Sin pestaña de Windows, porque la decisión está pendiente (`docs/pendientes.md`).

## Decisión de diseño

El diagrama de encapsulación se hace con **HTML y CSS (grid)**, no con SVG.

- **Por qué:** un SVG se encoge entero en pantallas estrechas. Es el problema que tuvo Mermaid: a 375 px el texto quedaba en unos 8 px. Con HTML y CSS el texto se queda a su tamaño, sale del tema (claro u oscuro), se traduce por props y los lectores de pantalla lo leen como texto.
- **Qué se mantiene de la spec:** componente propio, textos por props y colores del tema.

## Comprobaciones previas (hechas el 2026-10-02, macOS)

- `curl -v http://example.com` muestra:
  - la resolución del nombre (las IPv6 y las IPv4 de Cloudflare);
  - `Trying […]:80` y `Connected … port 80`;
  - `> GET` y `< HTTP/1.1 200 OK`;
  - `Connection #0 … left intact`, la conexión que se reutiliza, como en la lección 2.
- `curl -v https://example.com` muestra:
  - entre `Connected … port 443` y la petición, el handshake TLS;
  - después, `using HTTP/2` y las pseudo-cabeceras `:method`, `:path`…
- `ifconfig en0 | grep -E 'ether|inet '` muestra la dirección MAC (enlace) y la IP privada (red). En la lección, la MAC se sustituye por una de ejemplo.
- Enlaces verificados (200):
  - MDN, glosario «TCP» y «Dirección IP» (es/en);
  - Cloudflare Learning, «¿Qué es el modelo OSI?» (es/en, comprobado en un navegador porque bloquea a curl);
  - RFC 1122.

## Ficheros

- **Crear:**
  - `web/src/components/diagrams/Encapsulation.astro`
  - `web/src/content/docs/es/phase-0/tcp-ip-model.mdx`
  - `web/src/content/glossary/es/{layer,encapsulation,packet,ip-address,mac-address,router,tcp,tls,dns}.yaml`
- **Modificar:**
  - `web/src/content/docs/es/phase-0/index.mdx`, para enlazar la lección 3;
  - `docs/style-guide.md`, con la regla de datos personales y el componente de diagrama.

## Contenido

- **Frontmatter:** `sidebar.order: 3` y `prerequisites: [phase-0/protocols]`.
- **El problema:** entre tu texto HTTP y un servidor de Madrid hay que resolver muchas cosas: encontrar el ordenador, cruzar redes, no perder trozos, llegar al programa correcto y transmitir bits. Si HTTP lo hiciera todo, cada protocolo repetiría el trabajo. La solución es repartirlo en capas.
- **La analogía:** el correo postal (la carta, el sobre con el nombre, la dirección, los camiones). Dónde falla:
  - la etiqueta de la capa de enlace se cambia en cada salto;
  - los datos viajan troceados y pueden llegar desordenados;
  - todo pasa en milisegundos y casi todo lo hace el sistema operativo.
- **Cómo funciona de verdad:**
  - Las 4 capas: qué resuelve cada una, sus protocolos y quién la implementa (tu programa, el sistema operativo o la tarjeta de red).
  - La encapsulación, con el componente `Encapsulation`.
  - El nombre de la unidad en cada capa: mensaje, segmento, paquete y trama.
  - El viaje salto a salto, con un diagrama de flujo en Mermaid: los routers solo llegan hasta la capa de red.
  - OSI como referencia: tabla de equivalencias y el vocabulario «capa 4» y «capa 7».
- **Pruébalo:**
  1. `curl -v http://example.com`, anotado por capas;
  2. `curl -v https://example.com`, para ver que TLS va entre TCP y HTTP;
  3. `ifconfig en0`, con dos direcciones de dos capas.
- **Ya lo has visto:**
  - las fases de la pestaña *Timing* de DevTools;
  - los errores de Chrome por capa: `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`, `ERR_INTERNET_DISCONNECTED` y un `404`.
- **Errores comunes:**
  - «TCP/IP es un solo protocolo»;
  - «hay que memorizar las 7 capas de OSI»;
  - «los routers leen mi petición HTTP» (no les hace falta, pero sin cifrar podrían; adelanto de la lección 7).
- **Cierre:** resumen, 3 `<SelfCheck>` y tres enlaces.

## Verificación

1. `pnpm test`, `pnpm check` y `pnpm build` en verde, con todos los enlaces válidos.
2. Los comandos se repiten tal como se copian de la web (atributo `data-code`).
3. `Encapsulation` en modo claro y oscuro y a 375 px: el texto se lee, la página no tiene scroll horizontal y las columnas quedan alineadas en escalera.
4. Entre 10 y 15 minutos de lectura y ninguna palabra prohibida.
5. Una revisión técnica independiente de la lección, con las correcciones aplicadas.
