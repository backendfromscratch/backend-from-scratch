# Plan corto: lección «Qué es un protocolo» (Fase 0, lección 2)

**Objetivo:** escribir en español la lección `phase-0/protocols`. La traducción al inglés se hará cuando el autor apruebe la versión en español.

**Spec:** `docs/specs/2026-10-02-web-fase-0-design.md` (§6.3: «Escribir una petición HTTP a mano con `printf … | nc example.com 80`», nivel 1). **Plantilla y voz:** `docs/style-guide.md`. Usa la misma estructura que la lección piloto `client-server`, que todavía no ha revisado el autor.

**Restricciones:** sin commits. Toda salida de terminal tiene que venir de una ejecución real. No hay pestaña de Windows: según la guía de estilo, solo se usa si hay una alternativa nativa, y la introducción ya recomienda WSL. Cómo tratar esa pestaña lo decidirá el autor más adelante.

## Comprobaciones previas (hechas el 2026-10-02)

Todas contra `example.com:80` desde macOS:

| Petición | Respuesta real |
|---|---|
| `GET /` con `Host` y `Connection: close` | `HTTP/1.1 200 OK`, `Transfer-Encoding: chunked`, cuerpo en trozos (`241` … `0`) |
| `GET /` sin `Host` | `HTTP/1.1 400 Bad Request` |
| `HOLA SERVIDOR` | `HTTP/1.1 400 Bad Request` |
| `GET /no-existe` con `Host` | `HTTP/1.1 404 Not Found` |

**Hallazgo:** el `nc` de macOS se cierra en cuanto se le acaba la entrada, antes de que llegue la respuesta. Por eso el comando es `(printf '…'; sleep 3) | nc example.com 80`. La lección explica para qué sirve el `sleep`.

## Ficheros

- **Crear:** `web/src/content/docs/es/phase-0/protocols.mdx`
- **Crear:** `web/src/content/glossary/es/{protocol,header,http,status-code,rfc}.yaml`
- **Modificar:** `web/src/content/docs/es/phase-0/index.mdx`, para enlazar la lección 2.

## Contenido

- **Frontmatter:** `sidebar.order: 2` y `prerequisites: [phase-0/client-server]`.
- **El problema:** en la lección 1, Chrome entendió una respuesta que escribiste a mano sin haberos puesto nunca de acuerdo. Lo que lo hace posible es un acuerdo previo y público. Internet conecta a miles de millones de programas cuyos autores nunca se conocerán.
- **La analogía:** una llamada de teléfono («¿Diga?», turnos, «¿me oyes?», despedida). Dónde falla:
  - los programas no improvisan: un error de formato y el mensaje se rechaza;
  - las reglas están escritas con precisión en documentos públicos (RFC);
  - en internet hay varios protocolos a la vez, uno encima de otro (lección 3).
- **Cómo funciona de verdad:**
  - **Las cuatro cosas que decide un protocolo:** formato, orden, significado y qué hacer cuando algo falla. Como ejemplo de formato: cómo se sabe dónde termina un mensaje (cerrando la conexión, `Content-Length` o trozos).
  - **La anatomía de un mensaje HTTP,** en una tabla línea a línea.
  - **Un diagrama Mermaid** con la conversación 200 / 400.
  - **Los RFC:** RFC 9110 y 9112.
  - **Protocolo frente a implementación:** el acuerdo no es el programa que lo cumple.
  - **Protocolos de texto frente a binarios.**
  - **Lista de protocolos** (HTTP, DNS, TCP, TLS, SSH, SMTP), con la lección en la que aparece cada uno.
- **Pruébalo**, con tres bloques `<TryIt>` y sus salidas reales:
  1. hablar HTTP con example.com (`200`);
  2. romper las reglas quitando `Host` (`400`);
  3. pedir algo que no existe (`404`), para distinguir «no te entiendo» de «no lo tengo».
- **Ya lo has visto:**
  - las opciones de `fetch` corresponden a las partes del mensaje;
  - la columna *Status* de DevTools;
  - el esquema de la URL (`http://`, `ws://`, `ssh://`) dice qué protocolo se habla.
- **Errores comunes:** «HTTP es internet»; «JSON (o REST) es un protocolo»; «un protocolo es una librería».
- **Cierre:** resumen de 4 puntos, 3 `<SelfCheck>` y dos o tres enlaces (MDN en español y RFC 9112).

## Verificación

1. `pnpm test`, `pnpm check` y `pnpm build` en verde, con todos los enlaces válidos.
2. Los términos nuevos existen en `glossary/es` (si falta alguno, el build falla).
3. Entre 10 y 15 minutos de lectura y ninguna palabra prohibida.
4. Revisión en el navegador en modo claro y oscuro y a 375 px.
5. Antes de usar un enlace externo, comprobar que responde 200.
