# Maqueta de editor (diseño C) — diseño

**Estado:** aprobado por el autor el 2026-10-03 e implementado (plan: `docs/plans/2026-10-03-maqueta-editor.md`).
**Bocetos:** https://claude.ai/artifact/1J4ae5sUqPwN4QZoQ6k7GK (lienzo «Maqueta estilo VS Code», maqueta «C · Esquema en el explorador»).
**Amplía:** `docs/specs/2026-10-02-tema-ide-design.md`. Lo que aquí cambia sustituye a lo de aquel documento; el resto sigue igual (colores, tipografía, componentes de lección).

## 1. Qué queremos

1. **Aprovechar el ancho.** Hoy el contenido es una columna centrada con márgenes vacíos a los dos lados. El editor tiene que ocupar toda la zona central, como en VS Code.
2. **Parecerse más a VS Code**, sin copiar su marca ni sus iconos: explorador con esquema, pestañas (con pestañas fijadas) y migas a todo el ancho, números de línea pegados al borde, minimapa y barra de estado discreta.
3. **Sin perder legibilidad.** La prosa no pasa de unos 75 caracteres por línea (la propuesta B, prosa a todo el ancho, se descartó por eso). Lo que gana ancho son los bloques que lo necesitan: tablas, diagramas, código, terminales y laboratorios.

## 2. Decisiones del autor (2026-10-03)

- Maqueta **C**: el esquema de la página baja al explorador y a la derecha hay un minimapa.
- ~~**Barra de actividad** a la izquierda, con el tema y el idioma abajo.~~ Quitada el mismo 2026-10-03, después de verla: los playgrounds y el glosario pasan a **pestañas fijadas** (§4.2) y el tema y el idioma vuelven a la cabecera (§4.1). El botón de ocultar el explorador se quita: el texto ya tiene un ancho máximo y ocultarlo apenas cambiaba la lectura.
- **Barra de estado discreta**, del color de los paneles. El naranja queda para la pestaña activa, el fichero activo y el logo.

## 3. La maqueta según el ancho de la pantalla

| Ancho | Pestañas fijadas | Explorador y esquema | Minimapa | Índice de la página | Números de línea |
|---|---|---|---|---|---|
| ≥ 82rem (≈ 1.312 px) | sí | a la izquierda | a la derecha | en el explorador | sí |
| 50–82rem | sí | a la izquierda | no | en el explorador | sí |
| < 50rem (móvil) | sí (sin «.md»; la franja se desplaza si no cabe) | en el menú ☰ (sin esquema) | no | el desplegable «En esta página», como hoy | no |

El panel lateral mide lo mismo que antes de la maqueta, 19,25rem, todo para el explorador. El contenido no se estrecha en ningún ancho respecto a hoy.

El umbral del minimapa sale de sumar panel lateral (≈ 308 px), números de línea (80 px), prosa a 75ch (≈ 780 px), margen derecho (40 px) y minimapa (96 px).

## 4. Las piezas

### 4.1 Cabecera

- Nombre de la web a la izquierda y el buscador en el centro, con el texto «Buscar lección, término o comando» (ya previsto en el tema).
- A la derecha, el selector de tema y el de idioma, como siempre en Starlight. En el móvil, el tema y el idioma están en el menú ☰.

### 4.2 Pestañas fijadas

En la franja de pestañas va primero, siempre visible, la pestaña de la página abierta (sea cual sea: lección, portada, temario…). Después, dos pestañas fijadas, como las de VS Code: **playgrounds** (icono de matraz, lleva a `/playgrounds/`) y **glosario** (icono de libro). En la página de una pestaña fijada, esa es la abierta y no se repite; la primera pestaña no se cierra: enlaza a la última página en la que estaba el lector (se guarda en su navegador por idioma, `ide-last-page:es` / `ide-last-page:en`; sin nada guardado, la portada).

- Son enlaces de verdad, dentro de un `<nav>` con nombre («Pestañas fijadas»); la pestaña de la página abierta es decorativa (`aria-hidden`), porque repite el título.
- Se ven en todos los anchos, también en el móvil, donde pierden el «.md» y el nombre de la página abierta se recorta con «…» para que quepan las tres.
- La lógica, con tests: `web/src/lib/pinned-tabs.ts`.

### 4.3 Panel lateral: explorador y esquema

Dos secciones, una encima de otra, cada una con su propio scroll. Sus barras de scroll son como las de VS Code (añadido el 2026-10-04), igual que todas las de la web: rectas, sin flechas ni carril y del gris del tema translúcido (`--ide-scrollbar`); 10 px en el panel, el código, las tablas y los laboratorios, y 14 px en la de la página, como el editor. Las del panel van pegadas a su borde y solo se ven con el ratón encima o el foco dentro; las demás, siempre. Solo con ratón: en pantallas táctiles y en colores forzados, las del sistema. El árbol no se pliega: la portada y las fases se ven siempre. El esquema sí se pliega (`<details>`):

- **EXPLORADOR:** `inicio.md` y las fases, sin carpeta raíz (la fila `BACKEND-DESDE-CERO` se quitó el 2026-10-03) (desde el 2026-10-03 ya no están `temario.md` ni `glosario.md`: el glosario es una pestaña fijada y el temario se enlaza desde la portada). Respecto al árbol de antes:
  - flechas en vez de triángulos;
  - un icono `#` delante de cada fichero, en `--ide-info`;
  - una guía de sangría vertical en las carpetas abiertas.
- **ESQUEMA:** el índice de la página, con su nivel delante (`#`, `##`, `###`) en `--ide-keyword`. La sección actual se marca al hacer scroll: es la última cuyo título ya ha llegado a donde aterriza un salto a un ancla. Es un componente propio (`Outline.astro`, con la lógica en `src/lib/outline.ts`), no el índice de Starlight: el suyo vigila una franja fija bajo la cabecera, que aquí tapan las pestañas, y al saltar a una sección marcaba la anterior. En las páginas sin índice (portada, glosario) la sección no aparece. Empieza plegada; si el lector la abre, sigue abierta en las páginas siguientes (`localStorage`, clave `ide-outline`). Abierta, mide lo que su contenido (como mucho, el 42 %) y se desplaza sola para enseñar la sección marcada. Si solo tendría «Sinopsis» (el temario), no se pinta.

Reparto de alto: unos 58 % para el explorador y 42 % para el esquema. Si una sección se pliega, la otra se queda con todo el alto.

### 4.4 Editor

- **Pestañas:** una franja a todo el ancho del editor, con el fondo `chrome`. La pestaña activa tiene el fondo del editor, el borde superior de acento y el icono `#` delante del nombre. La franja y las migas se quedan fijas arriba al hacer scroll (`position: sticky`), como en un editor.
- **Migas:** la línea de hoy (`fase-0 Cómo funciona internet · 12 min de lectura`), a todo el ancho y debajo de las pestañas.
- **Números de línea:** pegados al borde izquierdo del editor. El texto empieza justo después, alineado a la izquierda y sin centrar. El título es la línea 1 y la entrada de la lección (frase, objetivos y requisitos), la 2. Las tablas, los diagramas y los laboratorios siguen sin número, por la misma razón que hoy (recortarían el número al hacer scroll).
- **Ancho:** la prosa (párrafos y listas) llega como mucho a 75ch. La entrada de la lección, como mucho a unos 820 px. Tablas, diagramas, bloques de código, `TryIt` y laboratorios usan todo el ancho del editor. Ojo: en Atkinson Hyperlegible Next el «0» es ancho, así que 75ch (≈ 875 px a 18 px) son unos 100 caracteres reales por línea, no 75; hoy, con 70ch, eran unos 90. Para unos 75 caracteres reales haría falta `--ide-measure: 40rem`. Pendiente de decidir por el autor.
- **Línea resaltada:** al pasar el ratón por un bloque, su fondo se aclara de borde a borde del editor y su número pasa a `--ide-text`, como la línea actual de VS Code.
- **Sin la raya** que hoy separa el título del contenido.

### 4.5 Minimapa (≥ 82rem)

- Una columna de unos 96 px pegada al borde derecho. Desde el 2026-10-04 es la página en miniatura, como el de VS Code: cada palabra es un trazo de su ancho real, en su línea y con su sangría, dibujado en un `<canvas>`. Los títulos van en `--ide-keyword`, el código (`pre`, `code` y Expressive Code) en `--ide-string`, y el resto en `--ide-gutter`. Antes, cada bloque era una barra rayada.
- La escala es fija, como el modo `proportional` de VS Code (el que trae por defecto): el contenido cabe a lo ancho y a lo alto se usa la misma escala, así que una línea de texto mide unos 2 px. Si el dibujo es más alto que el minimapa, el minimapa se desliza a la vez que la página. Un rectángulo translúcido marca la parte que se está viendo.
- Al hacer clic fuera del rectángulo, la página salta a ese punto, sin desplazamiento suave si el lector pide `prefers-reduced-motion`. Al arrastrar, el rectángulo sigue al puntero, como una barra de scroll.
- Se construye en el navegador con un script pequeño, sin React. Se redibuja al cambiar el tamaño de la ventana o del contenido (`ResizeObserver`), el tema (`data-theme`) o al terminar de cargar la fuente, porque cambia el ancho de las palabras.
- Es decorativo para la accesibilidad (`aria-hidden="true"`, fuera del orden de tabulación): quien usa teclado o lector de pantalla tiene el esquema.
- Un `<canvas>` no tiene texto, así que no cambia lo que indexan Google ni Pagefind.

### 4.6 Barra de estado

Tiene el mismo contenido que hoy (`⎇ main`, `fase-0 · lección 2/8`, `Markdown`, `ES`). Lo único que cambia es el color: fondo `chrome`, texto `--ide-muted` y un borde superior `border`.

### 4.7 Móvil (< 50rem)

Igual que hoy:

- cabecera con el menú ☰;
- el desplegable «En esta página»;
- sin números de línea.

Dentro del menú está el explorador, sin la sección ESQUEMA, y debajo el tema y el idioma. Los playgrounds y el glosario están en las pestañas fijadas, que en el móvil también se ven.

### 4.8 Impresión

Sin panel lateral, minimapa, pestañas ni barra de estado, como hoy.

### 4.9 Página de playgrounds

`/playgrounds/` y `/en/playgrounds/` reúnen los laboratorios y playgrounds del curso, por fase. Cada pieza lleva su nivel (laboratorio o playground), una frase y un enlace al «Pruébalo» de su lección. Los datos están en `web/src/data/playgrounds.ts`; un test comprueba que cada pieza apunta a una lección que existe en los dos idiomas y que de verdad la usa. La portada la enlaza. Más adelante, cada playground puede tener su propia página, que es lo que mejor posiciona.

## 5. Tokens nuevos

- `--ide-line`: el fondo de la línea resaltada, entre `bg` y `selection` (oscuro `#211f2a`, claro `#f2f0f7`). Entra en `tokens.test.ts` como fondo: cada token de texto debe tener al menos 4,5:1 sobre él.

## 6. SEO, rendimiento y accesibilidad

- **SEO:** no cambia el contenido de ninguna página ni sus etiquetas. El índice pasa de un `<aside>` a la derecha a una sección del `<nav>` lateral, pero las dos cosas son navegación. La auditoría del build sigue igual: el selector de idioma está en la cabecera y en el pie del menú móvil, y la regla `languageSelectorMatchesHreflang` lo lee.
- **JavaScript:** el esquema y el minimapa son scripts pequeños, sin React. El límite de 400 KB por página no se ve afectado. La auditoría lo comprueba en cada build.
- **Accesibilidad:**
  - las pestañas fijadas son enlaces reales, con nombre accesible;
  - las secciones del panel se pliegan con `<details>`;
  - el minimapa queda fuera del árbol accesible;
  - el foco del teclado se ve con el acento, como hoy.

## 7. Qué cambia en el código (para el plan)

- `Header` (sustituido): nombre, buscador y, a la derecha, tema e idioma.
- `Sidebar` (ya sustituido): secciones EXPLORADOR y ESQUEMA (`Outline.astro`, propio; ver §4.3). El pie del menú móvil, con el tema y el idioma, se queda.
- `PageSidebar` (sustituido): solo el desplegable móvil «En esta página», por debajo de 50rem. El índice de escritorio desaparece de la derecha.
- `TwoColumnContent` (sustituido): sin columna derecha de índice, con el hueco del minimapa a partir de 82rem.
- `PageTitle` (ya sustituido): pestañas y migas a todo el ancho y fijas; título e introducción numerados.
- `Footer` (ya sustituido): barra de estado discreta.
- Nuevos: `Minimap.astro`, `Outline.astro` y las pestañas fijadas en `EditorTabs.astro`, con la lógica pura en `src/lib/` (`minimap.ts`, `outline.ts`, `pinned-tabs.ts`, `storage.ts`) y sus tests. (`ActivityBar.astro` existió unas horas y se quitó.)
- `theme.css`: anchos, contador de líneas desde el título, línea resaltada, ocultar el número de las piezas anchas, token `--ide-line`.

## 8. Pruebas

- **Unitarias (Vitest):**
  - cálculo del minimapa: escala, desplazamiento del minimapa, palabras → trazos, color de cada palabra, rectángulo visible, salto al hacer clic y arrastre;
  - ciclo del tema;
  - destino del enlace de idioma (ya cubierto por `languageTargets`);
  - contraste del token nuevo.
- **Build:** la auditoría SEO sin problemas, el validador de enlaces y el presupuesto de JavaScript.
- **Navegador:** capturas a 1.440 px, a 1.000 px y a 390 px (móvil), en oscuro y en claro, comparadas con la maqueta C.

## 9. Fuera de alcance

- Varias pestañas abiertas a la vez (ya estaba fuera en el diseño del tema).
- ~~Minimapa con el texto en miniatura.~~ Hecho el 2026-10-04 (§4.5), con palabras en lugar de letras: a ese tamaño no se distinguen.
- Migas que cambian con la sección actual (`› ## El problema`).
- Paneles que se redimensionan arrastrando y atajos de teclado propios.
