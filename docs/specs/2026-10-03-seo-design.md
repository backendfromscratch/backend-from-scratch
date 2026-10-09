# Diseño: SEO de la web

- **Fecha:** 2026-10-03
- **Estado:** §2.1, §2.2 y §2.3 decididas; §2.2 y §3 implementadas el 2026-10-03 (`docs/plans/2026-10-03-seo-tecnico.md`), salvo Lighthouse; §4 y §2.3 (Fase 0) aplicados el 2026-10-03 (`docs/plans/2026-10-03-contenido-fase-0.md`)
- **Origen:** el autor fijó como prioridad n.º 1 que la web posicione lo más alto posible en Google y que lo explique todo de la forma más sencilla posible, para todos los públicos (`CLAUDE.md`).

## 1. Qué pesa de verdad, por orden

1. **El contenido:** que cada lección responda mejor que nadie a una búsqueda concreta («qué es el DNS», «diferencia entre TCP y UDP»). Es lo que más pesa, y es donde ya está el esfuerzo del curso.
2. **Los enlaces de otras webs:** foros, newsletters, Reddit, blogs, la comunidad hispanohablante. No se construyen con código, sino publicando y compartiendo.
3. **La parte técnica:** que Google encuentre e indexe bien cada página en su idioma. Hoy tiene huecos (§3). Son baratos de cerrar, pero algunos dependen del dominio.
4. **Los detalles** (palabras en la URL, el nombre del dominio): pesan poco, pero son caros de cambiar después de publicar. Por eso se deciden antes.

Otra cosa a favor de publicar pronto: Google tarda meses en confiar en una web nueva, y ese tiempo empieza a contar el día que se publica.

## 2. Decisiones del autor antes de publicar

Son las que, una vez publicada la web, cuestan redirecciones y posiciones perdidas.

### 2.1 Nombre y dominio

**Decidido el 2026-10-03:** «Backend desde cero» en `backenddesdecero.com`. Análisis en `docs/research/2026-10-03-idiomas-y-nombres.md`. Era la recomendación revisada: **«Backend desde cero / Backend from Scratch» en `backenddesdecero.com`**, un solo dominio para los dos idiomas. Coincide con las búsquedas reales («aprender backend desde cero» es la primera sugerencia de Google para «aprender backend»), y lo entiende cualquiera.

### 2.2 Estructura de las URLs

Hoy: `/es/phase-0/dns/` y `/en/phase-0/dns/`, y la raíz `/` redirige a `/es/` con un 302 (temporal).

| Opción | Español | Inglés | Coste |
|---|---|---|---|
| A. Como hoy | `/es/phase-0/dns/` | `/en/phase-0/dns/` | Ninguno |
| B. Español en la raíz | `/phase-0/dns/` | `/en/phase-0/dns/` | Bajo: mover `docs/es/*` a `docs/` y cambiar los enlaces internos |
| **C. Español en la raíz y rutas traducidas** | `/fase-0/que-es-dns/` | `/en/phase-0/what-is-dns/` | Medio (ver abajo) |

**Recomendación: C.**
- **La portada:** con el español en la raíz, la portada se sirve en `/` sin redirección. Es la página que más enlaces recibirá.
- **Las rutas:** la guía de Google pide usar en la URL el idioma del público. Y la ruta se ve en el resultado de búsqueda (`backenddesdecero.com › fase-0 › que-es-dns`).

El efecto en el ranking es pequeño, pero hoy hay 9 lecciones, y cada lección nueva encarece el cambio.

**Lo que cuesta C** (revisado tras leer el código de Starlight 0.42.5): Starlight no admite rutas distintas por idioma, y no hay ningún plugin que lo haga (búsqueda en npm, 2026-10-03). Para encontrar la traducción de una página, cambia el prefijo de idioma de la URL (`/es/…` → `/en/…`) y deja el resto igual (`localizedUrl`). Con rutas traducidas, eso rompe cinco cosas, y cada una se arregla por un punto de extensión oficial:

1. **El emparejamiento:** cada página declara su pareja con un `translationKey` en el frontmatter, y un test comprueba que todas la tienen y que no se repite.
2. **El selector de idioma** llevaría a una página que no existe. Se sustituye el componente `LanguageSelect`, como ya hacemos con `Sidebar` o `PageTitle`.
3. **Los `hreflang`** apuntarían a URLs que no existen. Un *route middleware* de Starlight los corrige.
4. **Las páginas de respaldo:** Starlight creería que la página en inglés no existe y generaría una copia con el texto en español en `/en/fase-0/que-es-dns/`. Eso es contenido duplicado, y Google lo penaliza. El middleware las marca con `noindex` y se excluyen del sitemap (esto hará falta igualmente en cuanto haya lecciones sin traducir, sea cual sea la opción).
5. **El sidebar y los requisitos:** el explorador (`buildPhaseSidebar`) busca la carpeta de la fase con el mismo nombre en los dos idiomas, y `prerequisites` usa la ruta. Las dos cosas pasan a resolverse por idioma.

**Prueba de concepto (2026-10-03): funciona.** Se hizo con toda la Fase 0 sobre `web/`, que después se restauró y se comprobó idéntica (huellas SHA de los 202 ficheros). El código está en `docs/research/2026-10-03-prueba-rutas-traducidas.patch`; es desechable y sirve de referencia, porque la implementación real va con tests desde cero. No apareció una sexta pieza. Resultado:

- **Rutas:** español en `/fase-0/que-es-dns/` y en la raíz (`/`, `/roadmap/`); inglés en `/en/phase-0/dns/`. El build pasa y el validador da todos los enlaces internos por buenos.
- **`hreflang` y canónicas:** correctos en las dos direcciones, con `x-default` al español.
- **Selector de idioma:** lleva a la traducción real (probado en el navegador).
- **Explorador, paginación, requisitos, pestaña y pie:** correctos en los dos idiomas.
- **Copias de respaldo:** Starlight generó 9 y el build las borró. No están en el sitemap (24 URLs) ni en el buscador (24 páginas).
- **El laboratorio DNS** funciona en la ruta nueva.

**Cómo se resolvió cada pieza** (para el plan):
1. **Emparejamiento:**
   - `translationKey` opcional en el frontmatter; sin clave, se usa la ruta sin idioma, así que `roadmap` y la portada se emparejan solas;
   - `src/lib/translations.ts` construye el índice desde la colección y falla si dos páginas del mismo idioma comparten clave.
2. **Selector:** override de `LanguageSelect`. Si no hay traducción, lleva a la portada de ese idioma.
3. **`src/routeData.ts`** (*route middleware*):
   - quita del sidebar los enlaces a páginas que no existen de verdad (las copias);
   - recalcula la paginación, que Starlight calcula antes del middleware;
   - rehace los `hreflang`;
   - marca las copias con `noindex`.
4. **Copias de respaldo:**
   - una integración propia, colocada **antes** de Starlight, las borra en `astro:build:done`, antes de que Pagefind indexe;
   - `@astrojs/sitemap` pasa a ser dependencia directa, con un `filter` que las excluye y sin su opción `i18n`, que deduce las traducciones por la ruta: los `hreflang` ya van en el HTML.
5. **Carpetas por idioma:**
   - cada grupo del sidebar autogenera desde `fase-N` y `phase-N`, y el middleware limpia lo que sobra;
   - `phaseFolderName(locale, n)`, que ya existía, da la carpeta de cada idioma;
   - `currentLesson` recibe el idioma;
   - `prerequisites` usa claves (`[tls-https]`) en vez de rutas.
6. **Idioma raíz:**
   - `toLocale(undefined)` devuelve `es`;
   - `localizedHref('es', …)` va sin prefijo;
   - `isLessonId` y `countLessons` aceptan ids sin prefijo de idioma;
   - desaparece `public/_redirects`.

**Lo que rompe** y hay que adaptar con tests: `lessons.test.ts`, `links.test.ts`, `locales.test.ts`, `sidebar.test.ts` y `explorer.test.ts`. Además, los enlaces internos del contenido en español cambian (lo comprueba el validador).

**Cosas que quedan para el plan:**
- elegir los nombres definitivos de las rutas (de §4), también `glosario`;
- hacer que el script que borra las copias reutilice el índice de traducciones en vez de recorrer el disco.

### 2.3 Para quién escribimos

El spec de la web dice: «personas que ya programan (por ejemplo, frontend) pero no saben backend». El autor pide ahora «entendible para todos los públicos». Y quien busca «qué es el DNS» en Google es de todo: estudiantes, gente de sistemas, curiosos.

**Decidido el 2026-10-03: todo el curso para cualquiera.** Ninguna lección da por sabido nada de programación. Consecuencias:
- **Guía de estilo:** regla nueva («Escribe para todos los públicos»), y la sección «Ya lo has visto» conecta con lo que ve cualquiera (el navegador, el móvil, el wifi de casa) y, como extra, con el código de quien programa.
- **Las 9 lecciones de la Fase 0** se revisan con ese criterio: frases que den por sabido `fetch`, DevTools o qué es una función sin explicarlo.
- **Antes de la Fase 3** (programar un servidor) hará falta enseñar a programar. Propuesta, para decidir al llegar ahí: una fase corta, «Programar desde cero con JavaScript y TypeScript», con solo lo que el backend necesita (variables, funciones, objetos, módulos, `async`/`await`, npm), y enlaces a javascript.info para profundizar.

## 3. Estado técnico hoy (build del 2026-10-03)

| Qué | Estado | Arreglo |
|---|---|---|
| `site` en `astro.config.ts` | ✗ No está | Poner el dominio. **De él depende lo siguiente** |
| Sitemap (`sitemap-index.xml`) | ✗ No se genera (Starlight lo hace solo cuando hay `site`) | Automático con `site` |
| URL canónica (`<link rel="canonical">`) y `og:url` | ✗ | Automático con `site` |
| `hreflang` entre idiomas | ✗ | Automático con `site` (con la opción C, corregido por el middleware) |
| `robots.txt` | ✗ No existe | Crearlo en `web/public/`, con la URL del sitemap |
| Raíz `/` | 302 a `/es/` | Desaparece con las opciones B o C; si no, 301 |
| Imagen para redes (`og:image`) | ✗ Ninguna, aunque se declara `twitter:card` grande | Generarla en el build para cada página, con el título y el tema IDE (`astro-og-canvas` o `satori`) |
| Datos estructurados (JSON-LD) | ✗ | `BreadcrumbList` en todas las lecciones; `Course` en la portada, si cumple los requisitos de Google |
| `<title>` de la portada | «Backend desde cero \| Backend desde cero», repetido | Título propio con `head` en el frontmatter |
| `<title>` de las lecciones | Etiquetas cortas («DNS \| Backend desde cero») | Títulos que responden a la búsqueda (§4) |
| Meta descripciones | 10 de las 16 lecciones (5 por idioma) superan los 160 caracteres, y Google las corta | Reescribirlas por debajo de 155 |
| `lang` del HTML, un H1 por página, encabezados en orden | ✓ | — |
| Velocidad: diagramas | ✗ Mermaid dibuja en el navegador del lector. Una lección con un diagrama descarga 884 KB de JavaScript (30 ficheros), y una página sin diagramas, 106 KB (medido el 2026-10-03, sin comprimir). El HTML lleva el texto del diagrama, no el dibujo | Dibujar los diagramas al hacer el build (SVG en el HTML, con versión clara y oscura) o pasarlos a componentes HTML, como ya pide la guía de estilo para algunos. Quita casi todo ese JavaScript |
| Velocidad: resto | Web estática, sin saltos de diseño (CLS 0) | Pasar Lighthouse con un móvil simulado antes de publicar |

**Descartado:** las preguntas frecuentes (`FAQPage`) ya no dan resultados enriquecidos salvo a webs oficiales de gobierno y salud (Google, 2023). No compensa marcarlas.

### ¿Es el mejor stack para SEO?

Sí. La tecnología no es el cuello de botella.
- **Astro genera HTML estático:** todo el texto está en el HTML que recibe Google, sin esperar a JavaScript, y las páginas no cargan JavaScript salvo donde hay una isla (los laboratorios).
- **Starlight trae de serie** sitemap, canónicas, `hreflang`, descripciones, HTML semántico y accesible, y búsqueda sin servidor.
- **Cloudflare sirve la web desde su CDN,** cerca de cada lector.

Las alternativas habituales (Next.js, Docusaurus, VitePress, WordPress) no posicionan mejor. Las dos primeras mandan más JavaScript al navegador, y WordPress es más lento y depende de plugins. Lo que hay que corregir son los huecos de esta tabla y las rutas traducidas, que Starlight no admite de serie.

**Herramientas para el día de la publicación,** todas gratis:
- **Google Search Console y Bing Webmaster Tools:** indexación y búsquedas reales.
- **PageSpeed Insights:** los datos de velocidad que ve Google.
- **Prueba de resultados enriquecidos:** comprueba el JSON-LD.
- **Ahrefs Webmaster Tools:** auditoría y enlaces que recibe la web.
- **Google Trends y Keyword Planner:** volumen de búsquedas, para elegir temas y títulos.

## 4. Títulos que responden a búsquedas reales

Sacados del autocompletado de Google del 2026-10-03.
- **El `title`** de la lección pasa a ser la pregunta que hace la gente. Es el H1 y el `<title>`.
- **`sidebar.label`** guarda el nombre corto. El explorador lateral ya lo usa, así que no cambia.

| Lección | Título en español | Título en inglés | Búsquedas que lo justifican |
|---|---|---|---|
| 1 | Qué es el backend: diferencias con el frontend | What is the backend? Frontend vs backend | «que es backend y frontend», «frontend y backend diferencias», «frontend vs backend» |
| 2 | Modelo cliente-servidor: qué es y cómo funciona | The client-server model, explained | «modelo cliente servidor como funciona», «client server model explained» |
| 3 | Qué es un protocolo de red | What is a network protocol? | «que es un protocolo» se mezcla con protocolos notariales y laborales, así que hace falta «de red» |
| 4 | El modelo TCP/IP y sus capas (y el modelo OSI) | The TCP/IP model and its layers (vs. OSI) | «modelo tcp/ip capas», «tcp/ip model vs osi model» |
| 5 | IP, puertos y sockets: qué son y cómo funcionan | IP addresses, ports and sockets explained | «que es un socket en redes» |
| 6 | Diferencia entre TCP y UDP | TCP vs UDP: what's the difference? | «diferencia entre tcp y udp», «tcp vs udp» |
| 7 | Qué es el DNS y cómo funciona | What is DNS and how does it work? | «que es dns», «what is dns and how it works» |
| 8 | Qué es TLS y cómo funciona HTTPS | What is TLS and how does HTTPS work? | «que es tls», «how does https work step by step» |
| 9 | Qué pasa cuando escribes una URL en el navegador | What happens when you type a URL in the browser | Las dos tienen muchas variantes sugeridas |

**Fase 1** (autocompletado del 2026-10-07):

| Página | Título en español | Búsquedas que lo justifican |
|---|---|---|
| Introducción | Aprender Linux desde cero: terminal y SSH | «aprender linux desde cero», «linux desde cero» |
| 1 | Comandos básicos de la terminal en Mac y Linux | «comandos basicos terminal mac», «comandos basicos terminal linux», «10 comandos básicos de terminal y su utilidad» |

**Regla para la guía de estilo:**
- El primer texto bajo el título, la frase destacada (`lesson.oneLiner`), responde la pregunta del título en una o dos frases sencillas. Es lo que Google suele mostrar como fragmento destacado, y lo que el lector necesita primero. Los párrafos narrativos que siguen son libres.
- La descripción no pasa de 155 caracteres y contiene las palabras de la búsqueda.

## 5. Medir

- **Google Search Console y Bing Webmaster Tools** el día de la publicación: enviar el sitemap y ver qué búsquedas traen a la gente. Son gratis.
- **Cloudflare Web Analytics** para las visitas: no usa cookies, así que no hace falta banner.

## 6. Orden de trabajo propuesto

1. **El autor decide §2.1, §2.2 y §2.3.**
2. **Técnico:** URLs (opción elegida), `site`, `robots.txt`, `<title>` de la portada, imágenes para redes, JSON-LD y Lighthouse. Con tests donde haya lógica.
3. **Contenido:**
   - títulos y descripciones de §4, en los dos idiomas;
   - revisión de «para todos los públicos»;
   - reglas nuevas en la guía de estilo.
4. **Publicar** (cuando el autor lo pida) y dar de alta Search Console.

## Fuentes

- [Google: URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Google: Localized versions of your pages (hreflang)](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: Changes to HowTo and FAQ rich results (2023)](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Starlight: i18n y root locale](https://starlight.astro.build/guides/i18n/) y su código de `head.ts` (`hreflang` y sitemap solo con `site`)
- Autocompletado de Google (`suggestqueries.google.com`), consultado el 2026-10-03.
