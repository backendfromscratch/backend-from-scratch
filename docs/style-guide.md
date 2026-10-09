# Guía de estilo de las lecciones

## Voz

- Tutea al lector y escribe como le explicarías algo a un compañero, sin condescendencia.
- **Escribe para todos los públicos:** no des por sabido nada de programación. Si una lección usa `fetch`, una variable o una función, explica en una frase qué es, o enlaza a donde se explica. Las referencias al trabajo de un dev frontend son un extra para quien lo es, nunca un requisito para entender la lección.
- **DevTools es para todos** desde la lección 4 de la Fase 0, que explica cómo abrirlo en Chrome. Las lecciones siguientes lo usan sin esconderlo tras «Y si programas:» y remiten a esa lección.
- Frases cortas. Una idea por párrafo.
- Prohibido: «simplemente», «obviamente», «es fácil», «como todo el mundo sabe». Hacen sentir torpe a quien no lo entiende.
- Muestra antes de contar: un ejemplo, un comando o un diagrama antes de la definición formal.
- Cada término técnico se define la primera vez que aparece en la lección, o se marca con `<Term>`.
- Términos en inglés: se usa el término en español si existe y es habitual (*petición*, *respuesta*), con el inglés entre paréntesis la primera vez («petición (*request*)»). Si en la práctica se usa en inglés (*socket*, *handshake*), se deja en inglés en cursiva.
- Entre 10 y 15 minutos de lectura por lección. Si pasa de ahí, se divide.

## Estructura de una lección

El orden es fijo. Cada sección es un `##`, salvo la cabecera, que sale del frontmatter.

1. **Cabecera** (frontmatter `lesson`): `oneLiner`, de 2 a 4 `objectives` y `prerequisites`.
2. `## El problema`: por qué existe esto.
3. `## La analogía`: con `<Analogy>`, siempre con su slot `limits`.
4. `## Cómo funciona de verdad`: el mecanismo, con diagramas.
5. `## Pruébalo`: con `<TryIt>` o un playground.
6. `## Ya lo has visto`: dónde se ha cruzado ya el lector con esto sin saberlo (el navegador, el móvil, el wifi de casa) y, si programa, en su código (`fetch`, DevTools). Lo que ve cualquiera va primero; los puntos para quien programa, al final, después de una línea suelta «Y si programas:» («And if you code:»).
7. `## Errores comunes`
8. `## Resumen`: de 3 a 5 puntos.
9. `## ¿Lo has entendido?`: de 2 a 4 `<SelfCheck>`.
10. `## Para profundizar`: enlaces externos (MDN, RFC…).

En inglés, los títulos son: The problem, The analogy, How it really works, Try it, You have already seen it, Common mistakes, Summary, Did you get it?, Further reading.

## Frontmatter de una lección

```yaml
---
translationKey: client-server   # la misma en las dos versiones de la lección
title: "Modelo cliente-servidor: qué es y cómo funciona"   # lo que busca la gente; entre comillas si lleva «:»
description: "De 70 a 155 caracteres, con las palabras de la búsqueda."
sidebar:
  label: "Modelo cliente-servidor"   # el nombre corto: el del explorador y la paginación
  order: 1            # posición dentro de la fase; la introducción es 0
lesson:
  oneLiner: Responde la pregunta del título en una o dos frases. Es lo primero que se lee bajo el título, y lo que Google suele mostrar.
  objectives:
    - Primer objetivo, empezando por un verbo.
    - Segundo objetivo.
  prerequisites: []   # translationKey de las lecciones previas, p. ej. [client-server]
---
```

## Componentes

Se importan con el alias `~/`:

```mdx
import Term from '~/components/Term.astro';
import TryIt from '~/components/TryIt.astro';
import Analogy from '~/components/Analogy.astro';
import SelfCheck from '~/components/SelfCheck.astro';
```

**Regla de MDX:** deja una línea en blanco después de abrir y antes de cerrar cualquier componente que contenga Markdown, y alrededor del contenido de `<div slot="limits">`. Sin esas líneas, MDX lo trata como texto en línea y el contenido acaba en el sitio equivocado.

- `<Term id="port">puerto</Term>`: el `id` es el nombre del fichero en `src/content/glossary/<idioma>/`. Si no existe, el build falla.
- `<TryIt cmd="…" output={`…`}>explicación</TryIt>`:
  - `output` se copia de una ejecución real, nunca se inventa;
  - no se usa `windows`: en Windows, el curso se sigue con WSL, con los mismos comandos que en Linux (decidido el 2026-10-07; spec de la Fase 1, §2.2). La prop sigue en el componente por si algún día hace falta;
  - para varias líneas, usa una plantilla literal: ``cmd={`línea 1\nlínea 2`}``.
  - `lang` cambia el resaltado de `cmd` (por defecto `sh`); usa `lang="http"` cuando lo que el lector escribe es un mensaje HTTP y no un comando.
- `<Analogy>…<div slot="limits">…</div></Analogy>`: sin `limits`, el build falla.
- `<SelfCheck question="¿…?">respuesta</SelfCheck>`
- De Starlight (`@astrojs/starlight/components`): `Aside`, `Tabs`/`TabItem`, `Steps`, `FileTree`, `Code`, `Badge`, `Card`/`CardGrid`, `LinkCard`.

## Diagramas

- **Secuencias y cadenas:** un bloque ```` ```mermaid ````. Al hacer el build se convierte en HTML (`web/src/lib/diagrams/`): sin JavaScript, con los colores del tema, y con el texto en la página para los buscadores y los lectores de pantalla. Los textos van en el idioma de la lección. Solo se admite:
  - `sequenceDiagram` con entre 2 y 6 participantes: `participant X as Nombre`, `X->>Y: texto` (mensaje), `X-->>Y: texto` (respuesta) y `Note over X: texto` o `Note over X,Y: texto`. `<br/>` parte una línea;
  - `flowchart TB` en cadena, sin ramas: `A["Nombre<br/>detalle"] -->|enlace| B["…"]`.

  Cualquier otra cosa hace fallar el build con el fichero y la línea. Para otros diagramas, un componente propio (siguiente punto).
- **Lo que Mermaid no dibuja bien** (capas, encapsulación, NAT): un componente propio en `web/src/components/diagrams/`, con los textos por props y los colores de las variables `--sl-color-*`. Mejor HTML y CSS (grid o flex) que SVG: un SVG se encoge entero en móvil y el texto se vuelve ilegible, mientras que con HTML el texto conserva su tamaño y lo leen los lectores de pantalla. Usa SVG solo para formas que el HTML no pueda dibujar.
  - Ya existe `<Encapsulation caption layers blocks />`: cómo cada capa añade su cabecera.
  - Ya existe `<NatTranslation caption labels steps table />`: cómo el router reescribe el origen y el destino de un paquete con NAT, tramo a tramo, y su tabla de traducciones.
  - Ya existe `<DataToScreen caption labels json card />`: los datos que envía un backend (JSON) junto a lo que pinta el frontend con ellos (una tarjeta del tiempo).
- Nunca imágenes con texto incrustado, porque habría que duplicarlas por idioma.

## Glosario

Cada término es un fichero `src/content/glossary/<idioma>/<id>.yaml`:

```yaml
term: Puerto
short: Una o dos frases. Sin jerga que no esté a su vez en el glosario.
related: [server, localhost]   # ids de otros términos; deben existir en el mismo idioma
lesson: ip-ports-sockets       # opcional: la translationKey de la lección que lo explica
```

El glosario enlaza cada término a la lección que lo explica («Se explica en…»): por defecto, la primera del curso que lo usa con `<Term>`, contando las introducciones de fase. Si esa lección solo lo menciona y otra lo explica, indica la buena con `lesson`. Si la clave no existe en ningún idioma, el build falla.

Si `short` contiene dos puntos seguidos de espacio («Nombre: valor»), ponlo entre comillas simples. Si no, YAML lo interpreta como una clave nueva y el build falla.

## Ejercicios de terminal

- Antes de publicar, ejecuta el comando de verdad (en macOS) y copia la salida en `output`.
- Si la salida cambia de un ordenador a otro (IPs, fechas, versiones), dilo en la explicación: «tus números serán distintos».
- Si el comando se queda esperando a propósito (`nc -l`), explica que se para con <kbd>Ctrl</kbd> + <kbd>C</kbd>.
- Los datos personales de la salida (direcciones MAC, IPs públicas, nombres de usuario o de equipo) se sustituyen por valores de ejemplo, y la explicación lo avisa: «hemos cambiado la dirección MAC por una de ejemplo».
- El usuario de ejemplo es `ana`, en el equipo `portatil`, con la carpeta `/Users/ana` y el grupo `staff`; en el servidor de prácticas, `ubuntu`, en la VM `curso`. Las salidas se capturan en una carpeta personal de ejemplo, nunca en la del autor (plan `docs/plans/2026-10-07-fase-1-piloto.md`, Tarea 4, paso 1).
- Los comandos se ejecutan también en un Ubuntu de verdad (por ejemplo, `docker run --rm -it ubuntu:24.04 bash`), y cada diferencia con macOS que el lector vaya a notar se dice en la explicación del `<TryIt>`.

## Traducción

- El español es el original. La traducción al inglés se hace cuando el autor aprueba la versión en español.
- Se traducen a la vez la lección, sus términos de glosario nuevos y los textos de sus diagramas.
- Una lección en inglés que usa `<Term>` necesita sus términos en `glossary/en/`. Si faltan, el build falla, y así es como queremos que funcione.

## Tema (editor de código)

La web imita un editor de código (spec: `docs/specs/2026-10-02-tema-ide-design.md`).

- **Color:** la única fuente son los tokens `--ide-*` de `web/src/styles/theme.css`, con un bloque para el oscuro (`:root`) y otro para el claro (`:root[data-theme='light']`). Los componentes no llevan hexadecimales: usan `var(--ide-…)`.
- **Contraste:** `web/src/styles/tokens.test.ts` exige al menos 4,5:1 a cada token de texto sobre `bg`, `chrome`, `deep`, `selection` y `line` (el fondo de la línea resaltada), en los dos temas, y 3:1 al borde de los campos de formulario (`--ide-control`, WCAG 1.4.11; `--ide-border` no llega y es solo para separar paneles). `--ide-sun` (el sol de `<DataToScreen>`) es decorativo y no tiene requisito de contraste. Si cambias un color, pasa los tests.
- **Tipografía:** el marco (explorador, pestañas, títulos, paneles, código) va en `var(--__sl-font-mono)` (JetBrains Mono); la prosa, en `--sl-font` (Atkinson Hyperlegible Next).
- **Marcas decorativas** (`#`, `##`, números de línea, `- [ ]`, `//`, `>`): en CSS con `content: "…" / ""`, para que no se lean ni se copien; en el HTML, con `aria-hidden="true"`. El texto con significado va siempre visible o en `.sr-only`.
- **Nombres de fichero:** los genera `web/src/lib/explorer.ts` a partir de la etiqueta del sidebar (`sidebar.label`, o el título si no hay etiqueta): `02-que-es-un-protocolo.md`. El nombre accesible de cada enlace es esa misma etiqueta.
- **El editor no puede meter jerga:** los nombres que se ven los tiene que entender cualquiera. Por eso la portada es `inicio.md` / `home.md` (no `README.md`) y el temario, `temario.md` en español. Si una palabra técnica le sirve al SEO, va en el `<title>` y en la descripción, no en el explorador.
- **Espacios en Astro:** el compilador elimina los saltos de línea entre etiquetas. Si dos elementos en línea necesitan un espacio entre ellos, usa `{' '}` y comprueba el HTML.
- **Anchos:**
  - la prosa (párrafos, listas, `dl` y citas) llega como mucho a `--ide-measure` (75ch);
  - las cajas, a `--ide-box-width`;
  - las piezas anchas usan todo el editor: tablas, `figure`, bloques de código, `TryIt`, laboratorios (`astro-island`) y la lista de fases.
  Un componente nuevo que necesite ancho se añade a esa lista en `theme.css` («Prosa legible»).
- **Números de línea:** el título es la 1 y la entrada de la lección, la 2. Las piezas que hacen scroll (tablas, diagramas de secuencia y de cadena, laboratorios) no llevan número.
- **Minimapa:** dibuja cada palabra del título, la entrada y el contenido, como el de VS Code. Lo que va en `pre`, `code` o un bloque de Expressive Code sale en verde; si un componente nuevo enseña código de otra forma, añádelo a `wordKind` (`web/src/lib/minimap.ts`).
- **Pestañas y panel lateral:**
  - los playgrounds y el glosario son pestañas fijadas (`web/src/lib/pinned-tabs.ts`), no ficheros del explorador; el tema y el idioma están en la cabecera (escritorio) y en el menú (móvil);
  - el esquema de la página está en el explorador (`Outline.astro`) y empieza plegado: marca la sección cuyo título ha llegado a donde aterriza un salto (`scroll-padding-top`), así que si cambia el alto de las pestañas, cambia también `scroll-padding-top` en `theme.css`;
  - lo que se recuerda en el navegador (`web/src/lib/storage.ts`): el tema (`starlight-theme`, de Starlight), si el esquema está abierto (`ide-outline`) y la última página abierta, para la primera pestaña de playgrounds y glosario (`ide-last-page:<idioma>`).
- **Playgrounds:** cada laboratorio o playground nuevo se añade a `web/src/data/playgrounds.ts` (nivel, lección y textos en los dos idiomas) y a la página `playgrounds.mdx` de su fase, si es la primera de esa fase. Va siempre en el «Pruébalo» de su lección: el enlace de la página apunta ahí.

## Playgrounds

Un playground es un componente React dentro de una lección (spec de la Fase 0, §6.4). El primero, y el modelo para los demás, es `tcp-handshake` (`docs/specs/2026-10-03-laboratorio-tcp-design.md`).

- **Dónde:** una carpeta por playground en `web/src/playgrounds/<nombre>/`.
- **Lógica e interfaz separadas:**
  - la lógica es TypeScript puro, sin React ni textos (en `tcp-handshake`, `machine.ts` con `reduce(estado, evento)`), y tiene tests de cada escenario;
  - la interfaz solo la pinta.
- **Textos:** en `strings.ts`, con una entrada `es` y otra `en` del mismo tipo, así que TypeScript exige las mismas claves en los dos idiomas. La lógica devuelve claves y datos (`{ key: 'server-buffers', ack: 107 }`), no frases.
- **Imports:** relativos dentro de la carpeta, porque Vitest no conoce el alias `~/`.
- **Estilos:** un CSS propio con prefijo (`tcp-lab__…`) y solo tokens `--ide-*`. La raíz lleva `not-content`, para que no le afecten los estilos de la prosa de Starlight, y `data-pagefind-ignore`, para que el buscador no indexe los botones.
- **Accesibilidad:**
  - todo funciona con el teclado;
  - lo que cambia se anuncia en una región `aria-live="polite"`;
  - un botón que desaparece al pulsarlo deja el foco en otro control;
  - con `prefers-reduced-motion`, nada se anima.
- **En la lección:** `import X from '~/playgrounds/<nombre>/X';` y `<X client:visible lang="es" />`. `client:visible` hace que el JavaScript de React solo se descargue cuando el playground entra en pantalla.
- **Tests:** además de los de la lógica, uno que pinta el componente con `react-dom/server` en los dos idiomas.

## Rutas, traducciones y SEO

- **Rutas:** el español va en la raíz y el inglés en `/en/`. Cada fase tiene su carpeta en cada idioma (`fase-N` y `phase-N`), y cada lección su nombre de fichero en su idioma, que es su URL (`fase-0/que-es-dns.mdx`, `en/phase-0/what-is-dns.mdx`). Las rutas no se cambian una vez publicadas.
- **`translationKey`:** las dos versiones de una lección llevan la misma en el frontmatter (el nombre en inglés corto: `dns`). Es lo que las une para el selector de idioma, los `hreflang` y Google. `prerequisites` usa estas claves: `[tcp-vs-udp]`.
- **Traducir una fase:** primero su introducción (`en/phase-N/index.mdx`) y después las lecciones. El build falla si una lección no tiene la introducción de su fase en su idioma.
- **Nombres de fichero:** en minúsculas y sin tildes (`que-es-dns.mdx`), porque son la URL.
- **Enlaces internos:** con la ruta del idioma de la página (`/fase-0/que-es-dns/` o `/en/phase-0/what-is-dns/`).
- **Títulos para buscadores:** el `title` es la pregunta o la búsqueda que hace la gente («Qué es el DNS y cómo funciona»), y `sidebar.label` el nombre corto («DNS»). El `<title>` completo, con el nombre de la web, no pasa de 70 caracteres, y la descripción tiene entre 70 y 155. Lo comprueba la auditoría.
- **Auditoría SEO:** el build falla si una página rompe alguna regla de `web/src/lib/seo/audit.ts`. Por ejemplo:
  - un `<h1>`, título y descripción;
  - canónica, sitemap y `hreflang` recíprocos;
  - nada de copias de respaldo;
  - migas e imagen para redes;
  - como mucho 400 KB de JavaScript por página.

  Si falla, el log dice la página y la regla.
