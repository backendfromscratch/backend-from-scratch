# Design: course site + Phase 0

- **Date:** 2026-10-02
- **Status:** approved (2026-10-02)
- **Scope of this cycle:** the site skeleton and the complete content of Phase 0. Each following phase will have its own design → plan → implementation cycle.

## 1. Intent

A **public, bilingual (Spanish and English)** site that teaches backend from scratch, organized in the 12 phases of the roadmap. Its author is a frontend developer who is learning backend while building it: writing and explaining each lesson is his learning method.

**The most important thing is the content:** everything well explained and friendly for someone who does not know backend. The site is the means, not the end.

**Target audience:** ~~people who already code (for example, frontend) but do not know backend. We do not explain what a variable is; we do explain what a port is.~~ **Changed on 2026-10-03:** everyone. No lesson assumes any knowledge of programming (`docs/specs/2026-10-03-seo-design.md`, §2.3).

**Way of working:**

- It is built bit by bit, phase by phase. Nothing is built before it is needed.
- The site is **not** the course's backend project. It is a documentation site. The backend practice lives in guided projects (`projects/`, from Phase 3) that the site explains step by step.
- Each phase has something hands-on to play with, at a cost proportional to what it contributes (see §5).

## 2. Stack

| Piece              | Choice                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Framework          | Astro + Starlight (Astro's official documentation theme), in their latest stable versions at implementation time   |
| Content            | MDX                                                                                                                |
| Playgrounds        | React (`@astrojs/react`), hydrated with `client:visible`                                                           |
| Language           | TypeScript                                                                                                         |
| Runtime and packages | Node 22, pnpm (workspaces)                                                                                       |
| Formatting         | Prettier (with `prettier-plugin-astro`)                                                                            |
| Tests              | Vitest for the playgrounds' logic                                                                                  |
| Hosting            | Cloudflare (static site on its CDN)                                                                                |

**Why Astro + Starlight:** it ships out of the box everything a documentation site needs (side menu, page table of contents, previous/next, dark mode, accessibility, serverless Pagefind search and language support with _fallback_). Its islands architecture serves plain HTML and only loads JavaScript in the playgrounds. If in the future a playground needs a server, Astro lets us add endpoints without changing framework.

**Discarded alternatives:**

- **Next.js + Fumadocs:** too much frontend complexity (RSC, caching) for a content site.
- **Docusaurus:** the whole site is a React SPA, with more JS on pages that only have text.
- **Vite + React by hand:** it would force us to build the menu, search, SEO and languages.

**Architecture:** static by default, with a server only where a playground really needs it. In Phase 0 none does.

## 3. Repository structure

```
backend-desde-cero/
├── CLAUDE.md
├── package.json            ← monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
├── docs/                   ← internal documentation (specs, style guide); not published
│   ├── specs/
│   └── style-guide.md
└── web/                    ← the site: Astro + Starlight
    ├── astro.config.mjs
    ├── public/
    │   └── _redirects
    └── src/
        ├── content/
        │   ├── docs/       ← lessons (es/, en/)
        │   ├── glossary/   ← glossary (es/, en/)
        │   └── i18n/       ← own UI strings (es.json, en.json)
        ├── data/
        │   └── phases.ts   ← single source of the 12 phases
        ├── components/     ← lesson components
        └── playgrounds/    ← one React playground per folder
```

- `projects/` is **not created** in this cycle. It will appear in Phase 3 as one more workspace package, one per project.
- Folder, file and code names are in English.
- git is initialized from the start. **No commit, push or remote repository is made unless the author asks.**

## 4. Content and languages

### 4.1 Routes and languages

- Two languages with a prefix: `/es/…` (default language) and `/en/…`. There is no _root locale_.
- `/` redirects to `/es/` with a **302** through `public/_redirects`. 302 is chosen over 301 because a 301 stays cached in the browser permanently, and in the future the destination could depend on the reader's language.
- Automatic language detection (`Accept-Language` header) is out of this cycle, because it requires server code.
- **Slugs are in English in both languages** (`/es/phase-0/dns/`). Starlight pairs translations by file path and its language selector only changes the prefix.
- **Fallback:** a page that is not translated shows the content in Spanish with Starlight's notice.

### 4.2 Single source of phases

`web/src/data/phases.ts` defines the 12 phases: `id`, `slug`, title and summary in both languages, and `status: 'available' | 'coming-soon'`. From this file the following are generated:

- the `roadmap` page (the 12 phases with their status);
- the phases section of the home page;
- the side menu groups, only for `available` phases. Each group is autogenerated from its folder and ordered with `sidebar.order` in the frontmatter.

### 4.3 Content tree for this cycle

```
web/src/content/docs/
├── es/
│   ├── index.mdx                 ← home page
│   ├── roadmap.mdx
│   ├── glossary.mdx              ← generated from the glossary collection
│   └── phase-0/
│       ├── index.mdx             ← introduction to the phase + mini terminal guide
│       ├── client-server.mdx
│       ├── protocols.mdx
│       ├── tcp-ip-model.mdx
│       ├── ip-ports-sockets.mdx
│       ├── tcp-vs-udp.mdx
│       ├── dns.mdx
│       ├── tls-https.mdx
│       └── from-url-to-page.mdx
└── en/                           ← same tree
```

**Home page:** what the course is, who it is for, how it is organized (lessons and the three levels of "Pruébalo") and a button to start with Phase 0.

### 4.4 Translation flow

1. Claude writes the draft in Spanish.
2. The author reviews it and rewrites it in his own voice.
3. When the author approves it, Claude translates it into English.
4. The author reviews the English version.

The site's own UI strings (components and playgrounds) are written in both languages from the start:

- **Astro components:** use Starlight's `i18n` collection (`src/content/i18n/es.json`, `en.json`).
- **React playgrounds:** receive `lang` as a prop and have their own `strings.ts` with the `es` and `en` keys.

## 5. Lesson template

### 5.1 Fixed structure

| Section                     | Content                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **En una frase** ("In one sentence") | The concept in one line, "what you will learn" (2 to 4 points) and the prerequisites (links to lessons)   |
| **El problema** ("The problem") | Why this exists, before what it is                                                                     |
| **La analogía** ("The analogy") | A comparison with something from everyday life and a mandatory "where the analogy breaks down" section |
| **Cómo funciona de verdad** ("How it really works") | The real mechanism, with diagrams                                                      |
| **Pruébalo** ("Try it")     | Terminal exercise or playground, with the expected output explained                                                |
| **Ya lo has visto** ("You have already seen it") | Connection with a frontend dev's experience (DevTools, `fetch`, known errors)         |
| **Errores comunes** ("Common mistakes") | Typical misunderstandings                                                                      |
| **Resumen** ("Summary")     | 3 to 5 points                                                                                                      |
| **¿Lo has entendido?** ("Did you get it?") | 2 to 4 questions with a collapsible answer                                                      |
| **Para profundizar** ("Further reading") | Links to MDN, RFCs and other resources                                                                |

### 5.2 Validated frontmatter

Starlight's schema is extended with Zod (`docsSchema({ extend })`) so that all lessons have the same header:

- `oneLiner: string`, which is the "En una frase" sentence;
- `objectives: string[]`, which are the "what you will learn" points;
- `prerequisites?: string[]`, which are slugs of other lessons.

A `LessonIntro` component renders these fields at the start of each lesson. If a lesson is missing a required field, the build fails.

### 5.3 Components

**From Starlight, with nothing to build:** `Aside`, `Tabs`, `Steps`, `FileTree`, `Code`, `Badge` and `Card`.

**Built by us:**

| Component                   | What it does                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<Term id="…">text</Term>`  | Shows the short definition of the glossary term in the current language and links to its entry. Works with mouse, keyboard and touch screen. If the `id` does not exist, the build fails. |
| `<TryIt>`                   | "Try it in your terminal" block: command, expected output and explanation. Supports per-operating-system variants (macOS/Linux and Windows).                                         |
| `<Analogy>`                 | The analogy and its "where the analogy breaks down" section                                                                                                                          |
| `<SelfCheck question="…">`  | A question with a collapsible answer (`<details>`)                                                                                                                                   |
| `LessonIntro`               | The lesson header (see §5.2)                                                                                                                                                         |

### 5.4 Glossary

- It is a data collection per language: `glossary/es/*.yaml` and `glossary/en/*.yaml`. Each entry has `id`, `term`, `short` (one or two sentences) and, optionally, `related` (other ids).
- The `glossary` page is generated from the collection, sorted alphabetically.

### 5.5 Diagrams

- **Mermaid** for sequences and flows: the TCP handshake, DNS resolution, the TLS handshake and the journey from the URL to the page. It is written as text inside the MDX, so it is translated along with the lesson and respects Starlight's light or dark mode.
  - The plan will choose the specific integration by comparing the rendering in the browser with the rendering at build time. **Criterion:** it must follow Starlight's theme selector (`data-theme` attribute, not just `prefers-color-scheme`).
- **Hand-made SVG as an Astro component** for what Mermaid does not draw well (network layers, encapsulation, NAT). The texts arrive through props in each language and the colors come from the theme's CSS variables.
- Excalidraw and images with embedded text are not used, because each would have to be duplicated per language.

### 5.6 Style guide

`docs/style-guide.md` covers:

- addressing the reader informally (tuteo);
- short sentences and one idea per paragraph;
- every technical term is defined the first time it appears (or marked with `<Term>`);
- "simplemente", "obviamente" and "es fácil" are forbidden;
- show before you tell;
- between 10 and 15 minutes of reading per lesson;
- analogies always with their limits.

## 6. Phase 0

### 6.1 Changes from the original roadmap (accepted)

1. **New final lesson, "From the URL to the page":** the complete DNS → TCP → TLS → HTTP → response journey, which ties the previous lessons together.
2. **Public and private key cryptography is explained in Phase 0,** inside the TLS lesson. Phase 1's SSH lesson will reuse it instead of explaining it.
3. **NAT and routing** go into the lesson on IP, ports and sockets.
4. **New opening lesson, «Qué es el backend»** (2026-10-04): `fase-0/que-es-el-backend.mdx` and `en/phase-0/what-is-the-backend.mdx` (its spec was deleted once implemented).

### 6.2 Phase introduction (`phase-0/index.mdx`)

- What you will learn and the map of the 9 lessons.
- **Mini terminal guide:** how to open it on macOS and Linux and how to paste and run commands, without explaining yet what they do (that is Phase 1).
- **Windows:** WSL is recommended. In each exercise native alternatives are given when they exist (for example, `nslookup` instead of `dig`).

### 6.3 Lessons and their "Pruébalo"

Levels: **1** = terminal exercise, **2** = playground with a real tool, **3** = custom visual lab.

| Lesson                                   | Pruébalo ("Try it")                                                                                                       | Level |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| `what-is-backend` | Open the Open-Meteo API in the browser and repeat it with `curl` | 1 |
| `client-server`                          | `nc -l 8080` and open `localhost:8080` in the browser to see the raw request                                              | 1     |
| `protocols`                              | Write an HTTP request by hand with `printf … \| nc example.com 80`                                                        | 1     |
| `tcp-ip-model` (with OSI as a reference) | Annotate the output of `curl -v` layer by layer                                                                           | 1     |
| `ip-ports-sockets` (with NAT and routing) | Private IP (`ipconfig getifaddr en0`) versus public IP (`curl -4 icanhazip.com` and `curl -6`); `lsof -nP -iTCP -sTCP:LISTEN` and `lsof -nP -i :8080` with `nc`; `traceroute -n` | 1     |
| `tcp-vs-udp`                             | **`tcp-handshake` lab** + chat with `nc` and `nc -u` between two terminals                                                | 3 + 1 |
| `dns`                                    | **`dns-lookup` lab** + `dig`, `dig +trace`, `dig MX` and `dig TXT`                                                        | 3 + 1 |
| `tls-https` (with cryptography)          | `openssl s_client -connect … -servername …` + **`crypto-keys` playground**                                                | 1 + 2 |
| `from-url-to-page`                       | `curl -w` with the timing breakdown (DNS, TCP, TLS, first byte, total), compared with DevTools' _Timing_ tab               | 1     |

### 6.4 Playgrounds

**Common requirements:**

- They are React components hydrated with `client:visible`.
- They have texts in both languages.
- They can be used entirely with the keyboard.
- They respect `prefers-reduced-motion`: no animations; the state changes directly.
- They use Starlight's theme colors in light and dark mode.
- The logic is separate from the interface and has tests.

#### `tcp-handshake` (level 3)

- **Detailed design:** `docs/specs/2026-10-03-tcp-lab-design.md`.
- **Logic:** a pure state machine, `(state, event) → state`, with Vitest tests. The interface only represents it.
- **Shows:** the client and the server with their TCP state (`CLOSED`, `LISTEN`, `SYN_SENT`, `SYN_RECEIVED`, `ESTABLISHED`) and the segments travelling between them with their flags and their sequence and ACK numbers.
- **Controls:** step forward, reset and "drop this packet" on any segment in transit.
- **Phases:** handshake (SYN → SYN-ACK → ACK) and sending several data segments with their ACK. If a packet is lost, the timeout and the retransmission are shown.
- **UDP mode:** sends the same data with no handshake or ACK. A lost packet is not recovered.
- **Out of scope:** connection closing (FIN and closing states), flow control and congestion control.

#### `dns-lookup` (level 3, with real data)

- **Input:** the reader types a domain and chooses the record type (A, AAAA, CNAME, MX, TXT or NS).
- **Real data:** they are queried over DNS-over-HTTPS (JSON API) to a public resolver, Cloudflare or Google. The result shows the records with their TTL.
- **Animation:** the resolver → root → TLD → authoritative journey. The names of the servers at each level are real and are obtained by asking for the `NS` records of `.`, of the TLD and of the domain.
- **Didactic honesty:** the lesson and the playground say explicitly that the resolver does the journey for us, that the animation reconstructs it and that `dig +trace` shows the 100 % real version.
- **Logic:** building the queries and parsing the responses are separated from the interface and have tests (with recorded responses, no network).
- **Visible errors:** nonexistent domain (NXDOMAIN), no connection and a resolver that does not respond.
- **Risk to check at implementation time:** that the chosen resolver allows calls from the browser (CORS). If neither of the two does, we stop and decide with the author between a minimal _proxy_ on Cloudflare and recorded data for example domains.

#### `crypto-keys` (level 2)

- It uses the browser's Web Crypto API; it is real cryptography.
- **Encryption (RSA-OAEP):** generate a key pair, encrypt a message with the public key and decrypt it with the private one.
- **Signature (ECDSA):** sign a message, verify the signature, modify the message and see that the verification fails.
- Keys are shown abbreviated (in JWK or PEM format) and can be expanded in full.
- The Web Crypto API only works in secure contexts (HTTPS or `localhost`). The lesson uses that as an example of why HTTPS matters.

## 7. Deployment

- The site is served as a static site on **Cloudflare**. The plan will check the current documentation to see exactly which Cloudflare product to use.
- At first, Cloudflare's free subdomain is used. The custom domain is added when the author decides.
- Deployment will be automatic on push to `main`, through Cloudflare's Git integration. Deploying from GitHub Actions is left for Phase 8.
- **Updated on 2026-10-07:** a GitHub Actions workflow (`.github/workflows/ci.yml`) checks formatting, types, tests and build on every PR and every push to `main`. It does not deploy.
- Deployment is set up early (after the skeleton), so the author can see progress live.
- **Creating the remote repository, pushing or connecting Cloudflare requires the author's explicit request.**

## 8. Testing and verification

| What                   | How                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Types and content      | `astro check` and `astro build` (the build fails with broken MDX, invalid frontmatter or a nonexistent `<Term>`)               |
| Internal links         | The `starlight-links-validator` plugin in the build                                                                            |
| Playground logic       | Vitest tests of the TCP state machine, the DNS parsing and the cryptography utilities                                         |
| Terminal exercises     | Each command is really run on macOS before publishing the lesson, and the "expected output" comes from that run                |
| Interface              | Browser review of every page and playground, in both languages and in light and dark mode, including keyboard use              |

There is no end-to-end test suite in this cycle; it will arrive with Phase 10.

## 9. Order of work

1. **Skeleton:** workspace, Astro + Starlight, languages, `phases.ts`, home page, roadmap, glossary, lesson components, style guide and redirect.
2. **Deployment** on Cloudflare, when the author asks for it.
3. **Pilot lesson:** `client-server` complete (text, `TryIt`, glossary and translation) to calibrate the tone and the template with the author.
4. **The rest of the lessons, one by one** and in roadmap order, each with the author's review. Each playground is built alongside its lesson.
5. **Translation** of each lesson when the author approves the Spanish version.

The first implementation plan covers steps 1 to 3. Steps 4 and 5 will have a short plan per lesson (with its playground, if it has one), so as not to plan content that the pilot lesson might change.

## 10. Definition of done

- The introduction and the 9 lessons of Phase 0 are approved by the author in Spanish and translated and reviewed in English.
- `tcp-handshake`, `dns-lookup` and `crypto-keys` work and their logic has green tests.
- All the exercise commands have been run and verified.
- The glossary covers all the terms marked in Phase 0.
- `astro check`, `astro build` and the link validator pass with no errors.
- The site is published at a public URL.

## 11. Out of scope for this cycle

- The content of Phases 1 to 11.
- The `projects/` folder (arrives in Phase 3).
- Custom domain, deploying from GitHub Actions (CI does exist: see §7) and server-side language detection.
- User accounts, saved progress, comments and analytics.
- A visual identity of its own beyond the name, the logo and the color palette on top of Starlight's theme.
- Connection closing, flow control and congestion in the TCP lab.

## 12. Pending decision for the author

- **The site's name.** Working title: _Backend desde cero_ / _Backend from Scratch_. It does not block the skeleton; it is changed in a single place of the configuration.
