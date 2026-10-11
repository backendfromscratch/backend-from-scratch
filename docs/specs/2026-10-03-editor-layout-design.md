# Editor layout (design C) — design

**Status:** approved by the author on 2026-10-03 and implemented. Simplified on 2026-10-11 (§2): no tabs or breadcrumbs, the playgrounds and the glossary in the explorer, the theme and the language as a button and two links, smaller headings, and a page column with a maximum width, centered on very wide monitors.
**Sketches:** https://claude.ai/artifact/1J4ae5sUqPwN4QZoQ6k7GK (canvas "VS Code-style layout", layout "C · Outline in the explorer").
**Extends:** `docs/specs/2026-10-02-ide-theme-design.md`. What changes here replaces what that document says; the rest stays as it is (colors, typography, lesson components).

## 1. What we want

1. **Use the width.** Today the content is a centered column with empty margins on both sides. The editor has to fill the whole central area, as in VS Code.
2. **Look more like VS Code**, without copying its brand or its icons: explorer with an outline, line numbers flush with the edge, minimap and a discreet status bar. (Tabs and breadcrumbs were part of it until 2026-10-11.)
3. **Without losing legibility.** Prose does not go past about 75 characters per line (proposal B, full-width prose, was discarded for that reason). What gains width are the blocks that need it: tables, diagrams, code, terminals and labs.

## 2. The author's decisions (2026-10-03)

- Layout **C**: the page outline moves down to the explorer and there is a minimap on the right.
- ~~**Activity bar** on the left, with the theme and the language at the bottom.~~ Removed the same day, 2026-10-03, after seeing it: the playgrounds and the glossary become **pinned tabs** (§4.2) and the theme and the language go back to the header (§4.1). The button to hide the explorer is removed: the text already has a maximum width and hiding it barely changed the reading.
- **Discreet status bar**, in the panels' color. Orange is kept for the active file and the logo.

**Simplified on 2026-10-11, after using it:**

- **No tabs:** they repeated the title and took a row on every page (on mobile, together with the breadcrumbs, the title began below the middle of the screen). `playgrounds.md` and `glosario.md` go back to the explorer, under `inicio.md` (§4.3), which on mobile is in the ☰ menu. The "last page" tab goes with them.
- **No breadcrumbs:** the phase was already in the explorer and in the status bar. Only the reading time stays, above the title of a lesson (§4.4).
- **Theme and language** (§4.1): a single button for the theme and the languages as two links, «ES · EN», instead of Starlight's two `<select>`, whose names were cut short («Auto…», «Españ…»).
- **Smaller headings** (§4.4): Starlight's were 42 px for the title on a computer, and look bigger still in monospace.
- **A maximum width, and centered on very wide monitors** (§4.4): at 2,560 px everything sat on the left with an empty half on the right, and the wide pieces stretched to about 2,000 px (the weather diagram had two 740 px cards and a one-line caption 1,500 px long).

## 3. The layout by screen width

| Width | Explorer and outline | Minimap | Page table of contents | Line numbers |
|---|---|---|---|---|
| ≥ 82rem (≈ 1,312 px) | on the left | on the right | in the explorer | yes |
| 50–82rem | on the left | no | in the explorer | yes |
| < 50rem (mobile) | in the ☰ menu (no outline) | no | the «En esta página» dropdown ("On this page"), as today | no |

The side panel is the same size as before the layout, 19.25rem, all of it for the explorer. From 2026-10-11 the page column has a maximum width, 72rem (1,152 px), and from 120rem (1,920 px) it is centered in the editor (§4.4).

The minimap threshold comes from adding up the side panel (≈ 308 px), line numbers (80 px), prose at 75ch (≈ 780 px), right margin (40 px) and minimap (96 px).

## 4. The pieces

### 4.1 Header

- Site name on the left and search in the center, with the text «Buscar lección, término o comando» (already planned in the theme).
- On the right (since 2026-10-11), the theme and the language. On mobile, they are in the ☰ menu, below the explorer. Both replace Starlight's components, so its mobile menu uses them too:
  - **Theme** (`overrides/ThemeSelect.astro`): one icon button that switches between dark and light. The icon is the theme the click leads to (the sun in dark mode). Until the first click the page follows the system, as before; then it remembers the choice in Starlight's key (`starlight-theme`), so Starlight's script in the `<head>` paints it with no flash. Logic with tests: `web/src/lib/theme.ts`.
  - **Language** (`overrides/LanguageSelect.astro`): two links, «ES · EN», to the real translation of the page (or the home page of the language if it is not translated). The current one is bold, with `aria-current="page"`. Each link's accessible name starts with what it shows («EN English»), and its `lang` and `hreflang` say the language. Unlike a `<select>`, Google follows the links, and it is one click.

### 4.2 ~~Pinned tabs~~

Removed on 2026-10-11 (§2). From 2026-10-03 to 2026-10-11 there was a strip with the tab of the open page and two pinned tabs, playgrounds and glossary; Git history keeps it.

### 4.3 Side panel: explorer and outline

Two sections, one above the other, each with its own scroll. Their scrollbars are like VS Code's (added on 2026-10-04), like all the site's scrollbars: straight, with no arrows or track, and in the theme's translucent gray (`--ide-scrollbar`); 10 px in the panel, the code, the tables and the labs, and 14 px for the page, as in the editor. The panel's ones sit flush with its edge and only show with the mouse over them or focus inside; the others, always. Mouse only: on touch screens and in forced colors, the system's ones. The tree does not collapse: the home page and the phases are always visible. The outline does collapse (`<details>`):

- **EXPLORADOR (explorer):** `inicio.md`, `playgrounds.md` (flask icon) and `glosario.md` (book icon), then the phases, with no root folder. The syllabus (`temario.md`) is not there: it is linked from the home page. From 2026-10-03 to 2026-10-11 the playgrounds and the glossary were pinned tabs. The logic, with tests: `explorerPages` in `web/src/lib/explorer.ts`. Compared with the previous tree:
  - arrows instead of triangles;
  - a `#` icon in front of each file, in `--ide-info`;
  - a vertical indentation guide on open folders.
- **ESQUEMA (outline):** the page's table of contents, with its level in front (`#`, `##`, `###`) in `--ide-keyword`. The current section is marked while scrolling: it is the last one whose heading has already reached where a jump to an anchor lands. It is a custom component (`Outline.astro`, with the logic in `src/lib/outline.ts`), not Starlight's table of contents: Starlight's watches a fixed strip under the header and, when jumping to a section, it marked the previous one. On pages with no table of contents (home page, glossary) the section does not appear. It starts collapsed; if the reader opens it, it stays open on the following pages (`localStorage`, key `ide-outline`). Open, it is as tall as its content (at most 42 %) and scrolls by itself to show the marked section. If it would only have «Sinopsis» (the syllabus), it is not drawn.

Height split: about 58 % for the explorer and 42 % for the outline. If one section collapses, the other gets all the height.

### 4.4 Editor

- **Reading time:** above the title of a lesson, small and in `--ide-muted` («13 min de lectura»), in `overrides/PageTitle.astro`. (Until 2026-10-11 it was in the breadcrumbs, after the phase, below the tabs.)
- **Headings** (2026-10-11): title 28 px, `##` 22 px and `###` 18 px on a computer; 24, 20 and 18 px on mobile, where the title used to take four lines. Prose stays at 18 px: the headings stand out by the monospace, the weight and the `#` marks. They are Starlight's `--sl-text-h1` to `--sl-text-h5`, set in `theme.css`.
- **Line numbers:** flush with the editor's left edge. The text starts right after them, left-aligned and not centered. The title is line 1 and the lesson's introduction (sentence, goals and prerequisites) is line 2. Tables, diagrams and labs still have no number, for the same reason as today (they would clip the number when scrolling).
- **Width:** prose (paragraphs and lists) goes up to 75ch at most. The lesson's introduction, up to about 820 px at most. Tables, diagrams, code blocks, `TryIt` and labs use the page column's full width, at most `--ide-page-width` (72rem, 1,152 px; since 2026-10-11, before it had no limit). From 120rem (1,920 px) of window, the column is centered between the explorer and the minimap, like VS Code's "Centered Layout"; below, it stays left-aligned after the line numbers, as it was. The explorer, the minimap and the status bar stay at the edges. Note: in Atkinson Hyperlegible Next the "0" is wide, so 75ch (≈ 875 px at 18 px) is about 100 real characters per line, not 75; today, with 70ch, it was about 90. For about 75 real characters we would need `--ide-measure: 40rem`. Pending the author's decision.
- **Highlighted line:** when the mouse hovers over a block, its background lightens from edge to edge of the editor and its number changes to `--ide-text`, like VS Code's current line.
- **No rule** separating the title from the content, as there is today.

### 4.5 Minimap (≥ 82rem)

- A column of about 96 px flush with the right edge. Since 2026-10-04 it is the page in miniature, like VS Code's: each word is a stroke of its real width, on its line and with its indentation, drawn on a `<canvas>`. Headings use `--ide-keyword`, code (`pre`, `code` and Expressive Code) uses `--ide-string`, and the rest uses `--ide-gutter`. Before, each block was a striped bar.
- The scale is fixed, like VS Code's `proportional` mode (its default): the content fits across the width and the same scale is used for the height, so a line of text is about 2 px tall. If the drawing is taller than the minimap, the minimap slides along with the page. A translucent rectangle marks the part being viewed.
- When clicking outside the rectangle, the page jumps to that point, with no smooth scrolling if the reader asks for `prefers-reduced-motion`. When dragging, the rectangle follows the pointer, like a scrollbar.
- It is built in the browser with a small script, without React. It is redrawn when the window or the content changes size (`ResizeObserver`), when the theme changes (`data-theme`) or when the font finishes loading, because the width of the words changes.
- It is decorative for accessibility (`aria-hidden="true"`, outside the tab order): anyone using a keyboard or a screen reader has the outline.
- A `<canvas>` has no text, so it does not change what Google or Pagefind index.

### 4.6 Status bar

It has the same content as today (`⎇ main`, `fase-0 · lección 2/8`, `Markdown`, `ES`). The only thing that changes is the color: `chrome` background, `--ide-muted` text and a `border` top border.

### 4.7 Mobile (< 50rem)

Same as today:

- header with the ☰ menu;
- the «En esta página» dropdown;
- no line numbers.

Inside the menu is the explorer, with the playgrounds and the glossary and without the ESQUEMA section, and below it the theme button and the language links.

### 4.8 Print

No side panel, minimap or status bar, as today.

### 4.9 Playgrounds page

`/playgrounds/` and `/en/playgrounds/` bring together the course's labs and playgrounds, by phase. Each piece has its level (lab or playground), a sentence and a link to the «Pruébalo» ("Try it") of its lesson. The data lives in `web/src/data/playgrounds.ts`; a test checks that each piece points to a lesson that exists in both languages and that really uses it. The home page links to it. Later on, each playground can have its own page, which is what ranks best.

## 5. New tokens

- `--ide-line`: the background of the highlighted line, between `bg` and `selection` (dark `#211f2a`, light `#f2f0f7`). It goes into `tokens.test.ts` as a background: every text token must have at least 4.5:1 over it.

## 6. SEO, performance and accessibility

- **SEO:** the content of no page or its tags changes. The table of contents goes from an `<aside>` on the right to a section of the side `<nav>`, but both are navigation. The language links are in the header and in the footer of the mobile menu, and the `languageLinksMatchHreflang` rule (`language-links`) checks they lead to the same pages as the `hreflang` (until 2026-10-11 it read the options of a `<select>`).
- **JavaScript:** the outline and the minimap are small scripts, without React. The 400 KB per page limit is not affected. The audit checks it on every build.
- **Accessibility:**
  - the explorer files, the theme button and the language links have an accessible name that starts with what they show;
  - the panel's sections collapse with `<details>`;
  - the minimap is left out of the accessibility tree;
  - keyboard focus shows with the accent, as today.

## 7. What changes in the code (for the plan)

- `Header` (replaced): name, search and, on the right, theme button and language links (`ThemeSelect` and `LanguageSelect`, replaced).
- `Sidebar` (already replaced): EXPLORADOR and ESQUEMA sections (`Outline.astro`, custom; see §4.3). The mobile menu's footer, with the theme and the language, stays.
- `PageSidebar` (replaced): only the mobile «En esta página» dropdown, below 50rem. The desktop table of contents disappears from the right.
- `TwoColumnContent` (replaced): no right-hand table of contents column, with room for the minimap from 82rem.
- `PageTitle` (already replaced): reading time, numbered title and introduction.
- `Footer` (already replaced): discreet status bar.
- New: `Minimap.astro` and `Outline.astro`, with the pure logic in `src/lib/` (`minimap.ts`, `outline.ts`, `storage.ts`, `theme.ts`) and their tests. (`ActivityBar.astro` existed for a few hours; `EditorTabs.astro` and `pinned-tabs.ts`, until 2026-10-11.)
- `theme.css`: widths, line counter starting from the title, highlighted line, hiding the number on wide pieces, `--ide-line` token.

## 8. Tests

- **Unit (Vitest):**
  - minimap calculation: scale, minimap offset, words → strokes, color of each word, visible rectangle, jump on click and drag;
  - theme cycle;
  - target of the language link (already covered by `languageTargets`);
  - contrast of the new token.
- **Build:** the SEO audit with no problems, the link validator and the JavaScript budget.
- **Browser:** screenshots at 1,440 px, at 1,000 px and at 390 px (mobile), in dark and light, compared with layout C.

## 9. Out of scope

- ~~Minimap with the text in miniature.~~ Done on 2026-10-04 (§4.5), with words instead of letters: at that size they cannot be told apart.
- Breadcrumbs that change with the current section (`› ## El problema`).
- Panels that resize by dragging and custom keyboard shortcuts.
