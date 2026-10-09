# Diseño: web del curso + Fase 0

- **Fecha:** 2026-10-02
- **Estado:** aprobado (2026-10-02)
- **Alcance de este ciclo:** el esqueleto de la web y el contenido completo de la Fase 0. Cada fase siguiente tendrá su propio ciclo de diseño → plan → implementación.

## 1. Intención

Una web **pública y bilingüe (español e inglés)** que enseña backend desde cero, organizada en las 12 fases del roadmap. Su autor es un desarrollador frontend que aprende backend mientras la construye: escribir y explicar cada lección es su método de aprendizaje.

**Lo más importante es el contenido:** todo bien explicado y amable para alguien que no sabe backend. La web es el medio, no el fin.

**Público objetivo:** ~~personas que ya programan (por ejemplo, frontend) pero no saben backend. No explicamos qué es una variable; sí explicamos qué es un puerto.~~ **Cambiado el 2026-10-03:** todos los públicos. Ninguna lección da por sabido nada de programación (`docs/specs/2026-10-03-seo-design.md`, §2.3).

**Forma de trabajar:**

- Se construye poco a poco, fase por fase. Nada se construye antes de necesitarlo.
- La web **no** es el proyecto de backend del curso. Es un sitio de documentación. La práctica de backend vive en proyectos guiados (`projects/`, a partir de la Fase 3) que la web explica paso a paso.
- Cada fase tiene algo práctico con lo que jugar, con un coste proporcional a lo que aporta (ver §5).

## 2. Stack

| Pieza              | Elección                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Framework          | Astro + Starlight (tema oficial de documentación de Astro), en sus versiones estables más recientes al implementar |
| Contenido          | MDX                                                                                                                |
| Playgrounds        | React (`@astrojs/react`), hidratados con `client:visible`                                                          |
| Lenguaje           | TypeScript                                                                                                         |
| Runtime y paquetes | Node 22, pnpm (workspaces)                                                                                         |
| Formato            | Prettier (con `prettier-plugin-astro`)                                                                             |
| Tests              | Vitest para la lógica de los playgrounds                                                                           |
| Hosting            | Cloudflare (sitio estático en su CDN)                                                                              |

**Por qué Astro + Starlight:** trae de serie todo lo que necesita una web de documentación (menú lateral, índice de la página, anterior/siguiente, modo oscuro, accesibilidad, buscador Pagefind sin servidor y soporte de idiomas con _fallback_). Su arquitectura de islas sirve HTML puro y solo carga JavaScript en los playgrounds. Si en el futuro un playground necesita servidor, Astro permite añadir endpoints sin cambiar de framework.

**Alternativas descartadas:**

- **Next.js + Fumadocs:** demasiada complejidad de frontend (RSC, caché) para una web de contenido.
- **Docusaurus:** toda la web es una SPA React, con más JS en páginas que solo tienen texto.
- **Vite + React a mano:** obligaría a construir menú, buscador, SEO e idiomas.

**Arquitectura:** estática por defecto, con servidor solo donde un playground lo necesite de verdad. En la Fase 0 ninguno lo necesita.

## 3. Estructura del repositorio

```
backend-desde-cero/
├── CLAUDE.md
├── package.json            ← raíz del monorepo (pnpm workspaces)
├── pnpm-workspace.yaml
├── docs/                   ← documentación interna (specs, guía de estilo); no se publica
│   ├── specs/
│   └── style-guide.md
└── web/                    ← la web: Astro + Starlight
    ├── astro.config.mjs
    ├── public/
    │   └── _redirects
    └── src/
        ├── content/
        │   ├── docs/       ← lecciones (es/, en/)
        │   ├── glossary/   ← glosario (es/, en/)
        │   └── i18n/       ← textos de interfaz propios (es.json, en.json)
        ├── data/
        │   └── phases.ts   ← fuente única de las 12 fases
        ├── components/     ← componentes de lección
        └── playgrounds/    ← un playground React por carpeta
```

- `projects/` **no se crea** en este ciclo. Aparecerá en la Fase 3 como un paquete más del workspace, uno por proyecto.
- Los nombres de carpetas, ficheros y código van en inglés.
- Se inicializa git desde el principio. **No se hace ningún commit, push ni repositorio remoto sin que el autor lo pida.**

## 4. Contenido e idiomas

### 4.1 Rutas e idiomas

- Dos idiomas con prefijo: `/es/…` (idioma por defecto) y `/en/…`. No hay _root locale_.
- `/` redirige a `/es/` con un **302** mediante `public/_redirects`. Se elige 302 y no 301 porque un 301 queda cacheado en el navegador de forma permanente, y en el futuro el destino podría depender del idioma del lector.
- La detección automática de idioma (cabecera `Accept-Language`) queda fuera de este ciclo, porque requiere código de servidor.
- **Los slugs van en inglés en ambos idiomas** (`/es/phase-0/dns/`). Starlight empareja las traducciones por ruta de fichero y su selector de idioma solo cambia el prefijo.
- **Fallback:** una página que no está traducida muestra el contenido en español con el aviso de Starlight.

### 4.2 Fuente única de fases

`web/src/data/phases.ts` define las 12 fases: `id`, `slug`, título y resumen en los dos idiomas, y `status: 'available' | 'coming-soon'`. A partir de este fichero se generan:

- la página `roadmap` (las 12 fases con su estado);
- la sección de fases de la portada;
- los grupos del menú lateral, solo para las fases `available`. Cada grupo se autogenera desde su carpeta y se ordena con `sidebar.order` en el frontmatter.

### 4.3 Árbol de contenido de este ciclo

```
web/src/content/docs/
├── es/
│   ├── index.mdx                 ← portada
│   ├── roadmap.mdx
│   ├── glossary.mdx              ← generada desde la colección glossary
│   └── phase-0/
│       ├── index.mdx             ← introducción a la fase + mini-guía de terminal
│       ├── client-server.mdx
│       ├── protocols.mdx
│       ├── tcp-ip-model.mdx
│       ├── ip-ports-sockets.mdx
│       ├── tcp-vs-udp.mdx
│       ├── dns.mdx
│       ├── tls-https.mdx
│       └── from-url-to-page.mdx
└── en/                           ← mismo árbol
```

**Portada:** qué es el curso, para quién es, cómo está organizado (lecciones y los tres niveles de "Pruébalo") y un botón para empezar por la Fase 0.

### 4.4 Flujo de traducción

1. Claude escribe el borrador en español.
2. El autor lo revisa y lo reescribe con su voz.
3. Cuando el autor lo aprueba, Claude lo traduce al inglés.
4. El autor revisa la versión en inglés.

Los textos de interfaz propios (componentes y playgrounds) se escriben en los dos idiomas desde el principio:

- **Componentes Astro:** usan la colección `i18n` de Starlight (`src/content/i18n/es.json`, `en.json`).
- **Playgrounds React:** reciben `lang` como prop y tienen su propio `strings.ts` con las claves `es` y `en`.

## 5. Plantilla de lección

### 5.1 Estructura fija

| Sección                     | Contenido                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **En una frase**            | El concepto en una línea, "lo que vas a aprender" (de 2 a 4 puntos) y los requisitos previos (enlaces a lecciones) |
| **El problema**             | Por qué existe esto, antes de qué es                                                                               |
| **La analogía**             | Una comparación con algo cotidiano y un apartado obligatorio de "dónde falla la analogía"                          |
| **Cómo funciona de verdad** | El mecanismo real, con diagramas                                                                                   |
| **Pruébalo**                | Ejercicio de terminal o playground, con la salida esperada explicada                                               |
| **Ya lo has visto**         | Conexión con la experiencia de un dev frontend (DevTools, `fetch`, errores conocidos)                              |
| **Errores comunes**         | Malentendidos típicos                                                                                              |
| **Resumen**                 | De 3 a 5 puntos                                                                                                    |
| **¿Lo has entendido?**      | De 2 a 4 preguntas con la respuesta desplegable                                                                    |
| **Para profundizar**        | Enlaces a MDN, RFC y otros recursos                                                                                |

### 5.2 Frontmatter validado

El schema de Starlight se extiende con Zod (`docsSchema({ extend })`) para que todas las lecciones tengan la misma cabecera:

- `oneLiner: string`, que es la frase de "En una frase";
- `objectives: string[]`, que son los puntos de "lo que vas a aprender";
- `prerequisites?: string[]`, que son slugs de otras lecciones.

Un componente `LessonIntro` pinta estos campos al principio de cada lección. Si a una lección le falta un campo obligatorio, el build falla.

### 5.3 Componentes

**De Starlight, sin construir nada:** `Aside`, `Tabs`, `Steps`, `FileTree`, `Code`, `Badge` y `Card`.

**Construidos por nosotros:**

| Componente                  | Qué hace                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<Term id="…">texto</Term>` | Muestra la definición corta del término del glosario en el idioma actual y enlaza a su entrada. Funciona con ratón, teclado y pantalla táctil. Si el `id` no existe, el build falla. |
| `<TryIt>`                   | Bloque "pruébalo en tu terminal": comando, salida esperada y explicación. Admite variantes por sistema operativo (macOS/Linux y Windows).                                            |
| `<Analogy>`                 | La analogía y su apartado de "dónde falla"                                                                                                                                           |
| `<SelfCheck question="…">`  | Una pregunta con la respuesta desplegable (`<details>`)                                                                                                                              |
| `LessonIntro`               | La cabecera de la lección (ver §5.2)                                                                                                                                                 |

### 5.4 Glosario

- Es una colección de datos por idioma: `glossary/es/*.yaml` y `glossary/en/*.yaml`. Cada entrada tiene `id`, `term`, `short` (una o dos frases) y, opcionalmente, `related` (otros ids).
- La página `glossary` se genera desde la colección, ordenada alfabéticamente.

### 5.5 Diagramas

- **Mermaid** para secuencias y flujos: el handshake TCP, la resolución DNS, el handshake TLS y el recorrido de la URL a la página. Se escribe como texto dentro del MDX, así que se traduce con la lección y respeta el modo claro u oscuro de Starlight.
  - El plan elegirá la integración concreta comparando el renderizado en el navegador con el renderizado en el build. **Criterio:** debe seguir el selector de tema de Starlight (atributo `data-theme`, no solo `prefers-color-scheme`).
- **SVG hecho a mano como componente Astro** para lo que Mermaid no dibuja bien (capas de red, encapsulación, NAT). Los textos llegan por props en cada idioma y los colores salen de las variables CSS del tema.
- No se usa Excalidraw ni imágenes con texto incrustado, porque cada una tendría que duplicarse por idioma.

### 5.6 Guía de estilo

`docs/style-guide.md` recoge:

- tuteo;
- frases cortas y una idea por párrafo;
- cada término técnico se define la primera vez que aparece (o se marca con `<Term>`);
- prohibido "simplemente", "obviamente" y "es fácil";
- mostrar antes de contar;
- entre 10 y 15 minutos de lectura por lección;
- las analogías siempre con sus límites.

## 6. La Fase 0

### 6.1 Cambios respecto al roadmap original (aceptados)

1. **Nueva lección final, "De la URL a la página":** el recorrido completo DNS → TCP → TLS → HTTP → respuesta, que une las lecciones anteriores.
2. **La criptografía de clave pública y privada se explica en la Fase 0,** dentro de la lección de TLS. La lección de SSH de la Fase 1 la reutilizará en lugar de explicarla.
3. **NAT y routing** entran en la lección de IP, puertos y sockets.
4. **Nueva lección inicial, «Qué es el backend»** (2026-10-04): diseño en `docs/specs/2026-10-04-leccion-que-es-el-backend-design.md`.

### 6.2 Introducción de la fase (`phase-0/index.mdx`)

- Qué vas a aprender y el mapa de las 9 lecciones.
- **Mini-guía de terminal:** cómo abrirla en macOS y Linux y cómo pegar y ejecutar comandos, sin explicar todavía qué hacen (eso es la Fase 1).
- **Windows:** se recomienda WSL. En cada ejercicio se dan alternativas nativas cuando existen (por ejemplo, `nslookup` en lugar de `dig`).

### 6.3 Lecciones y su "Pruébalo"

Niveles: **1** = ejercicio de terminal, **2** = playground con una herramienta real, **3** = laboratorio visual a medida.

| Lección                                  | Pruébalo                                                                                                                  | Nivel |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| `what-is-backend` | Abrir en el navegador la API de Open-Meteo y repetirlo con `curl` | 1 |
| `client-server`                          | `nc -l 8080` y abrir `localhost:8080` en el navegador para ver la petición en crudo                                       | 1     |
| `protocols`                              | Escribir una petición HTTP a mano con `printf … \| nc example.com 80`                                                     | 1     |
| `tcp-ip-model` (con OSI como referencia) | Anotar por capas la salida de `curl -v`                                                                                   | 1     |
| `ip-ports-sockets` (con NAT y routing)   | IP privada (`ipconfig getifaddr en0`) frente a IP pública (`curl -4 icanhazip.com` y `curl -6`); `lsof -nP -iTCP -sTCP:LISTEN` y `lsof -nP -i :8080` con `nc`; `traceroute -n` | 1     |
| `tcp-vs-udp`                             | **Laboratorio `tcp-handshake`** + chat con `nc` y `nc -u` entre dos terminales                                            | 3 + 1 |
| `dns`                                    | **Laboratorio `dns-lookup`** + `dig`, `dig +trace`, `dig MX` y `dig TXT`                                                  | 3 + 1 |
| `tls-https` (con criptografía)           | `openssl s_client -connect … -servername …` + **playground `crypto-keys`**                                                | 1 + 2 |
| `from-url-to-page`                       | `curl -w` con el desglose de tiempos (DNS, TCP, TLS, primer byte, total), comparado con la pestaña _Timing_ de DevTools   | 1     |

### 6.4 Playgrounds

**Requisitos comunes:**

- Son componentes React hidratados con `client:visible`.
- Tienen textos en los dos idiomas.
- Se pueden usar por completo con el teclado.
- Respetan `prefers-reduced-motion`: sin animaciones; el estado cambia directamente.
- Usan los colores del tema de Starlight en modo claro y oscuro.
- La lógica va separada de la interfaz y tiene tests.

#### `tcp-handshake` (nivel 3)

- **Diseño detallado:** `docs/specs/2026-10-03-laboratorio-tcp-design.md`.
- **Lógica:** una máquina de estados pura, `(estado, evento) → estado`, con tests en Vitest. La interfaz solo la representa.
- **Muestra:** el cliente y el servidor con su estado TCP (`CLOSED`, `LISTEN`, `SYN_SENT`, `SYN_RECEIVED`, `ESTABLISHED`) y los segmentos viajando entre ellos con sus flags y sus números de secuencia y de ACK.
- **Controles:** avanzar paso a paso, reiniciar y "perder este paquete" sobre cualquier segmento en tránsito.
- **Fases:** handshake (SYN → SYN-ACK → ACK) y envío de varios segmentos de datos con su ACK. Si se pierde un paquete, se ve el timeout y la retransmisión.
- **Modo UDP:** envía los mismos datos sin handshake ni ACK. Un paquete perdido no se recupera.
- **Fuera de alcance:** el cierre de conexión (FIN y estados de cierre), control de flujo y control de congestión.

#### `dns-lookup` (nivel 3, con datos reales)

- **Entrada:** el lector escribe un dominio y elige el tipo de registro (A, AAAA, CNAME, MX, TXT o NS).
- **Datos reales:** se consultan por DNS-over-HTTPS (API JSON) a un resolver público, Cloudflare o Google. El resultado muestra los registros con su TTL.
- **Animación:** el recorrido resolver → raíz → TLD → autoritativo. Los nombres de los servidores de cada nivel son reales y se obtienen pidiendo los registros `NS` de `.`, del TLD y del dominio.
- **Honestidad didáctica:** la lección y el playground dicen explícitamente que el resolver hace el recorrido por nosotros, que la animación lo reconstruye y que `dig +trace` muestra la versión 100 % real.
- **Lógica:** la construcción de las consultas y el parseo de las respuestas se separan de la interfaz y tienen tests (con respuestas grabadas, sin red).
- **Errores visibles:** dominio inexistente (NXDOMAIN), sin conexión y resolver que no responde.
- **Riesgo que hay que comprobar al implementar:** que el resolver elegido permita llamadas desde el navegador (CORS). Si ninguno de los dos lo permite, se para y se decide con el autor entre un _proxy_ mínimo en Cloudflare y datos grabados para dominios de ejemplo.

#### `crypto-keys` (nivel 2)

- Usa la Web Crypto API del navegador; es criptografía real.
- **Cifrado (RSA-OAEP):** generar un par de claves, cifrar un mensaje con la clave pública y descifrarlo con la privada.
- **Firma (ECDSA):** firmar un mensaje, verificar la firma, modificar el mensaje y ver que la verificación falla.
- Las claves se muestran abreviadas (en formato JWK o PEM) y se pueden desplegar enteras.
- La Web Crypto API solo funciona en contextos seguros (HTTPS o `localhost`). La lección lo aprovecha como ejemplo de por qué importa HTTPS.

## 7. Despliegue

- La web se sirve como sitio estático en **Cloudflare**. El plan comprobará en la documentación actual qué producto exacto de Cloudflare usar.
- Al principio se usa el subdominio gratuito de Cloudflare. El dominio propio se añade cuando el autor lo decida.
- El despliegue será automático al hacer push a `main`, mediante la integración de Git de Cloudflare. Desplegar desde GitHub Actions se deja para la Fase 8.
- **Actualizado el 2026-10-07:** un workflow de GitHub Actions (`.github/workflows/ci.yml`) comprueba formato, tipos, tests y build en cada PR y en cada push a `main`. No despliega.
- El despliegue se configura pronto (tras el esqueleto), para que el autor vea el progreso en vivo.
- **Crear el repositorio remoto, hacer push o conectar Cloudflare requiere petición explícita del autor.**

## 8. Testing y verificación

| Qué                    | Cómo                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Tipos y contenido      | `astro check` y `astro build` (el build falla con MDX roto, frontmatter inválido o un `<Term>` inexistente)                    |
| Enlaces internos       | El plugin `starlight-links-validator` en el build                                                                              |
| Lógica de playgrounds  | Tests en Vitest de la máquina de estados TCP, del parseo DNS y de las utilidades de criptografía                               |
| Ejercicios de terminal | Cada comando se ejecuta de verdad en macOS antes de publicar la lección, y la "salida esperada" sale de esa ejecución          |
| Interfaz               | Revisión en el navegador de cada página y playground, en los dos idiomas y en modo claro y oscuro, incluido el uso con teclado |

No hay batería de tests end-to-end en este ciclo; llegará con la Fase 10.

## 9. Orden de trabajo

1. **Esqueleto:** workspace, Astro + Starlight, idiomas, `phases.ts`, portada, roadmap, glosario, componentes de lección, guía de estilo y redirección.
2. **Despliegue** en Cloudflare, cuando el autor lo pida.
3. **Lección piloto:** `client-server` completa (texto, `TryIt`, glosario y traducción) para calibrar el tono y la plantilla con el autor.
4. **El resto de lecciones, una a una** y en el orden del roadmap, cada una con la revisión del autor. Cada playground se construye junto a su lección.
5. **Traducción** de cada lección cuando el autor apruebe la versión en español.

El primer plan de implementación cubre los pasos 1 a 3. Los pasos 4 y 5 tendrán un plan corto por lección (con su playground, si lo tiene), para no planificar contenido que la lección piloto podría cambiar.

## 10. Criterio de terminado

- La introducción y las 9 lecciones de la Fase 0 están aprobadas por el autor en español y traducidas y revisadas en inglés.
- `tcp-handshake`, `dns-lookup` y `crypto-keys` funcionan y su lógica tiene tests en verde.
- Todos los comandos de los ejercicios se han ejecutado y verificado.
- El glosario cubre todos los términos marcados en la Fase 0.
- `astro check`, `astro build` y el validador de enlaces pasan sin errores.
- La web está publicada en una URL pública.

## 11. Fuera de alcance de este ciclo

- El contenido de las Fases 1 a 11.
- La carpeta `projects/` (llega en la Fase 3).
- Dominio propio, desplegar desde GitHub Actions (el CI sí está: ver §7) y detección de idioma en el servidor.
- Cuentas de usuario, progreso guardado, comentarios y analítica.
- Una identidad visual propia más allá del nombre, el logo y la paleta de colores sobre el tema de Starlight.
- El cierre de conexión, el control de flujo y la congestión en el laboratorio TCP.

## 12. Decisión pendiente del autor

- **El nombre de la web.** Título de trabajo: _Backend desde cero_ / _Backend from Scratch_. No bloquea el esqueleto; se cambia en un único sitio de la configuración.
