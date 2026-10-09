# Design: "code editor" theme (proposal D)

> **2026-10-03:** the layout (header, side panel, tabs and breadcrumbs, table of contents, content widths, line numbers and status bar) is replaced by `docs/specs/2026-10-03-editor-layout-design.md`. The colors, the typography and the lesson components stay here.

- **Date:** 2026-10-02
- **Status:** approved (2026-10-02)
- **Origin:** proposal D from the design canvas (https://claude.ai/artifact/9VJAKs7XxVeAVPkb4QXUAj), chosen by the author.
- **Author's decisions:**
  - dark is the main theme and there is also a "light IDE";
  - in the explorer, lessons are named like files (`02-que-es-un-protocolo.md`).

## 1. Intent

The site should look like a code editor. The course is a project open in an IDE: phases are folders, lessons are `.md` files, the text has line numbers and a status bar shows where you are.

What does not change is the most important thing: that it is easy to read and understand. The editor metaphor lives in the frame (side menu, header, status bar and components), not in the text. The prose is set in a highly legible proportional typeface, and the content, the components and the URLs stay the same.

We stay on Astro + Starlight: the theme is built with CSS variables and by replacing Starlight components, without changing framework.

## 2. Design tokens

There is a single source of tokens, `web/src/styles/theme.css`, with the colors of both themes. A test (`tokens.test.ts`) reads that CSS and checks the contrast.

| Token | Dark (main) | Light ("light IDE") | Use |
|---|---|---|---|
| `bg` | `#1B1A23` | `#FAFAFC` | Content background |
| `chrome` | `#15141C` | `#F1F0F5` | Explorer, tabs, panels |
| `deep` | `#100F16` | `#E8E6EF` | Top bar |
| `border` | `#2B2935` | `#D9D6E3` | Separators |
| `selection` | `#2A2836` | `#E4E0F0` | Current file, inline code |
| `text` | `#DCD7E8` | `#2B2836` | Normal text |
| `strong` | `#FFFFFF` | `#14121C` | Headings and highlighted text |
| `muted` | `#9A93AE` | `#57526A` | Secondary text |
| `gutter` | `#5E5970` | `#A39EB4` | Line numbers (decorative) |
| `keyword` | `#C4A1FF` | `#6A3BCC` | `#`, `##`, `- [ ]`, syntax marks |
| `string` | `#7FD6B4` | `#09654F` | Prompts, counts |
| `comment` | `#9893AD` | `#5C576F` | `//` comments |
| `info` | `#7DB7FF` | `#1F5FBF` | Borders and tints (not text) |
| `accent` | `#FF9E64` | `#A9380A` | Active tab, focus, links, status bar |
| `accent-low` | `#3A2A22` | `#FBE3D4` | Accent backgrounds |
| `on-accent` | `#15141C` | `#FFFFFF` | Text on `accent` |

The values come from `web/src/styles/theme.css`, which is the source (there is no `tokens.ts`). Some differ from the first version of this table because they did not reach 4.5:1 on all backgrounds.

**Contrast:** every token used for text (`text`, `strong`, `muted`, `keyword`, `string`, `comment`, `accent`) must have at least 4.5:1 against `bg`, `chrome`, `deep` and `selection` in its theme. The dark text on the status bar's `accent` must also have at least 4.5:1. A Vitest test checks it (§8). `gutter` is decorative and carries `aria-hidden`.

Starlight's colors (`--sl-color-*`) are defined from these tokens for both themes, so its components (search, asides, tabs, etc.) inherit the palette.

## 3. Typography

- **JetBrains Mono** (variable) for the frame: header, explorer, tabs, headings, status bar, code and components.
- **Atkinson Hyperlegible Next** (variable) for the prose. It is designed for legibility, and long text is not set in a monospace font.
- Both are self-hosted with Fontsource (`@fontsource-variable/jetbrains-mono` and `@fontsource-variable/atkinson-hyperlegible-next`), without Google Fonts: there are no third-party requests and you can work offline.

## 4. Frame (replaced Starlight components)

| Area | Starlight component | What it shows |
|---|---|---|
| Top bar | `Header` (and `SiteTitle`) | Accent square and `backend-desde-cero`; Starlight's search styled as a command palette («Buscar lección, término o comando… ⌘K»); ES/EN and theme selector |
| Explorer | `Sidebar` | File tree (see §4.1) |
| Tab and breadcrumbs | `PageTitle` (already replaced) | Tab with the name of the current file, and below it, only inside a phase, what the tab does not say: the linked phase and the reading time (`fase-0 Cómo funciona internet · 13 min de lectura`). Repeating the file name in the breadcrumbs, as VS Code does, was removed on 2026-10-03: on the home page it just duplicated the tab. Then the title with its `#` |
| Outline | `PageSidebar` (styles) | Starlight's page table of contents, titled «ESQUEMA» |
| Status bar | `Footer` | At the bottom and fixed: `fase-0 · lección 2/8` on the left; language and "Markdown" on the right |
| Previous / next | `Pagination` (styles) | At the end of the content: `← 01-cliente-servidor.md` / `03-modelo-tcp-ip.md →` |

### 4.1 Explorer

- **At the top,** three root files: `inicio.md` (home page), `temario.md` and `glosario.md` (`home.md`, `roadmap.md` and `glossary.md` in English). They used to be `README.md` and `roadmap.md`; they were changed on 2026-10-03 because those names mean nothing to people who do not code.
- **Below, the 12 phases as folders** (`fase-0 · cómo funciona internet`).
  - The available ones are expanded and show their lessons.
  - The others appear collapsed, dimmed and without a link ("coming soon" for the screen reader).
- **Lessons are shown as files:** `NN-title-in-kebab-case.md`. `NN` is their position in the phase (the introduction is `00`), and the name is generated from the title in the page's language, without accents or punctuation. For example: `02-que-es-un-protocolo.md` / `02-what-is-a-protocol.md`.
- The current file is highlighted. Its `title` and its accessible name are the real title («Qué es un protocolo»), so the screen reader does not read the file name.
- The data comes from the sidebar Starlight already computes (`starlightRoute.sidebar`) and from `phases.ts`. Nothing is duplicated.
- On mobile, the explorer lives in Starlight's dropdown menu.

## 5. The content as an open file

- **Line numbers:** every top-level block of the content (heading, paragraph, list, figure, component) has a number in the margin. It is done with **CSS counters**, with no JavaScript and no changes to the MDX. Below 50rem they are hidden to gain space.
- **Markdown marks:** `#` in front of the page title, `##` and `###` in front of the sections, in the `keyword` color. They are decorative: they live in CSS (`::before`), so they are neither read nor copied.
- **Prose:** Atkinson Hyperlegible Next, 18–19 px, line height 1.65 and a maximum of about 70 characters per line.

## 6. Lesson components (the look changes, not the API)

No MDX lesson needs changes: `<Term>`, `<TryIt>`, `<Analogy>`, `<SelfCheck>` and `<Encapsulation>` keep their props.

| Component | New look |
|---|---|
| `LessonIntro` | A quote block (`>`) with the sentence in large type, the goals as tasks (`- [ ]`) and the prerequisites as imports: `import 01-modelo-cliente-servidor.md // requisito previo` |
| `<Term>` | Term with an accent wavy underline. The definition opens like an IDE's info box: a `(término) protocolo` header, a body with the definition and a footer with the «Ir a la definición» link. It keeps the current behavior (touch, keyboard and mouse) |
| `<TryIt>` | The integrated terminal panel: a header with the title and the system tabs (macOS / Linux · Windows), the command with its `$` prompt and the usual copy button, the output and the explanation as the panel footer |
| `<Analogy>` | A `/* analogía */` header, the text and "where it breaks down" as a `//` comment block |
| `<SelfCheck>` | An entry in the «PROBLEMAS» panel: a `?` icon, the question and the collapsible answer |
| `<Encapsulation>` | The same blocks, with the token colors (`keyword`, `string`, `accent`…) |
| Code (Expressive Code) | `tokyo-night` theme in dark and `one-light` in light, with frames in the style of the panels |
| Mermaid | Colors adjusted to the palette in both themes, if `astro-mermaid` allows it through theme variables; if not, its default dark and light themes |

## 7. Pages

- **Home page (`index.mdx`) as `inicio.md`:** stops using the *splash* template and moves to the normal template, with the explorer. It contains:
  - the `# Backend desde cero` heading and the intro paragraph;
  - a call to action shaped like a *code lens*: `▶ Empezar por fase-0/00-introduccion.md`;
  - «Cada lección tiene algo práctico», as a list;
  - the roadmap as a task list: `- [x] fase-0 Cómo funciona internet // 3 de 8 lecciones`.
- **Roadmap:** `PhaseList` becomes a task list, with each phase's summary.
- **Glossary:** kept, with the theme's style.

## 8. Testing and verification

| What | How |
|---|---|
| File names | Tests for `toFileName(position, title)`: accents, ñ, punctuation, double spaces and the introduction's `00` |
| Lesson position | Tests for `lessonPosition(sidebar, pageId)`, which returns "lesson 2/8" or nothing outside a phase |
| Contrast | A test goes through the text token pairs of both themes and requires at least 4.5:1 |
| Build | `astro check`, `astro build` and the link validator, green |
| Visual | Review in the browser of the home page, roadmap, glossary and the three lessons, in dark and light and at 1280 and 375 px: no horizontal scroll, visible focus and readable popovers and panels |

## 9. Out of scope

- Several tabs open at once (visited lessons), minimap and custom keyboard shortcuts (F12 and similar).
- A custom command palette, beyond giving Starlight's search that look.
- Changing the lessons' content.
