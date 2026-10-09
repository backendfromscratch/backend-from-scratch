# Design: site SEO

- **Date:** 2026-10-03
- **Status:** §2.1, §2.2 and §2.3 decided; §2.2 and §3 implemented on 2026-10-03, except Lighthouse; §4 and §2.3 (Phase 0) applied on 2026-10-03
- **Origin:** the author set as priority no. 1 that the site ranks as high as possible on Google and explains everything in the simplest possible way, for everyone (`CLAUDE.md`).

## 1. What really matters, in order

1. **The content:** that each lesson answers a specific search better than anyone («qué es el DNS», «diferencia entre TCP y UDP»). It is what matters most, and it is where the course's effort already goes.
2. **Links from other sites:** forums, newsletters, Reddit, blogs, the Spanish-speaking community. They are not built with code, but by publishing and sharing.
3. **The technical side:** that Google finds and indexes each page well in its language. Today it has gaps (§3). They are cheap to close, but some depend on the domain.
4. **The details** (words in the URL, the domain name): they matter little, but they are expensive to change after publishing. That is why they are decided first.

Another point in favour of publishing early: Google takes months to trust a new site, and that time starts counting the day it is published.

## 2. Author decisions before publishing

These are the ones that, once the site is published, cost redirects and lost rankings.

### 2.1 Name and domain

**Decided on 2026-10-03:** «Backend desde cero» at `backenddesdecero.com`. Analysis in `docs/research/2026-10-03-languages-and-names.md`. It was the revised recommendation: **«Backend desde cero / Backend from Scratch» at `backenddesdecero.com`**, one domain for both languages. It matches real searches («aprender backend desde cero» is Google's first suggestion for «aprender backend»), and anyone understands it.

### 2.2 URL structure

Today: `/es/phase-0/dns/` and `/en/phase-0/dns/`, and the root `/` redirects to `/es/` with a 302 (temporary).

| Option | Spanish | English | Cost |
|---|---|---|---|
| A. As today | `/es/phase-0/dns/` | `/en/phase-0/dns/` | None |
| B. Spanish at the root | `/phase-0/dns/` | `/en/phase-0/dns/` | Low: move `docs/es/*` to `docs/` and change the internal links |
| **C. Spanish at the root and translated routes** | `/fase-0/que-es-dns/` | `/en/phase-0/what-is-dns/` | Medium (see below) |

**Recommendation: C.**
- **The home page:** with Spanish at the root, the home page is served at `/` without a redirect. It is the page that will receive the most links.
- **The routes:** Google's guidance asks to use the audience's language in the URL. And the route shows in the search result (`backenddesdecero.com › fase-0 › que-es-dns`).

The effect on ranking is small, but today there are 9 lessons, and every new lesson makes the change more expensive.

**What C costs** (revised after reading the Starlight 0.42.5 code): Starlight does not support different routes per language, and there is no plugin that does (npm search, 2026-10-03). To find a page's translation, it changes the URL's language prefix (`/es/…` → `/en/…`) and leaves the rest the same (`localizedUrl`). With translated routes, that breaks five things, and each is fixed through an official extension point:

1. **Pairing:** each page declares its counterpart with a `translationKey` in the frontmatter, and a test checks that all of them have one and that it is not repeated.
2. **The language selector** would lead to a page that does not exist. The `LanguageSelect` component is replaced, as we already do with `Sidebar` or `PageTitle`.
3. **The `hreflang`s** would point to URLs that do not exist. A Starlight *route middleware* fixes them.
4. **Fallback pages:** Starlight would believe the English page does not exist and would generate a copy with the Spanish text at `/en/fase-0/que-es-dns/`. That is duplicate content, and Google penalises it. The middleware marks them `noindex` and they are excluded from the sitemap (this will be needed anyway as soon as there are untranslated lessons, whichever option is chosen).
5. **The sidebar and the prerequisites:** the explorer (`buildPhaseSidebar`) looks for the phase folder with the same name in both languages, and `prerequisites` uses the route. Both are now resolved per language.

**Proof of concept (2026-10-03): it works.** It was done with all of Phase 0 on `web/`, which was then restored and checked to be identical (SHA fingerprints of the 202 files). Its code was disposable, because the real implementation was written from scratch with tests; it is kept in the first commit (`3bcdc57`, `docs/research/2026-10-03-prueba-rutas-traducidas.patch`). No sixth piece appeared. Result:

- **Routes:** Spanish at `/fase-0/que-es-dns/` and at the root (`/`, `/roadmap/`); English at `/en/phase-0/dns/`. The build passes and the validator accepts all internal links.
- **`hreflang` and canonicals:** correct in both directions, with `x-default` pointing to Spanish.
- **Language selector:** leads to the real translation (tested in the browser).
- **Explorer, pagination, prerequisites, tab and footer:** correct in both languages.
- **Fallback pages:** Starlight generated 9 and the build deleted them. They are not in the sitemap (24 URLs) or in the search (24 pages).
- **The DNS lab** works on the new route.

**How each piece was solved** (for the plan):
1. **Pairing:**
   - optional `translationKey` in the frontmatter; without a key, the route without the language is used, so `roadmap` and the home page pair up on their own;
   - `src/lib/translations.ts` builds the index from the collection and fails if two pages of the same language share a key.
2. **Selector:** override of `LanguageSelect`. If there is no translation, it leads to the home page of that language.
3. **`src/routeData.ts`** (*route middleware*):
   - removes from the sidebar the links to pages that do not really exist (the copies);
   - recomputes the pagination, which Starlight computes before the middleware;
   - rebuilds the `hreflang`s;
   - marks the copies with `noindex`.
4. **Fallback pages:**
   - a custom integration, placed **before** Starlight, deletes them in `astro:build:done`, before Pagefind indexes;
   - `@astrojs/sitemap` becomes a direct dependency, with a `filter` that excludes them and without its `i18n` option, which deduces translations from the route: the `hreflang`s already go in the HTML.
5. **Folders per language:**
   - each sidebar group autogenerates from `fase-N` and `phase-N`, and the middleware cleans up what is left over;
   - `phaseFolderName(locale, n)`, which already existed, gives each language's folder;
   - `currentLesson` receives the language;
   - `prerequisites` uses keys (`[tls-https]`) instead of routes.
6. **Root language:**
   - `toLocale(undefined)` returns `es`;
   - `localizedHref('es', …)` goes without a prefix;
   - `isLessonId` and `countLessons` accept ids without a language prefix;
   - `public/_redirects` goes away.

**What breaks** and has to be adapted with tests: `lessons.test.ts`, `links.test.ts`, `locales.test.ts`, `sidebar.test.ts` and `explorer.test.ts`. In addition, the internal links of the Spanish content change (the validator checks them).

**Things left for the plan:**
- choose the final route names (from §4), also `glosario`;
- make the script that deletes the copies reuse the translation index instead of walking the disk.

### 2.3 Who we write for

The site spec says: «personas que ya programan (por ejemplo, frontend) pero no saben backend» (people who already code, for example frontend, but do not know backend). The author now asks for «entendible para todos los públicos» (understandable for everyone). And whoever searches «qué es el DNS» on Google is of all kinds: students, sysadmins, curious people.

**Decided on 2026-10-03: the whole course for anyone.** No lesson takes any programming knowledge for granted. Consequences:
- **Style guide:** a new rule («Escribe para todos los públicos», "Write for everyone"), and the «Ya lo has visto» ("You have already seen it") section connects with what anyone sees (the browser, the phone, the home wifi) and, as an extra, with the code of those who program.
- **The 9 lessons of Phase 0** are reviewed with that criterion: sentences that take `fetch`, DevTools or what a function is for granted without explaining it.
- **Before Phase 3** (programming a server) it will be necessary to teach programming. Proposal, to decide when we get there: a short phase, «Programar desde cero con JavaScript y TypeScript» ("Programming from scratch with JavaScript and TypeScript"), with only what the backend needs (variables, functions, objects, modules, `async`/`await`, npm), and links to javascript.info for going deeper.

## 3. Technical state today (build of 2026-10-03)

| What | State | Fix |
|---|---|---|
| `site` in `astro.config.ts` | ✗ Missing | Set the domain. **The following depends on it** |
| Sitemap (`sitemap-index.xml`) | ✗ Not generated (Starlight does it on its own when `site` is set) | Automatic with `site` |
| Canonical URL (`<link rel="canonical">`) and `og:url` | ✗ | Automatic with `site` |
| `hreflang` between languages | ✗ | Automatic with `site` (with option C, fixed by the middleware) |
| `robots.txt` | ✗ Does not exist | Create it in `web/public/`, with the sitemap URL |
| Root `/` | 302 to `/es/` | Goes away with options B or C; otherwise 301 |
| Social image (`og:image`) | ✗ None, even though a large `twitter:card` is declared | Generate it in the build for each page, with the title and the IDE theme (`astro-og-canvas` or `satori`) |
| Structured data (JSON-LD) | ✗ | `BreadcrumbList` on all lessons; `Course` on the home page, if it meets Google's requirements |
| Home page `<title>` | «Backend desde cero \| Backend desde cero», repeated | Own title with `head` in the frontmatter |
| Lesson `<title>`s | Short labels («DNS \| Backend desde cero») | Titles that answer the search (§4) |
| Meta descriptions | 10 of the 16 lessons (5 per language) exceed 160 characters, and Google cuts them | Rewrite them under 155 |
| HTML `lang`, one H1 per page, headings in order | ✓ | — |
| Speed: diagrams | ✗ Mermaid draws in the reader's browser. A lesson with one diagram downloads 884 KB of JavaScript (30 files), and a page without diagrams, 106 KB (measured on 2026-10-03, uncompressed). The HTML carries the diagram's text, not the drawing | Draw the diagrams at build time (SVG in the HTML, with light and dark versions) or turn them into HTML components, as the style guide already asks for some. It removes almost all that JavaScript |
| Speed: the rest | Static site, no layout shifts (CLS 0) | Pass Lighthouse with a simulated phone before publishing |

**Discarded:** frequently asked questions (`FAQPage`) no longer give rich results except to official government and health sites (Google, 2023). It is not worth marking them up.

### Is it the best stack for SEO?

Yes. The technology is not the bottleneck.
- **Astro generates static HTML:** all the text is in the HTML Google receives, without waiting for JavaScript, and the pages do not load JavaScript except where there is an island (the labs).
- **Starlight ships out of the box** sitemap, canonicals, `hreflang`, descriptions, semantic and accessible HTML, and serverless search.
- **Cloudflare serves the site from its CDN,** close to each reader.

The usual alternatives (Next.js, Docusaurus, VitePress, WordPress) do not rank better. The first two send more JavaScript to the browser, and WordPress is slower and depends on plugins. What needs fixing are the gaps in this table and the translated routes, which Starlight does not support out of the box.

**Tools for launch day,** all free:
- **Google Search Console and Bing Webmaster Tools:** indexing and real searches.
- **PageSpeed Insights:** the speed data Google sees.
- **Rich results test:** checks the JSON-LD.
- **Ahrefs Webmaster Tools:** audit and links the site receives.
- **Google Trends and Keyword Planner:** search volume, to choose topics and titles.

## 4. Titles that answer real searches

Taken from Google's autocomplete of 2026-10-03.
- **The lesson's `title`** becomes the question people ask. It is the H1 and the `<title>`.
- **`sidebar.label`** keeps the short name. The side explorer already uses it, so it does not change.

| Lesson | Spanish title | English title | Searches that justify it |
|---|---|---|---|
| 1 | Qué es el backend: diferencias con el frontend | What is the backend? Frontend vs backend | «que es backend y frontend», «frontend y backend diferencias», «frontend vs backend» |
| 2 | Modelo cliente-servidor: qué es y cómo funciona | The client-server model, explained | «modelo cliente servidor como funciona», «client server model explained» |
| 3 | Qué es un protocolo de red | What is a network protocol? | «que es un protocolo» gets mixed with notarial and labour protocols, so «de red» is needed |
| 4 | El modelo TCP/IP y sus capas (y el modelo OSI) | The TCP/IP model and its layers (vs. OSI) | «modelo tcp/ip capas», «tcp/ip model vs osi model» |
| 5 | IP, puertos y sockets: qué son y cómo funcionan | IP addresses, ports and sockets explained | «que es un socket en redes» |
| 6 | Diferencia entre TCP y UDP | TCP vs UDP: what's the difference? | «diferencia entre tcp y udp», «tcp vs udp» |
| 7 | Qué es el DNS y cómo funciona | What is DNS and how does it work? | «que es dns», «what is dns and how it works» |
| 8 | Qué es TLS y cómo funciona HTTPS | What is TLS and how does HTTPS work? | «que es tls», «how does https work step by step» |
| 9 | Qué pasa cuando escribes una URL en el navegador | What happens when you type a URL in the browser | Both have many suggested variants |

**Phase 1** (autocomplete of 2026-10-07):

| Page | Spanish title | Searches that justify it |
|---|---|---|
| Introduction | Aprender Linux desde cero: terminal y SSH | «aprender linux desde cero», «linux desde cero» |
| 1 | Comandos básicos de la terminal en Mac y Linux | «comandos basicos terminal mac», «comandos basicos terminal linux», «10 comandos básicos de terminal y su utilidad» |

**Rule for the style guide:**
- The first text under the title, the highlighted sentence (`lesson.oneLiner`), answers the title's question in one or two simple sentences. It is what Google usually shows as a featured snippet, and what the reader needs first. The narrative paragraphs that follow are free.
- The description does not exceed 155 characters and contains the words of the search.

## 5. Measuring

- **Google Search Console and Bing Webmaster Tools** on launch day: submit the sitemap and see which searches bring people. They are free.
- **Cloudflare Web Analytics** for visits: it does not use cookies, so no banner is needed.

## 6. Proposed order of work

1. **The author decides §2.1, §2.2 and §2.3.**
2. **Technical:** URLs (chosen option), `site`, `robots.txt`, home page `<title>`, social images, JSON-LD and Lighthouse. With tests where there is logic.
3. **Content:**
   - titles and descriptions from §4, in both languages;
   - review for "everyone";
   - new rules in the style guide.
4. **Publish** (when the author asks) and register Search Console.

## Sources

- [Google: URL structure best practices](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Google: Localized versions of your pages (hreflang)](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: Changes to HowTo and FAQ rich results (2023)](https://developers.google.com/search/blog/2023/08/howto-faq-changes)
- [Starlight: i18n and root locale](https://starlight.astro.build/guides/i18n/) and its `head.ts` code (`hreflang` and sitemap only with `site`)
- Google autocomplete (`suggestqueries.google.com`), consulted on 2026-10-03.
