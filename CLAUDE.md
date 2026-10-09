# Project context

I'm a frontend developer with 8-9 years of experience and no backend knowledge. I want to learn backend from scratch to become a full-stack developer, and I'm going to do it by building an educational website: I learn while I build it and, at the same time, I teach what I learn.

## What we're building

A public, bilingual (Spanish and English) website with a backend course organised in phases (the 12 phases of the roadmap below, from 0 to 11). Each phase is made of lessons. The content matters most: everything well explained and friendly for people who don't know backend.

**Priority #1:** the site must rank as high as possible on Google (SEO) and explain everything as simply as possible, understandable by everyone. Every content, design or technical decision is also weighed by its effect on SEO. Plan: `docs/specs/2026-10-03-seo-design.md`.

- Most lessons are well-explained text with diagrams.
- Every phase has something hands-on («Pruébalo», "Try it"), at three levels depending on its cost:
  1. A guided exercise in the reader's terminal (`curl`, `dig`, `nc`…).
  2. A playground with a real tool inside the site (e.g. PostgreSQL in the browser, Web Crypto).
  3. A custom visual lab: only for HTTP, DNS, TCP and Docker. Examples: an HTTP request simulator you can take apart, a DNS resolution animation, a step-by-step TCP handshake or a Docker layer visualiser.
- Don't obsess over the labs: the main goal is for me to learn backend, not to spend months making animations.
- The site is not the course's backend project: it's a static documentation site by default (with a server only where a playground really needs one). Backend practice lives in guided projects (`projects/`, from Phase 3) that the site explains step by step.
- It's built little by little, phase by phase: nothing is built before it's needed.

## Languages

- **The repository is in English:** docs, specs, plans, code comments, tests, commits and PRs.
- **The site is bilingual and Spanish comes first:** Spanish lives at the root (`/fase-0/…`) and English under `/en/` (`/en/phase-0/…`). Lesson content, glossary entries and UI strings exist in both languages; Spanish content, routes and slugs stay in Spanish.
- **The author and Claude talk in Spanish.**

## Docs (`docs/`)

Only what is needed to keep working gets committed. Git history keeps the rest.

- `style-guide.md`: the rules for writing lessons and playgrounds.
- `todo.md`: next steps and what the author has to review or decide.
- `specs/`: the design decisions in force and their reasons. When a decision changes, update its spec. A spec for a one-off (a single lesson, say) is deleted once implemented, after moving any lasting rule into the style guide.
- `research/`: analyses behind decisions that may be revisited.
- `reviews/`: material for a pending author review. Delete it once reviewed.
- **Plans are temporary.** An implementation plan lives only while it is being carried out: delete it in the PR that completes it. Before deleting it, move anything worth remembering (a decision, a rule, something pending) into its spec, the style guide or `todo.md`.

## Decisions already made

- Stack: Astro + Starlight, content in MDX, playgrounds in React, TypeScript, pnpm workspaces, Cloudflare for hosting.
- Full design of the site and of Phase 0: `docs/specs/2026-10-02-site-and-phase-0-design.md`.
- Visual design ("code editor" theme, dark and light): `docs/specs/2026-10-02-ide-theme-design.md`.
- Editor layout (design C: pinned tabs for playgrounds and the glossary, outline in the explorer, minimap, a discreet status bar and VS Code-like scrollbars): `docs/specs/2026-10-03-editor-layout-design.md`.
- `tcp-handshake` lab (the first React playground, the pattern for the next ones): `docs/specs/2026-10-03-tcp-lab-design.md`.
- Phase 1 design (approved on 2026-10-07; it starts with a pilot lesson): `docs/specs/2026-10-03-phase-1-design.md`.
- Name and domain: «Backend desde cero» / "Backend from Scratch", on `backenddesdecero.com`, a single domain for both languages (decided on 2026-10-03; analysis in `docs/research/2026-10-03-languages-and-names.md`). Spanish is the main language and domain.
- Technical names in English: GitHub organisation `backendfromscratch`, repository and package `backend-from-scratch` (decided on 2026-10-08). The site's public name follows each reader's language.
- Audience: everyone. No lesson assumes any programming knowledge (decided on 2026-10-03; consequences in `docs/specs/2026-10-03-seo-design.md`, §2.3).
- Routes and technical SEO: Spanish at the root, translated routes linked by `translationKey`, and an SEO audit that fails the build (design in `docs/specs/2026-10-03-seo-design.md`; rules in `docs/style-guide.md`, "Routes, translations and SEO").
- CI: GitHub Actions checks format, types, tests and build on every PR and every push to `main` (decided on 2026-10-07). Deployment stays with Cloudflare's Git integration; deploying from GitHub Actions is left for Phase 8.
- Repository language: English (decided on 2026-10-09). The site stays bilingual.
- License: MIT for the code and CC BY 4.0 for the course content in `web/src/content/` (decided on 2026-10-09; `LICENSE` and `LICENSE-CONTENT`).
- Style guide for writing lessons: `docs/style-guide.md`.
- The next steps, in order, and what the author still has to review or decide: `docs/todo.md`. Keep it up to date.

## How I want you to work with me

- My goal is to learn, not just to have the site built. Explain the technical decisions and the backend concepts that come up, instead of generating everything without context.
- You can go faster on the frontend side, because I know it well.
- Before starting, propose a project structure and a stack, explaining the pros and cons, and wait for my approval.
- You're completely free to give me your opinion and to propose adding, removing or reordering content in the roadmap phases.
- We'll start with Phase 0.

## Commands

From the repo root. Node 22 (`.nvmrc`) and pnpm, with the version pinned in `packageManager` (`package.json`).

```sh
pnpm install                 # dependencies for the whole workspace
pnpm dev                     # dev server: http://localhost:4321
pnpm check                   # types (astro check)
pnpm test                    # tests (vitest)
pnpm build                   # static site in web/dist/
pnpm --filter web preview    # serves web/dist/ to try the build
pnpm format                  # formats with prettier
pnpm format:check            # checks the format without changing anything
```

- **The build fails on purpose** if an internal link is broken or crosses languages (`starlight-links-validator`), if a mermaid block can't be drawn, if a `<Term>` has no glossary entry, if an `<Analogy>` has no `limits`, if a UI string is missing in one language or if an SEO audit rule breaks. Fix the cause; don't disable the check.
- Tests live next to the code (`x.ts` → `x.test.ts`). The ones that render a playground in a simulated document are named `*.dom.test.tsx`, start with `// @vitest-environment happy-dom` and use `web/src/playgrounds/dom-test.ts`.
- prettier doesn't touch `.md` or `.mdx` files (`.prettierignore`): content formatting is set by `docs/style-guide.md`.
- **CI** (`.github/workflows/ci.yml`): on every PR and every push to `main` it runs `format:check`, `check`, `test` and `build`. It doesn't deploy.
- **PR title** (`.github/workflows/pr-title.yml`): on every PR it checks that the title follows Conventional Commits. Both jobs, "format, types, tests and build" and "conventional commit title", are required to merge into `main`.

## Git and GitHub

- **English everywhere:** commit messages, PR titles and descriptions, branch names, issues and review comments.
- **Conventional Commits:** `type(optional-scope): summary`, lowercase, imperative, no final period. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Example: `feat(phase-1): add the ssh lesson`.
- **Always squash.** `main` is protected: changes go through a PR and are squash-merged (the only merge method enabled). The squashed commit takes the PR title, so the PR title is what CI checks.
- **No Claude attribution:** no `Co-Authored-By` trailer and no "Generated with Claude Code" line.
- Commit, push or open PRs only when the author asks.

## Before calling a task done

- Run `pnpm format:check && pnpm check && pnpm test && pnpm build` (the same as CI) and fix whatever fails. `astro check` must finish with no errors or warnings. If something can't pass, say so instead of calling the task done.
- If you change something visible, look at it in the browser (`pnpm dev`) in dark and light mode, and at mobile width.
- If you add, move or delete a module in `web/src/`, update the "Site architecture" map.
- If you change a design decision, update its spec in `docs/specs/` and, if something is left for the author to review or decide, `docs/todo.md`.
- If the work completes a plan, delete the plan in the same PR ("Docs").

## Site architecture (`web/`)

Astro generates static HTML. Starlight provides the base of a documentation site (routes from files, menu, Pagefind search and languages), and the editor layout is built by replacing some of its components (`components/overrides/`). Everything expensive happens at build time: the diagrams, the social images and the SEO audit. The browser only runs the layout's scripts, Starlight's (search and theme) and the playgrounds' React islands.

Paths relative to `web/`:

```
astro.config.ts                 integrations and their order: drop-fallbacks and diagrams before Starlight; seo-audit, last
src/content.config.ts           schemas: docs (`lesson` header, `translationKey`), i18n (required UI strings) and glossary
src/content/docs/               MDX pages: Spanish at the root (fase-0/…) and English in en/ (en/phase-0/…)
src/content/glossary/           one YAML per term and language (es/port.yaml, en/port.yaml)
src/content/i18n/               our own UI strings (es.json, en.json)
src/content/*.test.ts           content tests: lesson order and UI keys defined and used
src/data/phases.ts              the 12 phases: title, summary, status and planned lessons
src/data/playgrounds.ts         labs and playgrounds, for the /playgrounds/ page
src/data/site.ts                public URL and site name in each language
src/routeData.ts                Starlight middleware: fixes the sidebar, pagination, hreflang and language picker for translated routes
src/pages/og/[...route].png.ts  a 1200 × 630 PNG per page (og:image), generated at build time
src/integrations/               our own Astro integrations: drop-fallbacks (deletes the fallback pages), diagrams and seo-audit
src/components/                 lessons (Term, TryIt, Analogy, SelfCheck), general pages (PhaseList, PlaygroundList, GlossaryList, CodeLens)
                                and layout (EditorTabs, Outline, Minimap; LessonIntro, the lesson header, from overrides/PageTitle.astro)
src/components/overrides/       replacements for Starlight components, registered in astro.config.ts: Header, Sidebar, PageTitle, LanguageSelect,
                                TwoColumnContent, PageSidebar, Pagination, Footer and SiteTitle
src/components/diagrams/        diagrams Mermaid doesn't draw well, in HTML and CSS (Encapsulation, NatTranslation, DataToScreen)
src/playgrounds/<name>/         one playground per folder: pure logic, React UI, strings.ts (es/en), CSS and tests
src/styles/theme.css            "code editor" theme: the --ide-* tokens, the single source of colour (tokens.test.ts checks contrast)
src/styles/diagrams.css         styles for the diagrams generated from mermaid blocks
src/lib/                        pure logic, no DOM, with tests:
  translations.ts               translation index by translationKey; translations-astro.ts feeds it with the content
  route-fixes.ts                the fixes routeData.ts applies
  locales.ts, links.ts          the course languages and each language's internal URLs
  content-i18n.ts               UI strings in the content's language, not the URL's
  lessons.ts, sidebar.ts        what a lesson is and which phase it belongs to; one menu group per published phase
  glossary.ts                   glossary ids, alphabetical order and the lesson that explains each term
  explorer.ts, outline.ts       file explorer and page outline
  minimap.ts, pinned-tabs.ts    minimap and tab strip
  reading.ts                    reading minutes
  storage.ts                    localStorage that doesn't fail (private browsing, full quota)
  structured-data.ts            breadcrumb JSON-LD
  color.ts                      WCAG contrast
  fill.ts, live-text.ts         {placeholder} slots in strings and the playgrounds' aria-live regions
  diagrams/                     Sätteri plugin (diagrams-plugin.ts) that turns mermaid blocks into HTML at build time:
                                sequences (sequence.ts) and chains (chain.ts), with hast.ts and errors.ts as helpers
  seo/                          audit rules (audit.ts), HTML reading (page.ts) and JavaScript budget (js-budget.ts)
  og/                           social image (card.ts) and its fonts (fonts.ts)
public/                         copied as is: favicon.svg and robots.txt
```

- **Translated routes.** Starlight assumes a page's translation has the same route with another language prefix, and that's not the case here (`/fase-0/que-es-dns/` ↔ `/en/phase-0/what-is-dns/`). The frontmatter's `translationKey` links each pair: `lib/translations.ts` builds the index and `routeData.ts` uses it to fix what Starlight gets wrong. The fallback pages Starlight would generate for untranslated pages are deleted from the build and the sitemap (`integrations/drop-fallbacks.ts`). Rules in `docs/style-guide.md`, "Routes, translations and SEO".
- **Pure logic, UI that only renders.** Anything that decides something goes in `src/lib/` (or in each playground's logic, like `machine.ts` in `tcp-handshake`) as pure functions with tests. The `.astro` and `.tsx` files only call it and render. The playground pattern is in `docs/style-guide.md`, "Playgrounds".
- **Integration order matters** (`astro.config.ts`): `drop-fallbacks` deletes the fallback pages before Pagefind indexes, `diagrams` turns mermaid blocks into HTML before Starlight processes the Markdown, and `seo-audit` goes last because it needs the sitemap already written.

---

# Course roadmap

## Phase 0 — How the internet works (the foundations)

Before writing a line of backend, you need to understand where the data travels.

- **What the backend is**: the part of a website or an app you don't see, what it does and how it differs from the frontend.
- **Client-server model**: who asks and who answers, and why a server is simply a program that listens.
- **What a protocol is**: an agreement on how two parties communicate, like a language with rules. HTTP, TCP, SSH and DNS are all protocols.
- **TCP/IP model (and OSI as a reference)**: the network layers and what each one does.
- **IP, ports and sockets**: public and private addresses, NAT, IPv4 and IPv6, routing (how a packet travels from router to router), and why a web server usually listens on port 80 or 443.
- **TCP vs UDP**: reliability versus speed, and the TCP _handshake_.
- **DNS**: how `google.com` becomes an IP, A, CNAME, MX and TXT records, and TTL.
- **TLS/HTTPS**: public and private key cryptography, encryption, certificates and certificate authorities. What the browser's padlock does.
- **From URL to page**: what happens from when you type a URL and press Enter (DNS → TCP → TLS → HTTP → response), tying everything above together.

## Phase 1 — Terminal, Linux and SSH

Almost every server in the world is Linux without a graphical interface, so this is where you'll live.

- **Shell (bash/zsh)**: navigation, pipes (`|`), redirections and basic scripts.
- **File system and permissions**: users, groups, `chmod`, `chown` and `sudo`.
- **Processes**: `ps`, `top`, signals, daemons and `systemd`.
- **Environment variables**: how to configure an application without putting secrets in the code.
- **SSH**: applying public and private key cryptography (explained in Phase 0), `ssh-keygen`, `authorized_keys`, connecting to remote servers, `scp` and tunnels.
- **Git beyond the basics**: branches, rebase, and Git as the basis for deployment.

## Phase 2 — HTTP in depth

You know it as a client. Now it's time to know it as the one who answers.

- **Anatomy of a request and a response**: start line, headers and body.
- **Methods**: GET, POST, PUT, PATCH and DELETE, and the concepts of idempotency and safety.
- **Status codes**: 2xx, 3xx, 4xx and 5xx, and when to really use each one.
- **Important headers**: Content-Type, Authorization, Cache-Control, Cookie and Set-Cookie.
- **Cookies**: HttpOnly, Secure and SameSite.
- **CORS from the server side**: you'll finally understand why it gave you errors.
- **HTTP caching**: ETag, 304 and CDNs.
- **Protocol versions**: HTTP/1.1, HTTP/2 and HTTP/3 (QUIC), with their practical differences.

## Phase 3 — Your first server

- **Language**: I recommend starting with **Node.js + TypeScript**. You already know the language, so you focus on backend concepts and not on syntax. Later on, learning **Go** or **Python** will open your mind.
- **HTTP server without a framework**: use Node's bare `http` module to see there's no magic.
- **Framework**: Fastify, Hono or Express. You'll learn routing, middleware and the lifecycle of a request.
- **Input validation**: never trust what comes from the client. Zod is a good tool for this.
- **Error handling and logging**.
- **Event loop and asynchrony on the server**: what blocks, what doesn't and why it matters with many users at once.

## Phase 4 — API design

- **REST**: resources, well-designed URLs, pagination, filters and versioning.
- **OpenAPI/Swagger**: how to document an API and use it as a contract.
- **Alternatives and when to use them**: GraphQL, gRPC, WebSockets, Server-Sent Events and webhooks.
- **Serialisation**: JSON and a bit of binary formats like Protobuf.

## Phase 5 — Databases

The heart of almost any backend.

- **SQL with PostgreSQL**: SELECT, JOIN, GROUP BY and subqueries.
- **Data modelling**: entities, relationships (1:N, N:M) and normalisation.
- **Indexes**: what they are, how they work inside (B-tree) and `EXPLAIN`.
- **Transactions and ACID**: isolation levels and race conditions.
- **Migrations**: how to evolve the schema without breaking production.
- **ORMs and query builders**: Drizzle or Prisma, advantages and risks, like the N+1 problem.
- **NoSQL**: Redis (key-value and cache), MongoDB (documents), and when it makes sense over SQL.

## Phase 6 — Authentication, authorisation and security

- **Password hashing**: argon2 or bcrypt. Never encrypt passwords, always hash them.
- **Sessions vs JWT**: advantages, pitfalls and where to store them.
- **OAuth 2.0 and OpenID Connect**: "Log in with Google" from the inside.
- **Authorisation**: roles and permissions (RBAC).
- **OWASP Top 10**: SQL injection, XSS, CSRF, SSRF, etc.
- **Rate limiting and secrets management**.

## Phase 7 — Docker and containers

- **What problem it solves**: the famous "it works on my machine".
- **Image vs container**, layers and registry (Docker Hub).
- **Dockerfile**: multi-stage builds and how to make small images.
- **Volumes and networks**: persistence and communication between containers.
- **Docker Compose**: bring up app + database + Redis with a single command.

## Phase 8 — Deployment and infrastructure

- **VPS**: rent a server, log in over SSH, harden it (firewall, disable password login).
- **Reverse proxy**: Nginx or Caddy.
- **Your own domain + DNS + HTTPS** with Let's Encrypt.
- **CI/CD**: GitHub Actions to test and deploy automatically.
- **Cloud models**: IaaS, PaaS and serverless. AWS concepts like compute, object storage (S3), managed databases and IAM.
- **Infrastructure as code**: an introduction to Terraform.

## Phase 9 — Architecture and scaling

- **Asynchronous work**: queues and background jobs (BullMQ, RabbitMQ).
- **Caching**: strategies and invalidation, one of the genuinely hard problems.
- **Scaling**: vertical vs horizontal, load balancers and _stateless_ services.
- **Monolith vs microservices**: and why it's almost always better to start with a monolith.
- **Distributed systems**: CAP theorem, eventual consistency and event-driven architecture.

## Phase 10 — Quality and observability

- **Testing**: unit, integration (with a real database in Docker) and end-to-end.
- **Observability**: structured logs, metrics and traces (OpenTelemetry).
- **Reliability**: health checks, alerts and incident management.

## Phase 11 — Backend for AI and agents

This is the part that will give you the most value in the market right now.

- **Model APIs**: consume them from the server, never expose the API key in the frontend.
- **Streaming**: token-by-token responses (SSE).
- **Tool use / function calling**: how a model calls functions in your backend.
- **MCP (Model Context Protocol)**: exposing your services to agents.
- **Semantic search**: embeddings, vector databases (pgvector) and RAG.
- **Production**: cost control, latency, queues for long agent tasks and evaluating results.
