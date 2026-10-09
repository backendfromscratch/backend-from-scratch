# Diseño: tema «editor de código» (propuesta D)

> **2026-10-03:** la maqueta (cabecera, panel lateral, pestañas y migas, índice, anchos del contenido, números de línea y barra de estado) la sustituye `docs/specs/2026-10-03-maqueta-editor-design.md`. Los colores, la tipografía y los componentes de lección siguen aquí.

- **Fecha:** 2026-10-02
- **Estado:** aprobado (2026-10-02)
- **Origen:** la propuesta D del lienzo de diseño (https://claude.ai/artifact/9VJAKs7XxVeAVPkb4QXUAj), elegida por el autor.
- **Decisiones del autor:**
  - el oscuro es el tema principal y además hay un «IDE claro»;
  - en el explorador, las lecciones se nombran como ficheros (`02-que-es-un-protocolo.md`).

## 1. Intención

La web debe parecer un editor de código. El curso es un proyecto abierto en un IDE: las fases son carpetas, las lecciones son ficheros `.md`, el texto lleva números de línea y una barra de estado muestra dónde estás.

Lo que no cambia es lo más importante: que se lea bien y se entienda. La metáfora del editor está en el marco (menú lateral, cabecera, barra de estado y componentes), no en el texto. La prosa va en una tipografía proporcional muy legible, y el contenido, los componentes y las URLs siguen siendo los mismos.

Seguimos sobre Astro + Starlight: el tema se hace con variables CSS y sustituyendo componentes de Starlight, sin cambiar de framework.

## 2. Tokens de diseño

Hay una sola fuente de tokens, `web/src/styles/theme.css`, con los colores de los dos temas. Un test (`tokens.test.ts`) lee ese CSS y comprueba el contraste.

| Token | Oscuro (principal) | Claro («IDE claro») | Uso |
|---|---|---|---|
| `bg` | `#1B1A23` | `#FAFAFC` | Fondo del contenido |
| `chrome` | `#15141C` | `#F1F0F5` | Explorador, pestañas, paneles |
| `deep` | `#100F16` | `#E8E6EF` | Barra superior |
| `border` | `#2B2935` | `#D9D6E3` | Separadores |
| `selection` | `#2A2836` | `#E4E0F0` | Fichero actual, código en línea |
| `text` | `#DCD7E8` | `#2B2836` | Texto normal |
| `strong` | `#FFFFFF` | `#14121C` | Títulos y texto destacado |
| `muted` | `#9A93AE` | `#57526A` | Texto secundario |
| `gutter` | `#5E5970` | `#A39EB4` | Números de línea (decorativos) |
| `keyword` | `#C4A1FF` | `#6A3BCC` | `#`, `##`, `- [ ]`, marcas de sintaxis |
| `string` | `#7FD6B4` | `#09654F` | Prompts, recuentos |
| `comment` | `#9893AD` | `#5C576F` | Comentarios `//` |
| `info` | `#7DB7FF` | `#1F5FBF` | Bordes y tintes (no texto) |
| `accent` | `#FF9E64` | `#A9380A` | Pestaña activa, foco, enlaces, barra de estado |
| `accent-low` | `#3A2A22` | `#FBE3D4` | Fondos con acento |
| `on-accent` | `#15141C` | `#FFFFFF` | Texto sobre `accent` |

Los valores salen de `web/src/styles/theme.css`, que es la fuente (no hay `tokens.ts`). Algunos difieren de la primera versión de esta tabla porque no llegaban a 4,5:1 sobre todos los fondos.

**Contraste:** todo token usado para texto (`text`, `strong`, `muted`, `keyword`, `string`, `comment`, `accent`) debe tener al menos 4,5:1 contra `bg`, `chrome`, `deep` y `selection` en su tema. El texto oscuro sobre `accent` de la barra de estado también debe tener al menos 4,5:1. Un test en Vitest lo comprueba (§8). `gutter` es decorativo y lleva `aria-hidden`.

Los colores de Starlight (`--sl-color-*`) se definen a partir de estos tokens para los dos temas, de modo que sus componentes (buscador, avisos, pestañas, etc.) heredan la paleta.

## 3. Tipografía

- **JetBrains Mono** (variable) para el marco: cabecera, explorador, pestañas, títulos, barra de estado, código y componentes.
- **Atkinson Hyperlegible Next** (variable) para la prosa. Está diseñada para la legibilidad, y el texto largo no va en monoespaciada.
- Las dos se alojan en la propia web con Fontsource (`@fontsource-variable/jetbrains-mono` y `@fontsource-variable/atkinson-hyperlegible-next`), sin Google Fonts: no hay peticiones a terceros y se puede trabajar sin red.

## 4. Marco (componentes de Starlight sustituidos)

| Zona | Componente de Starlight | Qué muestra |
|---|---|---|
| Barra superior | `Header` (y `SiteTitle`) | Cuadrado de acento y `backend-desde-cero`; el buscador de Starlight con aspecto de paleta de comandos («Buscar lección, término o comando… ⌘K»); ES/EN y selector de tema |
| Explorador | `Sidebar` | Árbol de ficheros (ver §4.1) |
| Pestaña y migas | `PageTitle` (ya sustituido) | Pestaña con el nombre del fichero actual, y debajo, solo dentro de una fase, lo que la pestaña no dice: la fase enlazada y el tiempo de lectura (`fase-0 Cómo funciona internet · 13 min de lectura`). Repetir el nombre del fichero en las migas, como VS Code, se quitó el 2026-10-03: en la portada solo duplicaba la pestaña. Después, el título con su `#` |
| Esquema | `PageSidebar` (estilos) | El índice de la página de Starlight, con el título «ESQUEMA» |
| Barra de estado | `Footer` | Abajo y fija: `fase-0 · lección 2/8` a la izquierda; idioma y «Markdown» a la derecha |
| Anterior / siguiente | `Pagination` (estilos) | Al final del contenido: `← 01-cliente-servidor.md` / `03-modelo-tcp-ip.md →` |

### 4.1 Explorador

- **Arriba,** tres ficheros raíz: `inicio.md` (portada), `temario.md` y `glosario.md` (`home.md`, `roadmap.md` y `glossary.md` en inglés). Eran `README.md` y `roadmap.md`; se cambiaron el 2026-10-03 porque a quien no programa no le dicen nada.
- **Debajo, las 12 fases como carpetas** (`fase-0 · cómo funciona internet`).
  - Las disponibles se despliegan y muestran sus lecciones.
  - Las demás aparecen plegadas, atenuadas y sin enlace («pronto» para el lector de pantalla).
- **Las lecciones se muestran como ficheros:** `NN-titulo-en-kebab-case.md`. `NN` es su posición en la fase (la introducción es `00`), y el nombre se genera del título en el idioma de la página, sin tildes ni signos. Por ejemplo: `02-que-es-un-protocolo.md` / `02-what-is-a-protocol.md`.
- El fichero actual se resalta. Su `title` y su nombre accesible son el título real («Qué es un protocolo»), así que el lector de pantalla no lee el nombre de fichero.
- Los datos salen del sidebar que ya calcula Starlight (`starlightRoute.sidebar`) y de `phases.ts`. No se duplica nada.
- En móvil, el explorador vive en el menú desplegable de Starlight.

## 5. El contenido como un fichero abierto

- **Números de línea:** cada bloque de primer nivel del contenido (título, párrafo, lista, figura, componente) lleva un número en el margen. Se hace con **contadores CSS**, sin JavaScript ni cambios en el MDX. Por debajo de 50rem se ocultan para ganar espacio.
- **Marcas de Markdown:** `#` delante del título de la página, `##` y `###` delante de las secciones, en color `keyword`. Son decorativas: van en CSS (`::before`), así que no se leen ni se copian.
- **Prosa:** Atkinson Hyperlegible Next, 18–19 px, interlineado 1,65 y un máximo de unos 70 caracteres por línea.

## 6. Componentes de lección (cambia el aspecto, no la API)

Ninguna lección MDX necesita cambios: `<Term>`, `<TryIt>`, `<Analogy>`, `<SelfCheck>` y `<Encapsulation>` mantienen sus props.

| Componente | Aspecto nuevo |
|---|---|
| `LessonIntro` | Un bloque de cita (`>`) con la frase en grande, los objetivos como tareas (`- [ ]`) y los requisitos como importaciones: `import 01-modelo-cliente-servidor.md // requisito previo` |
| `<Term>` | Término con subrayado ondulado de acento. La definición se abre como el recuadro de información de un IDE: cabecera `(término) protocolo`, cuerpo con la definición y pie con el enlace «Ir a la definición». Mantiene el comportamiento actual (toque, teclado y ratón) |
| `<TryIt>` | El panel del terminal integrado: cabecera con el título y las pestañas de sistema (macOS / Linux · Windows), el comando con su prompt `$` y el botón de copiar de siempre, la salida y la explicación como pie del panel |
| `<Analogy>` | Una cabecera `/* analogía */`, el texto y «dónde falla» como bloque de comentario `//` |
| `<SelfCheck>` | Una entrada del panel «PROBLEMAS»: un icono `?`, la pregunta y la respuesta desplegable |
| `<Encapsulation>` | Los mismos bloques, con los colores de los tokens (`keyword`, `string`, `accent`…) |
| Código (Expressive Code) | Tema `tokyo-night` en oscuro y `one-light` en claro, con marcos al estilo de los paneles |
| Mermaid | Colores ajustados a la paleta en los dos temas, si `astro-mermaid` lo permite por variables de tema; si no, sus temas oscuro y claro por defecto |

## 7. Páginas

- **Portada (`index.mdx`) como `inicio.md`:** deja de usar la plantilla *splash* y pasa a la plantilla normal, con explorador. Contiene:
  - el título `# Backend desde cero` y el párrafo de presentación;
  - una llamada a la acción con forma de *code lens*: `▶ Empezar por fase-0/00-introduccion.md`;
  - «Cada lección tiene algo práctico», como lista;
  - el roadmap como lista de tareas: `- [x] fase-0 Cómo funciona internet // 3 de 8 lecciones`.
- **Roadmap:** `PhaseList` pasa a lista de tareas, con el resumen de cada fase.
- **Glosario:** se mantiene, con el estilo del tema.

## 8. Testing y verificación

| Qué | Cómo |
|---|---|
| Nombres de fichero | Tests de `toFileName(posición, título)`: tildes, eñes, signos, espacios dobles y el `00` de la introducción |
| Posición de la lección | Tests de `lessonPosition(sidebar, idDeLaPágina)`, que devuelve «lección 2/8» o nada fuera de una fase |
| Contraste | Un test recorre los pares de tokens de texto de los dos temas y exige al menos 4,5:1 |
| Build | `astro check`, `astro build` y el validador de enlaces, en verde |
| Visual | Revisión en el navegador de portada, roadmap, glosario y las tres lecciones, en oscuro y claro y a 1280 y 375 px: sin scroll horizontal, foco visible y popovers y paneles legibles |

## 9. Fuera de alcance

- Varias pestañas abiertas a la vez (lecciones visitadas), minimapa y atajos de teclado propios (F12 y similares).
- Una paleta de comandos propia, más allá de dar ese aspecto al buscador de Starlight.
- Cambiar el contenido de las lecciones.
