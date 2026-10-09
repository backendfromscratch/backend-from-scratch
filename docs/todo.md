# Next steps and the author's to-do list

At the top, the next steps in order (updated on 2026-10-09). Below, the detail of everything pending: what the author will review and what they have to decide. Add new items here and strike through the resolved ones.

## Next steps, in order

Who does it: **You** (the author), **Claude** (when you ask) or **Together**. The detail of each item is in the sections below.

### 1. Save the work and push it to GitHub (as soon as possible)

The code has been on GitHub since 2026-10-09: `backendfromscratch/backend-from-scratch`.

- [x] **You:** create the `backendfromscratch` organization on GitHub, on the *Free* plan.
- [x] **Together:** how to push with your personal account (`GianSegura`), given that this Mac's SSH key logs in as the work one. We push over HTTPS: the remote is `https://github.com/…` and `gh` acts as the credential **only in this repository** (`git config --local credential.https://github.com.helper '!gh auth git-credential'`). It uses the active `gh` account: if you switch it to the work one, pushes fail. The second SSH key with an alias is left for lesson 9 of Phase 1.
- [x] **You, with Claude Code closed:** rename the folder to `backend-from-scratch`. Claude's memory is already copied to the new path.
- [x] **Claude:** the first commit; create the public repository `backendfromscratch/backend-from-scratch` and push the code.
- [x] **Claude:** protect `main` and make the CI job mandatory ("format, types, tests and build"). Since the same day, "conventional commit title" is also mandatory (the PR title follows Conventional Commits), and merging is only possible with squash. Done on 2026-10-09: to merge a PR, the CI has to pass on the branch up to date with `main`; force pushes and deleting `main` are not allowed. Admins (you) can skip the rule with a direct push, but Cloudflare will deploy every push to `main`, so the normal way is to go through a PR.
- [x] **Claude:** translate `CLAUDE.md` and `docs/` into English, with English file names (2026-10-09). The repository is in English; the site stays bilingual.
- [x] **Claude:** keep only what is needed in `docs/` (2026-10-09): the executed plans, the routes spike and the spec of an already published lesson are deleted (they stay in the first commit, `3bcdc57`). Rule in `CLAUDE.md`, "Docs".
- [x] **Claude:** translate the source code into English: code comments, test names, and build and SEO audit messages (2026-10-09). Spanish site content (lessons, glossary, UI strings, routes) stays as it is.

### 2. Unblock Phase 1

- [ ] **You:** review the pilot: read and do, as a reader, the introduction and lesson 1 of Phase 1. The other nine lessons wait for your verdict on the template and the tone.
- [ ] **You:** two quick decisions before writing more:
  - English punctuation: the period outside the quotation marks (British style, the current one) or inside (American);
  - the JavaScript limit per page: 400 KB, or study Preact to slim down the playgrounds.

### 3. Publish the site

The sooner it is published, the sooner Google starts to trust the domain. Phase 0 is already complete in both languages.

- [ ] **You:** buy `backenddesdecero.com` and `backendfromscratch.com`, and `.dev` if you want, as a defense.
- [ ] **Together:** connect Cloudflare to the repository (the build command is `pnpm build`) and redirect `backendfromscratch.com` to `/en/`.
- [ ] **Together, before announcing it:** Lighthouse with a simulated phone, Google Search Console, Bing Webmaster Tools and the rich results test.
- [x] **You:** decide the license (2026-10-09): MIT for the code and CC BY 4.0 for the course content (`web/src/content/`). `LICENSE`, `LICENSE-CONTENT` and the README say so.
- [ ] **Claude:** say on the site that the content is CC BY 4.0, with a short line and a link in the footer, before publishing.

### 4. Continue with Phase 1, lesson by lesson

- [ ] **Claude:** before lesson 2, the script that generates the practice `access.log` (`web/public/practicas/access.log`).
- [ ] **Claude, and you review each one:** lessons 2 to 10, each with a short plan, commands run for real and an independent review. In lesson 4, Multipass is checked on your Mac; before lesson 10, the Git repository script for `bisect`.
- [ ] **Claude:** translate Phase 1 into English once you approve the Spanish.

### 5. No rush: nothing depends on it

- [ ] **You:** read Phase 0 in your own voice: the 9 lessons, the introduction, the "for everyone" changes, the translation, the diagrams and the social image (in "Content review").
- [ ] **You:** the editor layout in your browser and the text width (in "Decisions").
- [ ] **You:** the open questions about the labs and the technical minor items (in "Decisions" and in the minor-items sections).
- [ ] **You:** try WSL on a Windows machine.
- [ ] **You, before Phase 3:** decide whether to add a "Programming from scratch with JavaScript and TypeScript" phase.
- [ ] **A few months after publishing:** split the English into `backendfromscratch.com` if Search Console asks for it, decide whether to add a third language and the progress panel.

## Content review

- [ ] **Phase 1 pilot lesson:** read and do, as a reader, the introduction (`fase-1/index.mdx`) and lesson 1, «La shell: comandos y rutas» ("The shell: commands and paths") (`fase-1/comandos-basicos-terminal.mdx`), and say whether the template and the tone work for the other nine. Until then, no more are written. Decisions taken while writing it: Multipass is installed in lesson 4, the title and the URL come from real searches, and the term «terminal» is explained now in this lesson.
- [ ] **WSL not verified in lesson 1:** it was checked on a Docker Ubuntu, not on WSL. It should be tested on a Windows machine: that WSL opened from Windows Terminal starts in `/mnt/c/Users/…`, the key for `~` (AltGr + 4) and the `-bash:` prefix of the errors.
- [ ] Read and do, as a reader, **lesson 1, «Qué es el backend»** ("What is the backend") (`fase-0/que-es-el-backend.mdx`) and rewrite it in your voice. It was written by an agent from the 2026-10-04 spec. Try the Open-Meteo exercise in your browser.
- [ ] Read and do, as a reader, **lesson 2, «Modelo cliente-servidor»** ("Client-server model") (`web/src/content/docs/fase-0/modelo-cliente-servidor.mdx`) and rewrite it in their voice. Answer:
  - Is the tone the one they want for the whole course?
  - Is any section of the template superfluous or missing?
  - Do the components (definitions, analogy, «Pruébalo», questions) help or get in the way?
- [ ] Review the **Phase 0 introduction** (`web/src/content/docs/fase-0/index.mdx`).
- [ ] Review the **English translation** of the whole of Phase 0: the introduction, lessons 1 to 9 and the glossary (`web/src/content/docs/en/phase-0/` and `web/src/content/glossary/en/`). Lessons 3 to 9 were translated at the author's request before they reviewed the Spanish, and two reviewers compared each lesson with its original. If the Spanish changes, the English has to be adjusted. Translation details:
  - in lesson 9, the `curl` commands were run again with English labels, so the times in the text and in the table differ from the Spanish ones (for example, an RTT of about 15 ms);
  - words that go in italics in Spanish because they are foreign (*handshake*, *round trip time*) go without italics in English;
  - in lesson 3, the 404 route is `/does-not-exist`.
  - **a style decision:** the English lessons put the period outside the quotation marks (`“…hand it to me”.`), as in lesson 2, which you already reviewed. That is British style; American puts it inside (`“…hand it to me.”`). The rest of the English is American. It was kept for consistency, but it should be decided before writing more.
- [ ] Read and do, as a reader, **lesson 3, «Qué es un protocolo»** ("What is a protocol") (`fase-0/que-es-un-protocolo.mdx`).
- [ ] Read and do, as a reader, **lesson 4, «El modelo TCP/IP»** ("The TCP/IP model") (`fase-0/modelo-tcp-ip.mdx`).
- [ ] Read and do, as a reader, **lesson 5, «IP, puertos y sockets»** ("IP, ports and sockets") (`fase-0/ip-puertos-y-sockets.mdx`). Watch out: exercise 3 asks for three terminals open at the same time; is that too much for someone who has just met the terminal?
- [ ] Read and do, as a reader, **lesson 6, «TCP frente a UDP»** ("TCP vs UDP") (`fase-0/tcp-vs-udp.mdx`), and try the **handshake lab** with your own hands: a game without losses, another losing the 2nd data segment (look at «Aplicación del servidor», "Server application") and another in UDP. Is it understandable without help? Is anything superfluous or missing in the ladder? Also review the English texts of the lab (`web/src/playgrounds/tcp-handshake/strings.ts`).
- [ ] Read and do, as a reader, **lesson 7, «DNS»** (`fase-0/que-es-dns.mdx`), and try the **DNS query lab** with several domains (one that does not exist, an MX, a CNAME). Design decisions taken without consulting you: real queries to Cloudflare (1.1.1.1) over DoH without a proxy, the step-by-step walkthrough with «Siguiente paso» ("Next step") and «Ver todo» ("See all"), and the records table at the end. Does it work for you?
- [ ] Read and do, as a reader, **lesson 8, «TLS y HTTPS»** ("TLS and HTTPS") (`fase-0/tls-y-https.mdx`), and try the **cryptography playground** (encrypt, decrypt with another key, sign and tamper with the message). Decisions taken without consulting you: RSA-OAEP to encrypt (the lesson clarifies that TLS 1.3 no longer encrypts with RSA) and ECDSA P-256 to sign, in the same panel; the exercises use `openssl` options that both LibreSSL (the macOS one) and OpenSSL have.
- [ ] Read and do, as a reader, **lesson 9, «De la URL a la página»** ("From the URL to the page") (`fase-0/que-pasa-cuando-escribes-una-url.mdx`), which closes Phase 0. The exercise with a distant server uses `www.gov.za` (Johannesburg, no CDN): if you prefer another, any one more than 150 ms away will do.
- [ ] Review the design of the **social image** of each page (`web/dist/og/…` after the build; generated by `web/src/lib/og/card.ts`).
- [x] **Titles and descriptions** of the lessons according to what people search for (`docs/specs/2026-10-03-seo-design.md`, §4) and the **"for everyone"** review: a separate content plan. The home page still says «Para quien ya programa… No explicamos qué es una variable» ("For people who already code… We don't explain what a variable is"), and it clashes with the audience decision. Done on 2026-10-03. Review the changes in `docs/reviews/2026-10-03-phase-0-for-everyone-changes.md`: they were proposed by agents and you have not read them in your own voice.
- [ ] Review the **diagrams**, now HTML instead of Mermaid: on desktop, arrows between participants; on mobile (a column narrower than 32rem), a list of "A → B" steps.
- [ ] **Read the "for everyone" changes** of Phase 0 in your own voice (`docs/reviews/2026-10-03-phase-0-for-everyone-changes.md`): they were proposed by agents, checked by an independent reviewer and are applied, but you have not read them. Once read, delete the file: it only exists for this review.
- [ ] **DevTools names in Spanish:** the lessons use *Network* and *Timing*. In Chrome in Spanish they are *Red* and another name; they should be checked and added.
- [ ] **Chrome texts quoted from memory:** «La conexión no es privada» ("Your connection is not private") (lesson 8). Check that they match those of your browser.
- [ ] **Outside Phase 0:** the glossary (`web/src/content/glossary/`) has not been reviewed with the "for everyone" criterion.

## Phase 1 design

- [x] **Design approved on 2026-10-07,** with the proposals as they were: Multipass VM, WSL as the only route on Windows, ten lessons and the guided project in Phase 3. We start with a pilot lesson. What was decided:
  - **Where the reader practices:**
    - their own terminal for the basics;
    - an Ubuntu VM with Multipass (`multipass launch --name curso`) as the "server" for users, services and SSH;
    - and, as real remote servers, the OverTheWire Bandit game and GitHub over SSH.

    On Windows, WSL itself acts as the server.
  - **Windows: WSL as the only route,** and the "Windows" tab of lesson 2 goes away.
  - **Ten lessons instead of six:**
    - "Processes" is split into processes and signals on one side, and services and packages (`systemd`, `apt`) on the other;
    - `nano` and how to quit `vim` come in;
    - reading logs is the practical thread of pipes and redirections.
  - **Git:** "Git as the basis for deployment" moves to Phase 8 (CI/CD). The Git lesson focuses on the internal model, `rebase`, `reflog` and `bisect`.
  - **No level 3 labs,** as `CLAUDE.md` says. At most, a small, optional permissions calculator.
  - **Practice material to create:** a sample `access.log` served by the site and a script that sets up a Git repository with a hidden bug for `bisect`.
  - **Open question:** bring a small guided project forward to this phase, or wait for Phase 3 as the roadmap says? Waiting is proposed.

## Decisions

- [x] **Visual design:** proposal D (code editor) chosen, in dark and light. Applied on the site (spec: `docs/specs/2026-10-02-ide-theme-design.md`).
- [x] **Editor layout (design C):** chosen on 2026-10-03 from the sketches and implemented (spec: `docs/specs/2026-10-03-editor-layout-design.md`).
- [ ] **Review the editor layout in your browser:** in dark and light, on the laptop and on the phone. Try the pinned tabs (playgrounds and glossary), the outline, the minimap and the scroll bars.
- [ ] **Text width:** `75ch` in our font is about 100 characters per line (before, it was about 90). If you prefer it narrower, `--ide-measure: 40rem` leaves about 75 real characters. It is a single variable in `web/src/styles/theme.css`.
- [x] **Changes decided after seeing the editor layout (2026-10-03),** implemented the same day:
  - the OUTLINE starts collapsed and, if the reader opens it, stays open on the following pages;
  - activity bar: explorer, search, **playgrounds** (new, instead of the syllabus) and glossary; at the bottom, theme and language (the bar was removed later: see the next item);
  - the explorer is left with `inicio.md` and the phases: `temario.md` and `glosario.md` go away;
  - the syllabus page (`/roadmap/`) is kept, linked from the home page (it targets the search "roadmap backend");
  - on mobile, the ☰ menu linked to the glossary and the playgrounds (replaced by the pinned tabs);
  - new page `/playgrounds/` that gathers the course's labs and playgrounds, with their level and a link to their lesson. Dedicated pages per playground, later on (good for SEO).
- [x] **No activity bar (2026-10-03, after seeing it):** playgrounds and the glossary become pinned tabs, which are also visible on mobile; the theme and the language go back to the top right; the button to hide the explorer is removed. Spec updated (§2, §4.1, §4.2).
- [x] **The open page's tab is first and always visible; the explorer has no root folder and does not collapse** (2026-10-03). Spec updated (§4.2, §4.3).
- [x] **The first tab cannot be closed in playgrounds and glossary:** it links to the last page opened (2026-10-03).
- [x] **Minor items deferred from the editor layout review, resolved** (2026-10-03): outline with a single entry, empty `aside`, clipped focus, glossary in the minimap and in the highlighting, outline that shows the marked section, comment on the search import and the contrast of `line` in the guide. The rest no longer applied after removing the activity bar.
- [ ] **Idea for later:** a progress panel (finished lessons, saved in the browser), when there are more lessons. Without an activity bar, it could be another pinned tab.

- [x] **Name and domain:** «Backend desde cero / Backend from Scratch», at `backenddesdecero.com` (decided on 2026-10-03). The repository name was changed by the following decision.
- [x] **Technical names in English (2026-10-08):**
  - GitHub organization `backendfromscratch` (free that day) and public repository `backendfromscratch/backend-from-scratch`, with the author as the only owner;
  - the root package, `backend-from-scratch` (`package.json`);
  - the local folder, `backend-from-scratch` (next item).

  The product stays in each reader's language: «Backend desde cero» at `backenddesdecero.com` and «Backend from Scratch» at `/en/`. **Moving everything to «Backend from Scratch»** with `backendfromscratch.com` as the main domain **was discarded**. The lessons would rank the same (Google barely looks at the words of the domain), but:
  - Google accepts a single site name per domain, not per folder (documentation of 2025-12-10). Results in Spanish would show up as «Backend from Scratch» and look like they come from an English site;
  - the reinforcement of the search "aprender backend desde cero", the first autocomplete suggestion, would be lost in every title and every mention;
  - Spanish is the original, the one with the least competition and the one for the "everyone" audience. English goes under `/en/` until Search Console says otherwise (item "Review the two-domain option", below).
- [x] **Create the `backendfromscratch` organization on GitHub** (2026-10-09; created by the author on the web: github.com → *Your organizations* → *New organization* → *Free*). Watch out: this Mac's SSH key logs in to GitHub as the work account, not as `GianSegura`. Before pushing the code, a second key for the personal account with an alias in `~/.ssh/config` (which is what lesson 9 of Phase 1 explains), or the remote over HTTPS with `gh`. HTTPS was chosen (item 1 of "Next steps").
- [x] **Rename the local folder** (2026-10-09) to `backend-from-scratch`, with Claude Code closed: the session works in that folder, and its memory and history go by the path. Commands: `mv ~/backend-desde-cero ~/backend-from-scratch`, and inside, `pnpm install` and `pnpm build` to check that everything still stands. The build failed: Starlight's `<Tabs>` loads Sätteri's native binary and, without `satteri` declared, Vite put it in `dist/`, from where Node cannot find the binary that pnpm keeps in `node_modules/.pnpm/`. Fix: `satteri` is a direct dependency of `web/` (same version Starlight asks for). Do not delete it even if the code does not import it.
- [x] **One domain or two (2026-10-04): option 1.** A single site, `backenddesdecero.com`, with English at `/en/`. In addition, `backendfromscratch.com` is bought, which only redirects (301) to the same page in English: `backendfromscratch.com/phase-0/what-is-dns/` → `backenddesdecero.com/en/phase-0/what-is-dns/`. It is useful for sharing the English version under a name that makes sense, and the links it receives add up for the main site. What is accepted: on Google, English pages show up with the site name «Backend desde cero», because Google only accepts one name per domain, not per folder.
- [ ] **Buy the domains:** `backenddesdecero.com` (main) and `backendfromscratch.com` (redirect to `/en/`); `.dev`, optional, as a defense. The redirects are configured in Cloudflare at deployment.
- [ ] **Review the two-domain option a few months after publishing:** if in Search Console the English traffic gets close to the Spanish or grows faster, English is moved to `backendfromscratch.com` as its own site (option 2: each language with its own name on Google, but with the links split between two sites), with 301 redirects from `/en/`. Analysis: `docs/research/2026-10-03-languages-and-names.md`.
- [x] **Audience:** everyone. No lesson assumes any programming knowledge (decided on 2026-10-03). It is already in the style guide.
- [ ] **Review the 9 lessons of Phase 0** with the "everyone" criterion: sentences that assume `fetch`, DevTools or what a function is without explaining it, and the «Ya lo has visto» ("You have already seen it") sections.
- [x] **Review the spec of the lesson «Qué es el backend»:** approved on 2026-10-04 and implemented the same day (the spec was deleted once implemented): it is lesson 1 of Phase 0, in Spanish and English, and the others become 2 to 9. What is left is for you to read it (above, in "Content review").
- [x] **A lesson «Qué es el backend (y en qué se diferencia del frontend)» ("What is the backend (and how it differs from the frontend)")?** Yes (2026-10-04): design in the spec above. Proposal of 2026-10-04. Google's autocomplete in Spanish shows many beginner searches without a page of ours that answers them: «qué es backend y frontend», «frontend y backend diferencias», «backend qué es y para qué sirve» or «qué es el backend de una web». It would be the first lesson of Phase 0, before «Modelo cliente-servidor». The syllabus could also be adjusted to «ruta para aprender backend» and «roadmap backend en español», and answer «qué estudiar para ser desarrollador backend» there.
- [ ] **Before Phase 3:** decide whether to add a short phase, "Programming from scratch with JavaScript and TypeScript" (proposal in `docs/specs/2026-10-03-seo-design.md`, §2.3).
- [x] **SEO: URL structure** (`docs/specs/2026-10-03-seo-design.md`, §2.2). The recommendation is to put Spanish at the root and translate the routes (`/fase-0/que-es-dns/`). **The 2026-10-03 proof of concept confirms it can be done:** `hreflang`, the language selector, the explorer and the sitemap work, and no fallback pages are left. Implemented on 2026-10-03, together with the rest of the technical SEO. What remains are the titles and descriptions of the lessons (in "Content review").
- [ ] **More languages?** Same document. The recommendation is not to add any for now, and the third one, when the course is advanced, would be Brazilian Portuguese.
- [x] **"Windows" tab: removed (2026-10-07),** with the Phase 1 design: WSL as the only route. It is applied with the Phase 1 pilot. What there was: lesson 2 has it; the others do not. The style guide reserves it for native Windows alternatives. Since 2026-10-03 it is called «Windows (WSL)» and its commands look like terminal ones (`$`), not PowerShell (`PS>`), which was a mistake. The decision is still pending: remove it from lesson 2 or change the guide. The Phase 1 design (§2.2) proposes removing it: WSL as the only route on Windows.
- [ ] **TCP lab: narration keys.** They differ from the spec (`docs/specs/2026-10-03-tcp-lab-design.md`, §3): the *timeout* is split into three sentences, one for each thing that is resent; the final notice is separate so it does not cover the sentence of the last step; the ACK that confirms everything has its own sentence. Do we update the spec with the real keys or go back to the original ones?
- [ ] **TCP lab: what the application receives in UDP.** Today it is shown as a single text («Hola, bien»), the same as in TCP. Showing each datagram separately («Hola, » «bien») would show that UDP preserves messages and TCP is a stream of bytes. It is a small logic and interface change.
- [ ] **Deployment on Cloudflare:** when the author asks for it.
- [x] **Commit:** the first, on 2026-10-09, when pushing the code to GitHub.
- [x] **CI on GitHub (2026-10-07; active since 2026-10-09):** the `.github/workflows/ci.yml` workflow is already written, but it only runs once the repository is on GitHub. When creating it, protect `main` and mark the job "format, types, tests and build" as a required check: that way a PR with a red CI cannot be merged. Watch out: Cloudflare deploys every push to `main` on its own, without waiting for the CI; its build does fail with a broken link or an SEO problem, but not with a broken test.
- [ ] **Before publishing:** run Lighthouse with a simulated phone, sign up for Google Search Console and Bing Webmaster Tools, and check the breadcrumbs with Google's rich results test.
- [ ] **On Cloudflare,** the build command is `pnpm build` from the root (or `pnpm --filter web build`). The fonts for the social images are already found through the module system, but Astro needs to run with `web/` as the root.
- [ ] **JavaScript limit per page: 400 KB** (uncompressed, counting everything the page can import). The plan said 300, but a lesson with a lab already weighs about 340 KB (React 208 KB and Starlight's search 92 KB). Is that fine with you, or do you prefer studying how to slim down the labs (for example, Preact instead of React)?
- [ ] **Decisions on the technical minor items (2026-10-03), taken without consulting you.** Do they work for you?
  - **Google fallback in the DNS lab:** if Cloudflare does not respond (corporate networks that block it), Google (8.8.8.8) is asked. That query also leaves the reader's browser towards Google; the lab's privacy text already says so.
  - **TXT records are shown joined and in quotes,** whether Cloudflare or Google answers. It matches `dig` when the TXT has a single chunk (the usual case); with several chunks (DKIM), `dig` shows them separated and the lab, joined.
  - **Click tests with happy-dom** (new development dependency): a simulated document to press buttons in the labs' tests, without a browser.
  - **The glossary's "Se explica en" ("Explained in"):** by default, the first lesson that uses the term. If it is not the one that explains it, the term's YAML says so with `lesson:` (today in DNS, TLS, port, TCP, IP address and terminal). When writing new lessons, review the glossary: it is the only part that does not adjust by itself.

## Deferred technical minor items (from the code, IDE theme and labs reviews)

- ~~The minor items from the three reviews.~~ Resolved on 2026-10-03:
  - **`<Term>` and glossary:** popover ids stable across builds; the mouse no longer closes a popover opened with the keyboard or with a click; the glossary links to the lesson that explains each term.
  - **Theme and explorer:** the `$` prompt in front of commands (not copied); only the current phase's folder is opened and collapsed ones are remembered; the build fails if the menu has something that is not a phase; `fase-N/` in front in the pagination and the prerequisites when changing phase; `lessonCount` test; the current file is distinguished in forced colors; unused i18n keys removed; `isLessonId` test with nested routes.
  - **DNS lab:** cancels the previous query; uses Google if Cloudflare fails; announces two identical errors in a row; counts CNAME chains correctly; warns if an IP is typed (also IPv6 without brackets); gives the name of REFUSED and the other codes; CSS without `!important`.
  - **Cryptography lab:** non-exportable ECDSA private key; warns while generating keys without silencing the announcements; clears the signature when the message changes; shows the errors; test of the 190-byte limit.
  - **Common:** form field borders at 3:1 (also the search one), shared `fill` and click tests for the three labs.
- **Known limit of the DNS lab:** with delegated subzones (e.g. `www.amazon.com`), the narration attributes the alias chain to the parent zone. Fixing it needs an NS query for each alias target.
- **Deferred:** if an alias leads to a name that does not exist (NXDOMAIN behind a CNAME), the final answer says «Ese nombre no existe» ("That name does not exist"), even though the name you typed does exist.

## Deferred minor items (from the review of the lesson «Qué es el backend»)

- The table «Frontend, backend y full stack» ("Frontend, backend and full stack") treats mobile apps as frontend, but its languages do not name Swift or Kotlin. The list comes from the spec: do we add them?
- The shopping diagram says «Backend de la tienda» ("The shop's backend"), and the story starts at «la app de una sala de conciertos» ("a concert hall's app").
- ~~In the light theme, the sun in the figure looked brown.~~ Resolved on 2026-10-04: it uses its own token, `--ide-sun` (amber in light; in dark, the orange it had before).
- ~~The `phase-intro.test.ts` test only watches Phase 0.~~ Resolved on 2026-10-07: it goes through all the phases that have an introduction.
- The Phase 0 summary in `web/src/data/phases.ts` does not mention the new lesson.

## Deferred minor items (from the technical SEO review)

- ~~The nine minor items from the review.~~ Resolved on 2026-10-03: routes with accents or capitals, deleting fallbacks without touching real pages, pagination that respects the frontmatter, external links in the sidebar, half-translated phases (the build now prevents it), exact line in diagram errors, `noindex` message, fonts without depending on the working directory and obsolete code.

## Deferred minor items (from the Phase 0 content review)

- ~~The ten minor items from the review.~~ Resolved on 2026-10-03; they are at the end of `docs/reviews/2026-10-03-phase-0-for-everyone-changes.md`.
- What remains is the home page's promise («no hace falta… programar para empezar», "you don't need to… code to start"): it depends on the "Before Phase 3" decision.
- **Careful when editing lesson 5 in English:** it is at 15.43 minutes of reading (15 is shown). It has about 14 words left before going to 16.
