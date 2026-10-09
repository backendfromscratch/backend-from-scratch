# Lesson style guide

## Voice

- Address the reader informally (in Spanish, with *tú*) and write as you would explain something to a colleague, without condescension.
- **Write for a general audience:** do not assume any programming knowledge. If a lesson uses `fetch`, a variable or a function, explain in one sentence what it is, or link to where it is explained. References to the work of a frontend dev are an extra for those who are one, never a requirement to understand the lesson.
- **DevTools is for everyone** from lesson 4 of Phase 0, which explains how to open it in Chrome. The following lessons use it without hiding it behind «Y si programas:» ("If you code:") and refer back to that lesson.
- Short sentences. One idea per paragraph.
- Forbidden: «simplemente», «obviamente», «es fácil», «como todo el mundo sabe» (in English: "simply", "obviously", "it's easy", "as everyone knows"). They make people who don't get it feel clumsy.
- Show before telling: an example, a command or a diagram before the formal definition.
- Every technical term is defined the first time it appears in the lesson, or marked with `<Term>`.
- English terms in the Spanish version: use the Spanish term if it exists and is common (*petición*, *respuesta*), with the English one in parentheses the first time («petición (*request*)»). If in practice it is used in English (*socket*, *handshake*), leave it in English in italics.
- Between 10 and 15 minutes of reading per lesson. If it goes over, split it.

## Lesson structure

The order is fixed. Each section is an `##`, except the header, which comes from the frontmatter.

1. **Header** (frontmatter `lesson`): `oneLiner`, 2 to 4 `objectives` and `prerequisites`.
2. `## El problema`: why this exists.
3. `## La analogía`: with `<Analogy>`, always with its `limits` slot.
4. `## Cómo funciona de verdad`: the mechanism, with diagrams.
5. `## Pruébalo`: with `<TryIt>` or a playground.
6. `## Ya lo has visto`: where the reader has already come across this without knowing it (the browser, the phone, the home wifi) and, if they code, in their code (`fetch`, DevTools). What anyone can see goes first; the points for people who code go at the end, after a standalone line «Y si programas:» («And if you code:»).
7. `## Errores comunes`
8. `## Resumen`: 3 to 5 points.
9. `## ¿Lo has entendido?`: 2 to 4 `<SelfCheck>`.
10. `## Para profundizar`: external links (MDN, RFCs…).

In English, the headings are: The problem, The analogy, How it really works, Try it, You have already seen it, Common mistakes, Summary, Did you get it?, Further reading.

## Lesson frontmatter

```yaml
---
translationKey: client-server   # the same in both versions of the lesson
title: "Modelo cliente-servidor: qué es y cómo funciona"   # what people search for; in quotes if it has a «:»
description: "De 70 a 155 caracteres, con las palabras de la búsqueda."
sidebar:
  label: "Modelo cliente-servidor"   # the short name: the one in the explorer and the pagination
  order: 1            # position within the phase; the introduction is 0
lesson:
  oneLiner: Responde la pregunta del título en una o dos frases. Es lo primero que se lee bajo el título, y lo que Google suele mostrar.
  objectives:
    - Primer objetivo, empezando por un verbo.
    - Segundo objetivo.
  prerequisites: []   # translationKey of the previous lessons, e.g. [client-server]
---
```

## Components

They are imported with the `~/` alias:

```mdx
import Term from '~/components/Term.astro';
import TryIt from '~/components/TryIt.astro';
import Analogy from '~/components/Analogy.astro';
import SelfCheck from '~/components/SelfCheck.astro';
```

**MDX rule:** leave a blank line after opening and before closing any component that contains Markdown, and around the contents of `<div slot="limits">`. Without those lines, MDX treats it as inline text and the content ends up in the wrong place.

- `<Term id="port">puerto</Term>`: the `id` is the file name in `src/content/glossary/<language>/`. If it does not exist, the build fails.
- `<TryIt cmd="…" output={`…`}>explanation</TryIt>`:
  - `output` is copied from a real run, never made up;
  - `windows` is not used: on Windows, the course is followed with WSL, with the same commands as on Linux (decided on 2026-10-07; Phase 1 spec, §2.2). The prop stays in the component in case it is needed some day;
  - for several lines, use a template literal: ``cmd={`línea 1\nlínea 2`}``.
  - `lang` changes the highlighting of `cmd` (default `sh`); use `lang="http"` when what the reader types is an HTTP message and not a command.
- `<Analogy>…<div slot="limits">…</div></Analogy>`: without `limits`, the build fails.
- `<SelfCheck question="¿…?">answer</SelfCheck>`
- From Starlight (`@astrojs/starlight/components`): `Aside`, `Tabs`/`TabItem`, `Steps`, `FileTree`, `Code`, `Badge`, `Card`/`CardGrid`, `LinkCard`.

## Diagrams

- **Sequences and chains:** a ```` ```mermaid ```` block. At build time it is converted to HTML (`web/src/lib/diagrams/`): no JavaScript, with the theme colors, and with the text on the page for search engines and screen readers. The texts go in the language of the lesson. Only this is supported:
  - `sequenceDiagram` with 2 to 6 participants: `participant X as Nombre`, `X->>Y: texto` (message), `X-->>Y: texto` (response) and `Note over X: texto` or `Note over X,Y: texto`. `<br/>` breaks a line;
  - `flowchart TB` as a chain, without branches: `A["Nombre<br/>detalle"] -->|enlace| B["…"]`.

  Anything else makes the build fail with the file and the line. For other diagrams, a custom component (next point).
- **What Mermaid does not draw well** (layers, encapsulation, NAT): a custom component in `web/src/components/diagrams/`, with the texts as props and the colors from the `--sl-color-*` variables. HTML and CSS (grid or flex) are better than SVG: an SVG shrinks as a whole on mobile and the text becomes unreadable, whereas with HTML the text keeps its size and screen readers can read it. Use SVG only for shapes that HTML cannot draw.
  - `<Encapsulation caption layers blocks />` already exists: how each layer adds its header.
  - `<NatTranslation caption labels steps table />` already exists: how the router rewrites the source and destination of a packet with NAT, hop by hop, and its translation table.
  - `<DataToScreen caption labels json card />` already exists: the data a backend sends (JSON) next to what the frontend draws with it (a weather card).
- Never images with embedded text, because they would have to be duplicated per language.

## Glossary

Each term is a file `src/content/glossary/<language>/<id>.yaml`:

```yaml
term: Puerto
short: Una o dos frases. Sin jerga que no esté a su vez en el glosario.
related: [server, localhost]   # ids of other terms; they must exist in the same language
lesson: ip-ports-sockets       # optional: the translationKey of the lesson that explains it
```

The glossary links each term to the lesson that explains it («Se explica en…», "Explained in…"): by default, the first one in the course that uses it with `<Term>`, counting the phase introductions. If that lesson only mentions it and another one explains it, point to the right one with `lesson`. If the key does not exist in any language, the build fails.

If `short` contains a colon followed by a space («Nombre: valor»), put it in single quotes. Otherwise YAML interprets it as a new key and the build fails.

## Terminal exercises

- Before publishing, run the command for real (on macOS) and copy the output into `output`.
- If the output changes from one computer to another (IPs, dates, versions), say so in the explanation: «tus números serán distintos» ("your numbers will be different").
- If the command waits on purpose (`nc -l`), explain that it is stopped with <kbd>Ctrl</kbd> + <kbd>C</kbd>.
- Personal data in the output (MAC addresses, public IPs, user or computer names) is replaced with example values, and the explanation says so: «hemos cambiado la dirección MAC por una de ejemplo» ("we have replaced the MAC address with an example one").
- The example user is `ana`, on the computer `portatil`, with the folder `/Users/ana` and the group `staff`; on the practice server, `ubuntu`, on the VM `curso`. Outputs are captured in an example home folder, never in the author's.
- Commands are also run on a real Ubuntu (for example, `docker run --rm -it ubuntu:24.04 bash`), and every difference from macOS that the reader is going to notice is mentioned in the explanation of the `<TryIt>`.

## Translation

- Spanish is the original. The English translation is done when the author approves the Spanish version.
- The lesson, its new glossary terms and the texts of its diagrams are translated at the same time.
- An English lesson that uses `<Term>` needs its terms in `glossary/en/`. If they are missing, the build fails, and that is how we want it to work.

## Theme (code editor)

The site imitates a code editor (spec: `docs/specs/2026-10-02-ide-theme-design.md`).

- **Color:** the only source is the `--ide-*` tokens in `web/src/styles/theme.css`, with one block for dark (`:root`) and another for light (`:root[data-theme='light']`). Components carry no hex values: they use `var(--ide-…)`.
- **Contrast:** `web/src/styles/tokens.test.ts` requires at least 4.5:1 for every text token over `bg`, `chrome`, `deep`, `selection` and `line` (the background of the highlighted line), in both themes, and 3:1 for the border of form fields (`--ide-control`, WCAG 1.4.11; `--ide-border` does not reach it and is only for separating panels). `--ide-sun` (the sun in `<DataToScreen>`) is decorative and has no contrast requirement. If you change a color, make the tests pass.
- **Typography:** the frame (explorer, tabs, titles, panels, code) uses `var(--__sl-font-mono)` (JetBrains Mono); the prose, `--sl-font` (Atkinson Hyperlegible Next).
- **Decorative marks** (`#`, `##`, line numbers, `- [ ]`, `//`, `>`): in CSS with `content: "…" / ""`, so they are neither read nor copied; in the HTML, with `aria-hidden="true"`. Text with meaning is always visible or in `.sr-only`.
- **File names:** they are generated by `web/src/lib/explorer.ts` from the sidebar label (`sidebar.label`, or the title if there is no label): `02-que-es-un-protocolo.md`. The accessible name of each link is that same label.
- **The editor cannot use jargon:** the names that are visible must be understandable by anyone. That is why the home page is `inicio.md` / `home.md` (not `README.md`) and the syllabus is `temario.md` in Spanish. If a technical word helps SEO, it goes in the `<title>` and in the description, not in the explorer.
- **Spaces in Astro:** the compiler removes line breaks between tags. If two inline elements need a space between them, use `{' '}` and check the HTML.
- **Widths:**
  - prose (paragraphs, lists, `dl` and quotes) reaches at most `--ide-measure` (75ch);
  - boxes, `--ide-box-width`;
  - wide pieces use the whole editor: tables, `figure`, code blocks, `TryIt`, labs (`astro-island`) and the phase list.
  A new component that needs width is added to that list in `theme.css` ("Readable prose").
- **Line numbers:** the title is 1 and the lesson's lead-in is 2. Pieces that scroll (tables, sequence and chain diagrams, labs) carry no number.
- **Minimap:** it draws every word of the title, the lead-in and the content, like VS Code's. What goes in `pre`, `code` or an Expressive Code block comes out green; if a new component shows code in some other way, add it to `wordKind` (`web/src/lib/minimap.ts`).
- **Tabs and side panel:**
  - playgrounds and the glossary are pinned tabs (`web/src/lib/pinned-tabs.ts`), not files in the explorer; the theme and the language are in the header (desktop) and in the menu (mobile);
  - the page outline is in the explorer (`Outline.astro`) and starts collapsed: it marks the section whose heading has reached where a jump lands (`scroll-padding-top`), so if the height of the tabs changes, `scroll-padding-top` in `theme.css` changes too;
  - what is remembered in the browser (`web/src/lib/storage.ts`): the theme (`starlight-theme`, from Starlight), whether the outline is open (`ide-outline`) and the last page opened, for the first tab of playgrounds and glossary (`ide-last-page:<language>`).
- **Playgrounds:** every new lab or playground is added to `web/src/data/playgrounds.ts` (level, lesson and texts in both languages) and to the `playgrounds.mdx` page of its phase, if it is the first of that phase. It always goes in the «Pruébalo» ("Try it") of its lesson: the link on the page points there.

## Playgrounds

A playground is a React component inside a lesson (Phase 0 spec, §6.4). The first, and the model for the rest, is `tcp-handshake` (`docs/specs/2026-10-03-tcp-lab-design.md`).

- **Where:** one folder per playground in `web/src/playgrounds/<name>/`.
- **Logic and interface separate:**
  - the logic is pure TypeScript, with no React and no texts (in `tcp-handshake`, `machine.ts` with `reduce(state, event)`), and has tests for each scenario;
  - the interface only draws it.
- **Texts:** in `strings.ts`, with an `es` entry and an `en` entry of the same type, so TypeScript requires the same keys in both languages. The logic returns keys and data (`{ key: 'server-buffers', ack: 107 }`), not sentences.
- **Imports:** relative within the folder, because Vitest does not know the `~/` alias.
- **Styles:** its own CSS with a prefix (`tcp-lab__…`) and only `--ide-*` tokens. The root carries `not-content`, so Starlight's prose styles do not affect it, and `data-pagefind-ignore`, so the search does not index the buttons.
- **Accessibility:**
  - everything works with the keyboard;
  - what changes is announced in an `aria-live="polite"` region;
  - a button that disappears when pressed leaves the focus on another control;
  - with `prefers-reduced-motion`, nothing is animated.
- **In the lesson:** `import X from '~/playgrounds/<name>/X';` and `<X client:visible lang="es" />`. `client:visible` makes React's JavaScript download only when the playground enters the screen.
- **Tests:** besides the logic ones, one that renders the component with `react-dom/server` in both languages.

## Routes, translations and SEO

- **Routes:** Spanish goes at the root and English under `/en/`. Each phase has its folder in each language (`fase-N` and `phase-N`), and each lesson its file name in its language, which is its URL (`fase-0/que-es-dns.mdx`, `en/phase-0/what-is-dns.mdx`). Routes are not changed once published.
- **`translationKey`:** both versions of a lesson carry the same one in the frontmatter (the short English name: `dns`). It is what joins them for the language selector, the `hreflang` and Google. `prerequisites` uses these keys: `[tcp-vs-udp]`.
- **Translating a phase:** first its introduction (`en/phase-N/index.mdx`) and then the lessons. The build fails if a lesson does not have its phase's introduction in its language.
- **File names:** lowercase and without accents (`que-es-dns.mdx`), because they are the URL.
- **Internal links:** with the route of the page's language (`/fase-0/que-es-dns/` or `/en/phase-0/what-is-dns/`).
- **Titles for search engines:** the `title` is the question or the search people make («Qué es el DNS y cómo funciona»), and `sidebar.label` the short name («DNS»). The full `<title>`, with the site name, does not go over 70 characters, and the description is between 70 and 155. The audit checks it.
- **SEO audit:** the build fails if a page breaks any rule in `web/src/lib/seo/audit.ts`. For example:
  - one `<h1>`, title and description;
  - canonical, sitemap and reciprocal `hreflang`;
  - no fallback pages;
  - breadcrumbs, the site name (`WebSite`) on the home page and social image;
  - at most 400 KB of JavaScript per page.

  If it fails, the log says the page and the rule.
