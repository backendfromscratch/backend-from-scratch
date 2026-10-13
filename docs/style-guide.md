# Lesson style guide

## Voice

- Address the reader informally (in Spanish, with *tú*) and write as you would explain something to a colleague, without condescension.
- **Write for a general audience:** do not assume any programming knowledge. If a lesson uses `fetch`, a variable or a function, explain in one sentence what it is, or link to where it is explained. References to the work of a frontend dev are an extra for those who are one, never a requirement to understand the lesson.
- **DevTools is for everyone** from lesson 4 of Phase 0, which explains how to open it in Chrome. The following lessons use it without hiding it behind «Y si programas:» ("If you code:") and refer back to that lesson.
- Short sentences. One idea per paragraph.
- Forbidden: «simplemente», «obviamente», «es fácil», «como todo el mundo sabe» (in English: "simply", "obviously", "it's easy", "as everyone knows"). They make people who don't get it feel clumsy. A test fails if they appear in a lesson or the glossary (`web/src/content/voice.test.ts`).
- Show before telling: an example, a command or a diagram before the formal definition.
- Every technical term is defined the first time it appears in the lesson, or marked with `<Term>`.
- English terms in the Spanish version: use the Spanish term if it exists and is common (*petición*, *respuesta*), with the English one in parentheses the first time («petición (*request*)»). If in practice it is used in English (*socket*, *handshake*), leave it in English in italics.
- Between 10 and 15 minutes of reading per lesson. If it goes over, split it.

## What readers value: the eight principles

What research on reading and learning says works best in courses and technical articles (adopted on 2026-10-11). Each principle says how it is applied here; several only point to rules that already exist. They are used twice: when writing (Claude drafts with them) and when reviewing (the checklist at the end of this guide goes through them one by one).

1. **Scannable text.** Most people scan a web page before (or instead of) reading it word by word (Nielsen Norman Group, "How users read on the web" and the F-shaped pattern).
   - The most important thing goes first: in the lesson, the `oneLiner` answers the title; in each section, its first paragraph; in each paragraph, its first sentence. Reading only the first sentences should tell the story.
   - `###` headings inside "Cómo funciona de verdad" say what is below («El servidor contesta con un código»), never a generic label («Detalles», «Más información»).
   - Paragraphs of 2 to 4 sentences and no more than about 80 words: above that, split them. Three or more parallel items go in a list; a comparison of several things on several features goes in a table.
   - Bold only for what someone scanning must not miss: the key term where it is defined, or the takeaway of a paragraph. One or two per section, not one per paragraph.
   - "El problema" gets to the point in two or three short paragraphs: no long introductions.
2. **Conversational tone** (Mayer's personalization principle: people learn more from a conversational style than from a formal, impersonal one). The rules are in "Voice": *tú*, a colleague explaining something, short sentences and none of the forbidden words. Also: active voice («el servidor envía», not «es enviado por el servidor») and the reader as the subject of what they do («escribes», «verás»).
3. **The example first, then the definition** (the worked-example effect: beginners learn more from a solved example than from the rule alone).
   - "Show before telling", in "Voice": a command, an output or a diagram before the formal definition.
   - A new procedure is first shown solved, step by step, with each step explained; then the reader does it, or a variant, in "Pruébalo".
   - Concrete before abstract: real names, real numbers and real outputs (`example.com`, `200`, `ana@portatil`), not «un servidor X» or «cierto código».
4. **Analogies with their limits.** Always with `<Analogy>` and its `limits` slot (the build fails without it). The analogy comes from everyday life, not from another technology the reader may not know, and the limits say where it stops being true before it causes a wrong idea.
5. **The expected output of every command.** Every `<TryIt>` has its real `output` (see "Terminal exercises"), and the explanation says what to look at in it («fíjate en el `200` de la primera línea») and what to do if it is different: the most likely error and how to fix it.
6. **Questions to check what was learned** (retrieval practice: trying to remember fixes things better than reading again; Roediger and Karpicke, 2006). The `<Quiz>` of "¿Lo has entendido?" (see "Quiz"):
   - make the reader apply the idea to a new case (a scenario, an output to interpret, a decision), never repeat a sentence from the lesson word for word;
   - at least one of them is a situation («Tu web devuelve 502 a las tres de la mañana: ¿qué miras primero?»);
   - the answer explains why, not only what.
7. **Stories and real cases.** A situation is remembered better than a list of commands.
   - "El problema" starts from a concrete situation the reader can imagine (a web that goes down, a password that leaks, a page that takes ten seconds), not from a definition.
   - "Pruébalo" has a goal, not only steps: something to find out or to fix («encuentra la IP que está escaneando tu servidor»). The practice log (`/practicas/access.log`) hides four stories for this.
   - Invented stories are told as examples («imagina que…»). A real incident from a real company is only told with a link to its public source (a postmortem, an article).
8. **The voice of someone who lived it.** Notes in the first person about what was hard or surprising build trust, and Google values first-hand experience (the first E in E-E-A-T). That a frontend dev learns backend while writing the course is this site's advantage.
   - They go in an `<Aside type="note" title="Nota del autor">` («Author's note» in English), at most two per lesson, next to the idea they talk about.
   - **Only the author's real experiences.** Claude never invents them. While drafting, Claude can mark a spot with an MDX comment, `{/* NOTA DEL AUTOR: ¿qué te costó entender de X? */}`, and the author writes the note, or dictates it, during the review. If the author has nothing to say there, the comment is deleted: a lesson without author notes is fine. The same test fails while a `NOTA DEL AUTOR` comment is left or a lesson has more than two notes.

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
9. `## ¿Lo has entendido?`: a `<Quiz>` of 6 questions (see "Quiz"). Since 2026-10-12 it replaces the open questions of `<SelfCheck>`.
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
import Quiz from '~/components/Quiz.astro';
import QuizQuestion from '~/components/QuizQuestion.astro';
import QuizOption from '~/components/QuizOption.astro';
```

**MDX rule:** leave a blank line after opening and before closing any component that contains Markdown, and around the contents of `<div slot="limits">`. Without those lines, MDX treats it as inline text and the content ends up in the wrong place.

- `<Term id="port">puerto</Term>`: the `id` is the file name in `src/content/glossary/<language>/`. If it does not exist, the build fails.
- `<TryIt cmd="…" output={`…`}>explanation</TryIt>`:
  - `output` is copied from a real run, never made up;
  - `windows` is not used: on Windows, the course is followed with WSL, with the same commands as on Linux (decided on 2026-10-07; Phase 1 spec, §2.2). The prop stays in the component in case it is needed some day;
  - for several lines, use a template literal: ``cmd={`línea 1\nlínea 2`}``.
  - `lang` changes the highlighting of `cmd` (default `sh`); use `lang="http"` when what the reader types is an HTTP message and not a command.
- `<Analogy>…<div slot="limits">…</div></Analogy>`: without `limits`, the build fails.
- `<Quiz>`, `<QuizQuestion>` and `<QuizOption>`: the test at the end of a lesson (see "Quiz").
- `<SelfCheck question="¿…?">answer</SelfCheck>`: a challenge with a hidden solution inside «Pruébalo» («Reto: …»). Not for «¿Lo has entendido?», which is a `<Quiz>`.
- From Starlight (`@astrojs/starlight/components`): `Aside`, `Tabs`/`TabItem`, `Steps`, `FileTree`, `Code`, `Badge`, `Card`/`CardGrid`, `LinkCard`.

## Quiz

The test at the end of every lesson (piloted in «Qué es el backend» and adopted by the author on 2026-10-12). The reader chooses an answer, checks it and sees at once whether it was right and why; at the end, the score and links to the sections of the lesson to review. Each question is checked with a button and not on choosing, because with the keyboard the arrows move through the options and would choose them.

```mdx
import Quiz from '~/components/Quiz.astro';
import QuizQuestion from '~/components/QuizQuestion.astro';
import QuizOption from '~/components/QuizOption.astro';

<Quiz>

<QuizQuestion
  question="La web de una tienda comprueba en el formulario que tienes más de 18 años. ¿Es suficiente?"
  review="Por qué no puede hacerlo todo el frontend"
>

<QuizOption text="No: el backend tiene que volver a comprobar la edad." correct>

Why it is right, in one or two sentences.

</QuizOption>

<QuizOption text="Sí, siempre que el formulario esté bien programado.">

Why it is wrong: the mistaken idea behind it, and what is true instead.

</QuizOption>

</QuizQuestion>

</Quiz>
```

- **6 questions**, with 3 options each and exactly one `correct`. The right one goes in a different position from one question to the next, and it is not the longest one.
- **Wrong answers that look right:** each one is a mistake people really make (the lesson's "Errores comunes" are a good source), not an obvious joke. The option states the mistaken belief itself, so that everything in it is false: «Sí: para comprar hay que pasar por el formulario», not «Sí: si el formulario no te deja seguir, la compra no llega al backend», which is true and only fails as a reason. An option with a true reason tests reading, not understanding. Multiple choice only makes the reader remember if the wrong options compete (Little and Bjork, 2012).
- **Every option explains itself:** the right one, why; a wrong one, why not. The reader sees the explanation of what they chose and of the right answer right after checking, so a wrong answer is not remembered as true (Butler and Roediger, 2008).
- **`review` is the text of a heading of the same page**, the one that explains the question. If it does not exist, the build fails. In English, a straight apostrophe matches the typographic one of the heading.
- The rest of principle 6 still applies: apply the idea to a new case, at least one situation, and nothing copied from the lesson. The tone is not an exam: «Has acertado 4 de 6», never a pass or a fail.
- `question` and `text` are props: they are not Markdown, so in English write the typographic apostrophe (’) yourself. The explanations are Markdown.

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

A term with an acronym (capital letters: «API», «Dirección IP», «TTL (en DNS)») says what the letters stand for, so the reader learns what it literally means too. The popover and the glossary page show it above the definition («API viene del inglés *Application Programming Interface* («interfaz de programación de aplicaciones»).»), with the English words marked `lang="en"` for screen readers. Without it, the build fails. The definition (`short`) does not repeat it.

```yaml
acronym:
  letters: API                                 # as they appear in the term
  stands: Application Programming Interface    # in English: Title Case for names, lowercase for measures (time to live)
  translation: interfaz de programación de aplicaciones   # only in Spanish
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

- Spanish is the original. The English translation is done when the author approves the Spanish version, or before if the author asks for it (Phase 2, 2026-10-13); then every correction from their reading goes into both languages.
- The lesson, its new glossary terms and the texts of its diagrams are translated at the same time.
- An English lesson that uses `<Term>` needs its terms in `glossary/en/`. If they are missing, the build fails, and that is how we want it to work.
- **English is American,** punctuation included: the period and the comma go inside the quotation marks (“…hand it to me.”), and a quote that ends in «?» or «!» takes no other mark (“Hello?” The caller…). The exception is literal text, what the reader presses or what a program handles letter by letter: there the punctuation stays outside so it does not look like part of the text (press “Next step”.; “Hi, ”, “how are ” and “you?”). Decided on 2026-10-11.

## Theme (code editor)

The site imitates a code editor (spec: `docs/specs/2026-10-02-ide-theme-design.md`).

- **Color:** the only source is the `--ide-*` tokens in `web/src/styles/theme.css`, with one block for dark (`:root`) and another for light (`:root[data-theme='light']`). Components carry no hex values: they use `var(--ide-…)`.
- **Contrast:** `web/src/styles/tokens.test.ts` requires at least 4.5:1 for every text token over `bg`, `chrome`, `deep`, `selection` and `line` (the background of the highlighted line), in both themes, and 3:1 for the border of form fields (`--ide-control`, WCAG 1.4.11; `--ide-border` does not reach it and is only for separating panels). `--ide-sun` (the sun in `<DataToScreen>`) is decorative and has no contrast requirement. If you change a color, make the tests pass.
- **Typography:** the frame (explorer, titles, panels, code) uses `var(--__sl-font-mono)` (JetBrains Mono); the prose, `--sl-font` (Atkinson Hyperlegible Next).
- **Decorative marks** (`#`, `##`, line numbers, `- [ ]`, `//`, `>`): in CSS with `content: "…" / ""`, so they are neither read nor copied; in the HTML, with `aria-hidden="true"`. Text with meaning is always visible or in `.sr-only`.
- **File names:** they are generated by `web/src/lib/explorer.ts` from the sidebar label (`sidebar.label`, or the title if there is no label): `02-que-es-un-protocolo.md`. The accessible name of each link is that label followed by the file name, separated by a comma («IP, puertos y sockets, 05-ip-puertos-y-sockets.md»; `fileLinkName` in `explorer.ts`): a screen reader starts with the real name, and someone using voice control can say what they see (WCAG 2.5.3, "Label in Name"). Not in parentheses: checkers such as axe, the one inside Lighthouse, drop what is in parentheses before comparing. The same applies to any link or button whose visible text differs from its name, such as the site title (`backend-desde-cero`). A visible text split across several elements needs the spaces in the HTML (`{' '}`): otherwise the words are joined. `web/e2e/` checks it on every page (`label-content-name-mismatch`).
- **The editor cannot use jargon:** the names that are visible must be understandable by anyone. That is why the home page, when it is shown as a file (the status bar), is `inicio.md` / `home.md` (not `README.md`), the syllabus is `temario.md` and the folder with the playgrounds and the glossary is `recursos/` in Spanish. If a technical word helps SEO, it goes in the `<title>` and in the description, not in the explorer.
- **Spaces in Astro:** the compiler removes line breaks between tags. If two inline elements need a space between them, use `{' '}` and check the HTML.
- **Widths:**
  - prose (paragraphs, lists, `dl` and quotes) reaches at most `--ide-measure` (75ch);
  - boxes, `--ide-box-width`;
  - wide pieces use the whole page column, at most `--ide-page-width` (72rem): tables, `figure`, code blocks, `TryIt`, labs (`astro-island`) and the phase list. From 120rem of window, the column is centered in the editor.
  A new component that needs width is added to that list in `theme.css` ("Readable prose").
- **Line numbers:** the title is 1 and the lesson's lead-in is 2. Pieces that scroll (tables, sequence and chain diagrams, labs) carry no number.
- **Minimap:** it draws every word of the title, the lead-in and the content, like VS Code's. What goes in `pre`, `code` or an Expressive Code block comes out green; if a new component shows code in some other way, add it to `wordKind` (`web/src/lib/minimap.ts`).
- **Side panel and header:**
  - there are no tabs (since 2026-10-11): the explorer only has folders, the phases and `recursos/` with playgrounds and the glossary (`explorerPages`, in `web/src/lib/explorer.ts`); the home page is the site title; the theme button and the «ES · EN» links are in the header (desktop) and in the menu (mobile);
  - on a computer, the header button hides the whole side panel (`ExplorerToggle.astro`); anything new in the panel disappears with it;
  - the page outline is in the explorer (`Outline.astro`) and starts collapsed: it marks the section whose heading has reached where a jump lands (`scroll-padding-top`), so if something fixed is added under the header, `scroll-padding-top` in `theme.css` changes too;
  - what is remembered in the browser (`web/src/lib/storage.ts`): the theme (`starlight-theme`, from Starlight; `web/src/lib/theme.ts`), whether the outline is open (`ide-outline`), the folders opened or collapsed (`ide-folders`) and whether the side panel is hidden (`ide-explorer`).
- **Headings:** title 28 px, `##` 22 px and `###` 18 px (24, 20 and 18 on mobile), with the prose at 18 px. They are set with `--sl-text-h1` to `--sl-text-h5` in `theme.css`; a new size goes there, not in a component.
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
- **Tests:** besides the logic ones, one that renders the component with `react-dom/server` in both languages, and a case in `web/e2e/states.e2e.ts` that takes it through its states (results, errors) and checks each one with axe-core, in dark and light. The page scan alone only sees the playground before it is used.

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

## Writing and review checklist

Used when a lesson is drafted and again when it is reviewed (the independent review and the author's). The reviewer answers each point with yes or no, and every "no" becomes a change or a reasoned exception. What the build and the tests already check (that every `<Term>` has its glossary entry, `limits`, links, SEO, forbidden words, author notes left pending or more than two) is not on the list. Whether a term needs explaining is a judgment, so it is on the list.

**Scannable (1)**
- [ ] Reading only the `oneLiner` and the first sentence of each paragraph, the lesson can be followed.
- [ ] No paragraph goes over about 80 words or mixes two ideas.
- [ ] Every `###` heading says what is below.
- [ ] Parallel items are in lists, comparisons in tables, and bold is used sparingly.
- [ ] "El problema" gets to the point in two or three paragraphs.

**Tone (2)**
- [ ] It reads like a colleague explaining, with *tú* and in the active voice.
- [ ] Someone with no programming knowledge can follow it: every term is explained or has its `<Term>`.

**Examples (3, 4)**
- [ ] Every new idea has a concrete example, command or diagram before its definition.
- [ ] Every new procedure is shown solved before the reader does it.
- [ ] The analogy comes from everyday life and its limits say where it breaks.

**Practice (5, 6)**
- [ ] Every command has its real output, says what to look at and what to do if it is different.
- [ ] "Pruébalo" has a goal: something to find out or to fix.
- [ ] Each quiz question makes the reader apply the idea; at least one asks about a situation, and the answers explain why. In a quiz, the wrong options are real mistakes and each one says why it is wrong.

**Stories and voice (7, 8)**
- [ ] "El problema" starts from a concrete situation.
- [ ] Invented stories are told as examples; real incidents have their source.
- [ ] Author notes are the author's own experience, next to the idea they talk about.
