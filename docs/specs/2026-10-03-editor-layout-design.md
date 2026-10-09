# Editor layout (design C) — design

**Status:** approved by the author on 2026-10-03 and implemented.
**Sketches:** https://claude.ai/artifact/1J4ae5sUqPwN4QZoQ6k7GK (canvas "VS Code-style layout", layout "C · Outline in the explorer").
**Extends:** `docs/specs/2026-10-02-ide-theme-design.md`. What changes here replaces what that document says; the rest stays as it is (colors, typography, lesson components).

## 1. What we want

1. **Use the width.** Today the content is a centered column with empty margins on both sides. The editor has to fill the whole central area, as in VS Code.
2. **Look more like VS Code**, without copying its brand or its icons: explorer with an outline, tabs (with pinned tabs) and breadcrumbs at full width, line numbers flush with the edge, minimap and a discreet status bar.
3. **Without losing legibility.** Prose does not go past about 75 characters per line (proposal B, full-width prose, was discarded for that reason). What gains width are the blocks that need it: tables, diagrams, code, terminals and labs.

## 2. The author's decisions (2026-10-03)

- Layout **C**: the page outline moves down to the explorer and there is a minimap on the right.
- ~~**Activity bar** on the left, with the theme and the language at the bottom.~~ Removed the same day, 2026-10-03, after seeing it: the playgrounds and the glossary become **pinned tabs** (§4.2) and the theme and the language go back to the header (§4.1). The button to hide the explorer is removed: the text already has a maximum width and hiding it barely changed the reading.
- **Discreet status bar**, in the panels' color. Orange is kept for the active tab, the active file and the logo.

## 3. The layout by screen width

| Width | Pinned tabs | Explorer and outline | Minimap | Page table of contents | Line numbers |
|---|---|---|---|---|---|
| ≥ 82rem (≈ 1,312 px) | yes | on the left | on the right | in the explorer | yes |
| 50–82rem | yes | on the left | no | in the explorer | yes |
| < 50rem (mobile) | yes (without ".md"; the strip scrolls if it does not fit) | in the ☰ menu (no outline) | no | the «En esta página» dropdown ("On this page"), as today | no |

The side panel is the same size as before the layout, 19.25rem, all of it for the explorer. The content does not get narrower at any width compared with today.

The minimap threshold comes from adding up the side panel (≈ 308 px), line numbers (80 px), prose at 75ch (≈ 780 px), right margin (40 px) and minimap (96 px).

## 4. The pieces

### 4.1 Header

- Site name on the left and search in the center, with the text «Buscar lección, término o comando» (already planned in the theme).
- On the right, the theme and language selectors, as always in Starlight. On mobile, the theme and the language are in the ☰ menu.

### 4.2 Pinned tabs

In the tab strip, first and always visible, comes the tab of the open page (whatever it is: lesson, home page, syllabus…). Then two pinned tabs, like VS Code's: **playgrounds** (flask icon, links to `/playgrounds/`) and **glosario** (book icon). On the page of a pinned tab, that one is the open one and is not repeated; the first tab does not close: it links to the last page the reader was on (it is stored in their browser per language, `ide-last-page:es` / `ide-last-page:en`; with nothing stored, the home page).

- They are real links, inside a named `<nav>` («Pestañas fijadas»); the open page's tab is decorative (`aria-hidden`), because it repeats the title.
- They show at every width, on mobile too, where they lose the ".md" and the open page's name is cut off with "…" so that all three fit.
- The logic, with tests: `web/src/lib/pinned-tabs.ts`.

### 4.3 Side panel: explorer and outline

Two sections, one above the other, each with its own scroll. Their scrollbars are like VS Code's (added on 2026-10-04), like all the site's scrollbars: straight, with no arrows or track, and in the theme's translucent gray (`--ide-scrollbar`); 10 px in the panel, the code, the tables and the labs, and 14 px for the page, as in the editor. The panel's ones sit flush with its edge and only show with the mouse over them or focus inside; the others, always. Mouse only: on touch screens and in forced colors, the system's ones. The tree does not collapse: the home page and the phases are always visible. The outline does collapse (`<details>`):

- **EXPLORADOR (explorer):** `inicio.md` and the phases, with no root folder (the `BACKEND-DESDE-CERO` row was removed on 2026-10-03) (since 2026-10-03 `temario.md` and `glosario.md` are no longer there: the glossary is a pinned tab and the syllabus is linked from the home page). Compared with the previous tree:
  - arrows instead of triangles;
  - a `#` icon in front of each file, in `--ide-info`;
  - a vertical indentation guide on open folders.
- **ESQUEMA (outline):** the page's table of contents, with its level in front (`#`, `##`, `###`) in `--ide-keyword`. The current section is marked while scrolling: it is the last one whose heading has already reached where a jump to an anchor lands. It is a custom component (`Outline.astro`, with the logic in `src/lib/outline.ts`), not Starlight's table of contents: Starlight's watches a fixed strip under the header, which the tabs cover here, and when jumping to a section it marked the previous one. On pages with no table of contents (home page, glossary) the section does not appear. It starts collapsed; if the reader opens it, it stays open on the following pages (`localStorage`, key `ide-outline`). Open, it is as tall as its content (at most 42 %) and scrolls by itself to show the marked section. If it would only have «Sinopsis» (the syllabus), it is not drawn.

Height split: about 58 % for the explorer and 42 % for the outline. If one section collapses, the other gets all the height.

### 4.4 Editor

- **Tabs:** a strip at the full width of the editor, with the `chrome` background. The active tab has the editor's background, the accent top border and the `#` icon in front of the name. The strip and the breadcrumbs stay fixed at the top while scrolling (`position: sticky`), as in an editor.
- **Breadcrumbs:** today's line (`fase-0 Cómo funciona internet · 12 min de lectura`), at full width and below the tabs.
- **Line numbers:** flush with the editor's left edge. The text starts right after them, left-aligned and not centered. The title is line 1 and the lesson's introduction (sentence, goals and prerequisites) is line 2. Tables, diagrams and labs still have no number, for the same reason as today (they would clip the number when scrolling).
- **Width:** prose (paragraphs and lists) goes up to 75ch at most. The lesson's introduction, up to about 820 px at most. Tables, diagrams, code blocks, `TryIt` and labs use the editor's full width. Note: in Atkinson Hyperlegible Next the "0" is wide, so 75ch (≈ 875 px at 18 px) is about 100 real characters per line, not 75; today, with 70ch, it was about 90. For about 75 real characters we would need `--ide-measure: 40rem`. Pending the author's decision.
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

Inside the menu is the explorer, without the ESQUEMA section, and below it the theme and the language. The playgrounds and the glossary are in the pinned tabs, which are also visible on mobile.

### 4.8 Print

No side panel, minimap, tabs or status bar, as today.

### 4.9 Playgrounds page

`/playgrounds/` and `/en/playgrounds/` bring together the course's labs and playgrounds, by phase. Each piece has its level (lab or playground), a sentence and a link to the «Pruébalo» ("Try it") of its lesson. The data lives in `web/src/data/playgrounds.ts`; a test checks that each piece points to a lesson that exists in both languages and that really uses it. The home page links to it. Later on, each playground can have its own page, which is what ranks best.

## 5. New tokens

- `--ide-line`: the background of the highlighted line, between `bg` and `selection` (dark `#211f2a`, light `#f2f0f7`). It goes into `tokens.test.ts` as a background: every text token must have at least 4.5:1 over it.

## 6. SEO, performance and accessibility

- **SEO:** the content of no page or its tags changes. The table of contents goes from an `<aside>` on the right to a section of the side `<nav>`, but both are navigation. The build audit stays the same: the language selector is in the header and in the footer of the mobile menu, and the `languageSelectorMatchesHreflang` rule reads it.
- **JavaScript:** the outline and the minimap are small scripts, without React. The 400 KB per page limit is not affected. The audit checks it on every build.
- **Accessibility:**
  - the pinned tabs are real links, with an accessible name;
  - the panel's sections collapse with `<details>`;
  - the minimap is left out of the accessibility tree;
  - keyboard focus shows with the accent, as today.

## 7. What changes in the code (for the plan)

- `Header` (replaced): name, search and, on the right, theme and language.
- `Sidebar` (already replaced): EXPLORADOR and ESQUEMA sections (`Outline.astro`, custom; see §4.3). The mobile menu's footer, with the theme and the language, stays.
- `PageSidebar` (replaced): only the mobile «En esta página» dropdown, below 50rem. The desktop table of contents disappears from the right.
- `TwoColumnContent` (replaced): no right-hand table of contents column, with room for the minimap from 82rem.
- `PageTitle` (already replaced): tabs and breadcrumbs at full width and fixed; numbered title and introduction.
- `Footer` (already replaced): discreet status bar.
- New: `Minimap.astro`, `Outline.astro` and the pinned tabs in `EditorTabs.astro`, with the pure logic in `src/lib/` (`minimap.ts`, `outline.ts`, `pinned-tabs.ts`, `storage.ts`) and their tests. (`ActivityBar.astro` existed for a few hours and was removed.)
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

- Several tabs open at once (already out in the theme design).
- ~~Minimap with the text in miniature.~~ Done on 2026-10-04 (§4.5), with words instead of letters: at that size they cannot be told apart.
- Breadcrumbs that change with the current section (`› ## El problema`).
- Panels that resize by dragging and custom keyboard shortcuts.
