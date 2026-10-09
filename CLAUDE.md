# Contexto del proyecto

Soy desarrollador frontend con 8-9 años de experiencia y no tengo conocimientos de backend. Quiero aprender backend desde cero para convertirme en un perfil full stack, y voy a hacerlo construyendo una web educativa: aprendo mientras la desarrollo y, a la vez, enseño lo que aprendo.

## Qué vamos a construir

Una web pública y bilingüe (español e inglés) con un curso de backend estructurado por fases (las 12 fases del roadmap de abajo, de la 0 a la 11). Cada fase se compone de lecciones. Lo más importante es el contenido: todo bien explicado y amable para quien no sabe backend.

**Prioridad n.º 1:** que la web posicione lo más alto posible en Google (SEO) y que lo explique todo de la forma más sencilla posible, entendible para todos los públicos. Cada decisión de contenido, de diseño o técnica se valora también por su efecto en el SEO. Plan: `docs/specs/2026-10-03-seo-design.md`.

- La mayoría de lecciones son texto bien explicado acompañado de diagramas.
- Cada fase tiene algo práctico ("Pruébalo"), en tres niveles según su coste:
  1. Ejercicio guiado en la terminal del lector (`curl`, `dig`, `nc`…).
  2. Playground con una herramienta real dentro de la web (p. ej. PostgreSQL en el navegador, Web Crypto).
  3. Laboratorio visual a medida: solo para HTTP, DNS, TCP y Docker. Ejemplos: un simulador de petición HTTP que se puede desmontar, una animación de resolución DNS, un handshake TCP paso a paso o un visualizador de capas de Docker.
- No hay que obsesionarse con los laboratorios: el objetivo principal es que yo aprenda backend, no pasar meses haciendo animaciones.
- La web no es el proyecto de backend del curso: es un sitio de documentación estático por defecto (con servidor solo donde un playground lo necesite de verdad). La práctica de backend vive en proyectos guiados (`projects/`, desde la Fase 3) que la web explica paso a paso.
- Se construye poco a poco, fase por fase: nada se construye antes de necesitarlo.

## Decisiones ya tomadas

- Stack: Astro + Starlight, contenido en MDX, playgrounds en React, TypeScript, pnpm workspaces, Cloudflare como hosting.
- Diseño completo de la web y de la Fase 0: `docs/specs/2026-10-02-web-fase-0-design.md`.
- Diseño visual (tema «editor de código», oscuro y claro): `docs/specs/2026-10-02-tema-ide-design.md`.
- Maqueta de editor (diseño C: pestañas fijadas para playgrounds y glosario, esquema en el explorador, minimapa, barra de estado discreta y barras de scroll como las de VS Code): `docs/specs/2026-10-03-maqueta-editor-design.md`.
- Laboratorio `tcp-handshake` (primer playground React, patrón para los siguientes): `docs/specs/2026-10-03-laboratorio-tcp-design.md`.
- Diseño de la Fase 1 (aprobado el 2026-10-07; se empieza con una lección piloto): `docs/specs/2026-10-03-fase-1-design.md`.
- Nombre y dominio: «Backend desde cero» / «Backend from Scratch», en `backenddesdecero.com`, un solo dominio para los dos idiomas (decidido el 2026-10-03; análisis en `docs/research/2026-10-03-idiomas-y-nombres.md`). El español es el idioma y el dominio principal.
- Nombres técnicos en inglés: organización de GitHub `backendfromscratch`, repositorio y paquete `backend-from-scratch` (decidido el 2026-10-08). El nombre público de la web sigue en el idioma de cada lector.
- Público: todos los públicos. Ninguna lección da por sabido nada de programación (decidido el 2026-10-03; consecuencias en `docs/specs/2026-10-03-seo-design.md`, §2.3).
- Rutas y SEO técnico: español en la raíz, rutas traducidas unidas por `translationKey`, y una auditoría SEO que hace fallar el build (`docs/plans/2026-10-03-seo-tecnico.md`; reglas en `docs/style-guide.md`, «Rutas, traducciones y SEO»).
- CI: GitHub Actions comprueba formato, tipos, tests y build en cada PR y en cada push a `main` (decidido el 2026-10-07). El despliegue sigue en la integración de Git de Cloudflare; desplegar desde GitHub Actions se deja para la Fase 8.
- Guía de estilo para escribir lecciones: `docs/style-guide.md`.
- Los próximos pasos, en orden, y lo que el autor tiene pendiente de revisar o decidir: `docs/pendientes.md`. Mantenlo al día.

## Cómo quiero que trabajes conmigo

- Mi objetivo es aprender, no solo tener la web hecha. Explícame las decisiones técnicas y los conceptos de backend que vayan apareciendo, en vez de generarlo todo sin contexto.
- En la parte de frontend puedes ir más rápido, porque la domino.
- Antes de empezar, propónme una estructura del proyecto y un stack, explicando los pros y contras, y espera a que lo valide.
- Tienes total libertad para darme tu opinión y proponer añadir, quitar o reordenar contenido de las fases del roadmap.
- Empezaremos por la Fase 0.

## Comandos

Desde la raíz del repo. Node 22 (`.nvmrc`) y pnpm, con la versión fijada en `packageManager` (`package.json`).

```sh
pnpm install                 # dependencias de todo el workspace
pnpm dev                     # servidor de desarrollo: http://localhost:4321
pnpm check                   # tipos (astro check)
pnpm test                    # tests (vitest)
pnpm build                   # web estática en web/dist/
pnpm --filter web preview    # sirve web/dist/ para probar el build
pnpm format                  # formatea con prettier
pnpm format:check            # comprueba el formato sin cambiar nada
```

- **El build falla a propósito** si un enlace interno está roto o cruza de idioma (`starlight-links-validator`), si un bloque mermaid no se sabe dibujar, si un `<Term>` no tiene entrada en el glosario, si una `<Analogy>` no tiene `limits`, si falta un texto de interfaz en un idioma o si se rompe una regla de la auditoría SEO. Arregla la causa; no desactives la comprobación.
- Los tests van junto al código (`x.ts` → `x.test.ts`). Los que pintan un playground en un documento simulado se llaman `*.dom.test.tsx`, empiezan por `// @vitest-environment happy-dom` y usan `web/src/playgrounds/dom-test.ts`.
- prettier no toca los `.md` ni los `.mdx` (`.prettierignore`): el formato del contenido lo marca `docs/style-guide.md`.
- **CI** (`.github/workflows/ci.yml`): en cada PR y en cada push a `main` ejecuta `format:check`, `check`, `test` y `build`. No despliega.
- **PR title** (`.github/workflows/pr-title.yml`): en cada PR comprueba que el título siga Conventional Commits. Los dos jobs, «format, types, tests and build» y «conventional commit title», son obligatorios para mergear en `main`.

## Git and GitHub

- **English everywhere:** commit messages, PR titles and descriptions, branch names, issues and review comments. (The site stays bilingual, with Spanish as the main language.)
- **Conventional Commits:** `type(optional-scope): summary`, lowercase, imperative, no final period. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Example: `feat(phase-1): add the ssh lesson`.
- **Always squash.** `main` is protected: changes go through a PR and are squash-merged (the only merge method enabled). The squashed commit takes the PR title, so the PR title is what CI checks.
- **No Claude attribution:** no `Co-Authored-By` trailer and no "Generated with Claude Code" line.
- Commit, push or open PRs only when the author asks.

## Antes de dar una tarea por terminada

- Ejecuta `pnpm format:check && pnpm check && pnpm test && pnpm build` (lo mismo que el CI) y arregla lo que falle. `astro check` tiene que acabar sin errores ni avisos. Si algo no puede pasar, dilo en vez de dar la tarea por terminada.
- Si cambias algo visible, míralo en el navegador (`pnpm dev`) en oscuro y en claro, y a ancho de móvil.
- Si añades, mueves o borras un módulo de `web/src/`, actualiza el mapa de «Arquitectura de la web».
- Si cambias una decisión de diseño, actualiza su spec en `docs/specs/` y, si queda algo que el autor deba revisar o decidir, `docs/pendientes.md`.

## Arquitectura de la web (`web/`)

Astro genera HTML estático. Starlight pone la base de una web de documentación (rutas a partir de los ficheros, menú, buscador Pagefind e idiomas), y la maqueta de editor se monta sustituyendo componentes suyos (`components/overrides/`). Todo lo costoso pasa en el build: los diagramas, las imágenes para redes y la auditoría SEO. En el navegador solo se ejecutan los scripts de la maqueta, los de Starlight (buscador y tema) y las islas de React de los playgrounds.

Rutas relativas a `web/`:

```
astro.config.ts                 integraciones y su orden: drop-fallbacks y diagrams antes de Starlight; seo-audit, la última
src/content.config.ts           esquemas: docs (cabecera `lesson`, `translationKey`), i18n (textos de interfaz obligatorios) y glossary
src/content/docs/               páginas en MDX: el español en la raíz (fase-0/…) y el inglés en en/ (en/phase-0/…)
src/content/glossary/           un YAML por término e idioma (es/port.yaml, en/port.yaml)
src/content/i18n/               textos de interfaz propios (es.json, en.json)
src/content/*.test.ts           tests del contenido: orden de las lecciones y claves de interfaz definidas y usadas
src/data/phases.ts              las 12 fases: título, resumen, estado y lecciones previstas
src/data/playgrounds.ts         laboratorios y playgrounds, para la página /playgrounds/
src/data/site.ts                URL pública y nombre de la web en cada idioma
src/routeData.ts                middleware de Starlight: arregla sidebar, paginación, hreflang y selector de idioma con rutas traducidas
src/pages/og/[...route].png.ts  un PNG de 1200 × 630 por página (og:image), generado en el build
src/integrations/               integraciones de Astro propias: drop-fallbacks (borra las copias de respaldo), diagrams y seo-audit
src/components/                 lecciones (Term, TryIt, Analogy, SelfCheck), páginas generales (PhaseList, PlaygroundList, GlossaryList, CodeLens)
                                y maqueta (EditorTabs, Outline, Minimap; LessonIntro, la cabecera de lección, desde overrides/PageTitle.astro)
src/components/overrides/       sustitutos de componentes de Starlight, registrados en astro.config.ts: Header, Sidebar, PageTitle, LanguageSelect,
                                TwoColumnContent, PageSidebar, Pagination, Footer y SiteTitle
src/components/diagrams/        diagramas que Mermaid no dibuja bien, en HTML y CSS (Encapsulation, NatTranslation, DataToScreen)
src/playgrounds/<nombre>/       un playground por carpeta: lógica pura, interfaz React, strings.ts (es/en), CSS y tests
src/styles/theme.css            tema «editor de código»: los tokens --ide-*, única fuente de color (tokens.test.ts comprueba el contraste)
src/styles/diagrams.css         estilos de los diagramas generados desde bloques mermaid
src/lib/                        lógica pura, sin DOM y con tests:
  translations.ts               índice de traducciones por translationKey; translations-astro.ts lo alimenta con el contenido
  route-fixes.ts                las correcciones que aplica routeData.ts
  locales.ts, links.ts          idiomas del curso y URLs internas de cada idioma
  content-i18n.ts               textos de interfaz en el idioma del contenido, no en el de la URL
  lessons.ts, sidebar.ts        qué es una lección y de qué fase; un grupo del menú por fase publicada
  glossary.ts                   ids del glosario, orden alfabético y lección que explica cada término
  explorer.ts, outline.ts       explorador de ficheros y esquema de la página
  minimap.ts, pinned-tabs.ts    minimapa y franja de pestañas
  reading.ts                    minutos de lectura
  storage.ts                    localStorage que no falla (navegación privada, cuota llena)
  structured-data.ts            JSON-LD de las migas
  color.ts                      contraste WCAG
  fill.ts, live-text.ts         huecos {así} en los textos y regiones aria-live de los playgrounds
  diagrams/                     plugin de Sätteri (diagrams-plugin.ts) que convierte los bloques mermaid en HTML en el build:
                                secuencias (sequence.ts) y cadenas (chain.ts), con hast.ts y errors.ts de apoyo
  seo/                          reglas de la auditoría (audit.ts), lectura del HTML (page.ts) y presupuesto de JavaScript (js-budget.ts)
  og/                           imagen para redes (card.ts) y sus fuentes (fonts.ts)
public/                         se copia tal cual: favicon.svg y robots.txt
```

- **Rutas traducidas.** Starlight supone que la traducción de una página tiene la misma ruta con otro prefijo de idioma, y aquí no es así (`/fase-0/que-es-dns/` ↔ `/en/phase-0/what-is-dns/`). La `translationKey` del frontmatter une cada pareja: `lib/translations.ts` construye el índice y `routeData.ts` corrige con él lo que Starlight deduce mal. Las copias de respaldo que Starlight generaría para las páginas sin traducir se borran del build y del sitemap (`integrations/drop-fallbacks.ts`). Reglas en `docs/style-guide.md`, «Rutas, traducciones y SEO».
- **Lógica pura, interfaz que solo pinta.** Lo que decide algo va en `src/lib/` (o en la lógica de cada playground, como `machine.ts` en `tcp-handshake`) como funciones puras con tests. Los `.astro` y los `.tsx` solo la llaman y pintan. Patrón de los playgrounds en `docs/style-guide.md`, «Playgrounds».
- **El orden de las integraciones importa** (`astro.config.ts`): `drop-fallbacks` borra las copias antes de que Pagefind indexe, `diagrams` convierte los bloques mermaid antes de que Starlight procese el Markdown y `seo-audit` va la última porque necesita el sitemap ya escrito.

---

# Roadmap del curso

## Fase 0 — Cómo funciona internet (los cimientos)

Antes de escribir una línea de backend, necesitas entender por dónde viajan los datos.

- **Qué es el backend**: la parte de una web o una app que no ves, qué hace y en qué se diferencia del frontend.
- **Modelo cliente-servidor**: quién pide y quién responde, y por qué un servidor es simplemente un programa escuchando.
- **Qué es un protocolo**: un acuerdo sobre cómo se comunican dos partes, igual que un idioma con reglas. HTTP, TCP, SSH y DNS son todos protocolos.
- **Modelo TCP/IP (y OSI como referencia)**: las capas de red y qué hace cada una.
- **IP, puertos y sockets**: direcciones públicas y privadas, NAT, IPv4 e IPv6, routing (cómo viaja un paquete de router en router), y por qué un servidor web suele escuchar en el puerto 80 o 443.
- **TCP vs UDP**: fiabilidad frente a velocidad, y el _handshake_ de TCP.
- **DNS**: cómo `google.com` se convierte en una IP, registros A, CNAME, MX y TXT, y el TTL.
- **TLS/HTTPS**: criptografía de clave pública y privada, cifrado, certificados y autoridades certificadoras. Lo que hace el candado del navegador.
- **De la URL a la página**: qué pasa desde que escribes una URL y pulsas Enter (DNS → TCP → TLS → HTTP → respuesta), uniendo todo lo anterior.

## Fase 1 — Terminal, Linux y SSH

Casi todos los servidores del mundo son Linux sin interfaz gráfica, así que aquí vas a vivir.

- **Shell (bash/zsh)**: navegación, pipes (`|`), redirecciones y scripts básicos.
- **Sistema de ficheros y permisos**: usuarios, grupos, `chmod`, `chown` y `sudo`.
- **Procesos**: `ps`, `top`, señales, demonios y `systemd`.
- **Variables de entorno**: cómo se configura una aplicación sin meter secretos en el código.
- **SSH**: aplicar la criptografía de clave pública y privada (explicada en la Fase 0), `ssh-keygen`, `authorized_keys`, conexión a servidores remotos, `scp` y túneles.
- **Git más allá de lo básico**: ramas, rebase, y Git como base para el despliegue.

## Fase 2 — HTTP a fondo

Lo conoces como cliente. Ahora toca conocerlo como quien responde.

- **Anatomía de una petición y una respuesta**: línea de inicio, headers y body.
- **Métodos**: GET, POST, PUT, PATCH y DELETE, y los conceptos de idempotencia y seguridad.
- **Códigos de estado**: 2xx, 3xx, 4xx y 5xx, y cuándo usar cada uno de verdad.
- **Headers importantes**: Content-Type, Authorization, Cache-Control, Cookie y Set-Cookie.
- **Cookies**: HttpOnly, Secure y SameSite.
- **CORS desde el servidor**: por fin entenderás por qué te daba error.
- **Caché HTTP**: ETag, 304 y CDNs.
- **Versiones del protocolo**: HTTP/1.1, HTTP/2 y HTTP/3 (QUIC), con sus diferencias prácticas.

## Fase 3 — Tu primer servidor

- **Lenguaje**: te recomiendo empezar con **Node.js + TypeScript**. Ya dominas el lenguaje, así que te centras en los conceptos de backend y no en la sintaxis. Más adelante, aprender **Go** o **Python** te abrirá la cabeza.
- **Servidor HTTP sin framework**: usa el módulo `http` de Node a pelo para ver que no hay magia.
- **Framework**: Fastify, Hono o Express. Aprenderás routing, middleware y el ciclo de vida de una petición.
- **Validación de entrada**: no confíes nunca en lo que llega del cliente. Zod es una buena herramienta para esto.
- **Manejo de errores y logging**.
- **Event loop y asincronía en el servidor**: qué bloquea, qué no y por qué importa con muchos usuarios a la vez.

## Fase 4 — Diseño de APIs

- **REST**: recursos, URLs bien diseñadas, paginación, filtros y versionado.
- **OpenAPI/Swagger**: cómo documentar y contratar una API.
- **Alternativas y cuándo usarlas**: GraphQL, gRPC, WebSockets, Server-Sent Events y webhooks.
- **Serialización**: JSON y algo de formatos binarios como Protobuf.

## Fase 5 — Bases de datos

Es el corazón de casi cualquier backend.

- **SQL con PostgreSQL**: SELECT, JOIN, GROUP BY y subconsultas.
- **Modelado de datos**: entidades, relaciones (1:N, N:M) y normalización.
- **Índices**: qué son, cómo funcionan por dentro (B-tree) y `EXPLAIN`.
- **Transacciones y ACID**: niveles de aislamiento y condiciones de carrera.
- **Migraciones**: cómo evolucionar el esquema sin romper producción.
- **ORMs y query builders**: Drizzle o Prisma, ventajas y riesgos, como el problema N+1.
- **NoSQL**: Redis (clave-valor y caché), MongoDB (documentos), y cuándo tiene sentido frente a SQL.

## Fase 6 — Autenticación, autorización y seguridad

- **Hashing de contraseñas**: argon2 o bcrypt. Nunca cifrar contraseñas, siempre hashear.
- **Sesiones vs JWT**: ventajas, trampas y dónde guardarlos.
- **OAuth 2.0 y OpenID Connect**: el "Login con Google" por dentro.
- **Autorización**: roles y permisos (RBAC).
- **OWASP Top 10**: inyección SQL, XSS, CSRF, SSRF, etc.
- **Rate limiting y gestión de secretos**.

## Fase 7 — Docker y contenedores

- **Qué problema resuelve**: el famoso "en mi máquina funciona".
- **Imagen vs contenedor**, capas y registro (Docker Hub).
- **Dockerfile**: multi-stage builds y cómo hacer imágenes pequeñas.
- **Volúmenes y redes**: persistencia y comunicación entre contenedores.
- **Docker Compose**: levantar app + base de datos + Redis con un solo comando.

## Fase 8 — Despliegue e infraestructura

- **VPS**: alquilar un servidor, entrar por SSH, endurecerlo (firewall, desactivar login por contraseña).
- **Reverse proxy**: Nginx o Caddy.
- **Dominio propio + DNS + HTTPS** con Let's Encrypt.
- **CI/CD**: GitHub Actions para testear y desplegar automáticamente.
- **Modelos de cloud**: IaaS, PaaS y serverless. Conceptos de AWS como cómputo, almacenamiento de objetos (S3), bases de datos gestionadas e IAM.
- **Infraestructura como código**: una introducción a Terraform.

## Fase 9 — Arquitectura y escalado

- **Trabajo asíncrono**: colas y jobs en segundo plano (BullMQ, RabbitMQ).
- **Caché**: estrategias e invalidación, uno de los problemas difíciles de verdad.
- **Escalado**: vertical vs horizontal, balanceadores de carga y servicios _stateless_.
- **Monolito vs microservicios**: y por qué casi siempre conviene empezar con un monolito.
- **Sistemas distribuidos**: teorema CAP, consistencia eventual y arquitectura orientada a eventos.

## Fase 10 — Calidad y observabilidad

- **Testing**: unitario, de integración (con base de datos real en Docker) y end-to-end.
- **Observabilidad**: logs estructurados, métricas y trazas (OpenTelemetry).
- **Fiabilidad**: health checks, alertas y gestión de incidentes.

## Fase 11 — Backend para IA y agentes

Esta es la parte que más valor te va a dar en el mercado ahora mismo.

- **APIs de modelos**: consumirlas desde el servidor, nunca exponer la API key en el frontend.
- **Streaming**: respuestas token a token (SSE).
- **Tool use / function calling**: cómo un modelo invoca funciones de tu backend.
- **MCP (Model Context Protocol)**: exponer tus servicios a agentes.
- **Búsqueda semántica**: embeddings, bases de datos vectoriales (pgvector) y RAG.
- **Producción**: control de costes, latencia, colas para tareas largas de agentes y evaluación de resultados.
