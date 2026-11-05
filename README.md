# Backend from Scratch

A free backend course for everyone, in Spanish and English: from how the internet works to building, securing, deploying and running your own backend. No programming knowledge assumed.

**Read it at [backenddesdecero.com](https://backenddesdecero.com)** (Spanish, the main language, as **Backend desde cero**) or **[backenddesdecero.com/en/](https://backenddesdecero.com/en/)** (English).

It is written by a frontend developer learning backend while building it.

## What's in the course

Twelve phases, from 0 to 11. Each phase is a set of lessons with diagrams and something hands-on, and every lesson ends with a short quiz.

| Phase | Topic | Lessons | Read it |
| --- | --- | --- | --- |
| 0 | How the internet works | 9 | [ES](https://backenddesdecero.com/fase-0/) · [EN](https://backenddesdecero.com/en/phase-0/) |
| 1 | Terminal, Linux and SSH | 10 | [ES](https://backenddesdecero.com/fase-1/) · [EN](https://backenddesdecero.com/en/phase-1/) |
| 2 | HTTP in depth | 8 | [ES](https://backenddesdecero.com/fase-2/) · [EN](https://backenddesdecero.com/en/phase-2/) |
| 3 | Your first server | 9 | [ES](https://backenddesdecero.com/fase-3/) · [EN](https://backenddesdecero.com/en/phase-3/) |
| 4 | API design | 9 | [ES](https://backenddesdecero.com/fase-4/) · [EN](https://backenddesdecero.com/en/phase-4/) |
| 5 | Databases | 10 | [ES](https://backenddesdecero.com/fase-5/) · [EN](https://backenddesdecero.com/en/phase-5/) |
| 6 | Authentication, authorization and security | 9 | [ES](https://backenddesdecero.com/fase-6/) · [EN](https://backenddesdecero.com/en/phase-6/) |
| 7 | Docker and containers | 8 | [ES](https://backenddesdecero.com/fase-7/) · [EN](https://backenddesdecero.com/en/phase-7/) |
| 8 | Deployment and infrastructure | 8 | [ES](https://backenddesdecero.com/fase-8/) · [EN](https://backenddesdecero.com/en/phase-8/) |
| 9 | Architecture and scaling | 7 | [ES](https://backenddesdecero.com/fase-9/) · [EN](https://backenddesdecero.com/en/phase-9/) |
| 10 | Quality and observability | 7 | [ES](https://backenddesdecero.com/fase-10/) · [EN](https://backenddesdecero.com/en/phase-10/) |
| 11 | Backend for AI and agents | — | Coming soon |

Every published phase is in both languages.

The hands-on parts come at three levels:

- **In your terminal:** guided exercises with real tools (`curl`, `dig`, `ssh`, `psql`, `docker`…), with the output you should see.
- **In the browser:** playgrounds with a real tool inside the page, such as PostgreSQL running in your browser, or public and private keys with Web Crypto.
- **Interactive labs:** a step-by-step TCP handshake, a DNS lookup, a CORS lab and a Docker layer visualizer.

## The project you build

From Phase 3 on, the course builds one project with you: the API of a small online shop. It grows with every phase:

| Phase | Steps | What the shop gains |
| --- | --- | --- |
| 3 | 01–09 | A bare Node.js HTTP server, then Hono, input validation, errors and logs |
| 4 | 10–17 | A REST API with pagination and versions, an OpenAPI contract, webhooks, Server-Sent Events and WebSockets |
| 5 | 18–23 | PostgreSQL, migrations, indexes, transactions and an ORM (Drizzle) |
| 6 | 24–31 | Hashed passwords, sessions, JWT, sign-in with OpenID Connect, roles, defenses against injection, XSS, CSRF and SSRF, rate limiting |
| 7 | 32–34 | A small Docker image and Docker Compose with PostgreSQL and Redis |
| 8 | 35–36 | Production behind nginx with HTTPS, and continuous deployment: GitHub Actions publishes the image and the server pulls it |
| 9 | 37–41 | A job queue with a worker, a cache, two copies of the API, deploys without downtime and events that are never lost |
| 10 | 42–46 | Unit, integration, end-to-end and contract tests, traces, metrics, health checks and alerts |

The project lives in [`projects/`](projects/), once per language: [`tienda-api`](projects/tienda-api/) in Spanish and [`shop-api`](projects/shop-api/) in English. Each step is a folder holding the whole project as it stands at the end of the lesson that builds it, so if you get stuck you can compare your code with it. Every step is a standalone npm project, and the lessons let you download each one.

## Found a mistake?

Every lesson ends with a link to report a problem: it opens a GitHub issue with the lesson already filled in. For questions and ideas, use [Discussions](https://github.com/backendfromscratch/backend-from-scratch/discussions).

## Running it locally

### The site

You need Node 22 (see `.nvmrc`) and pnpm (the version is pinned in `package.json`).

```sh
pnpm install   # dependencies
pnpm dev       # dev server at http://localhost:4321
pnpm build     # static site in web/dist/
```

Before a pull request, run the same checks as CI:

```sh
pnpm format:check && pnpm check && pnpm knip && pnpm test && pnpm build && pnpm test:e2e
```

- `pnpm check` runs the type checks.
- `pnpm knip` looks for unused code.
- `pnpm test` runs the tests.
- `pnpm test:e2e` checks accessibility with axe-core on every page of the built site. The first time, run `pnpm --filter web exec playwright install chromium`.

The build fails on purpose if a link is broken, a glossary term is missing, a text is missing in one language or an SEO rule breaks.

### A step of the guided project

The steps use Node 26, the version the lessons ask for. With Docker, without installing it:

```sh
docker run --rm -v "$PWD/projects/tienda-api/04-servidor-http":/p -w /p node:26 sh -c 'npm ci && npm run check && npm test'
```

Some steps need more:

- From Phase 5, PostgreSQL 18.
- From Phase 7, a Redis for some tests (without one they are skipped).
- From step 34, Docker Compose starts everything.

Each project's README ([Spanish](projects/tienda-api/README.md), [English](projects/shop-api/README.md)) says how to set them up.

## How it's built

A static site made with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build), with content in MDX, interactive labs in React and TypeScript throughout. Diagrams, social images and an SEO audit are generated at build time, so readers get plain HTML; JavaScript only runs for the editor layout, the search and the labs. It is hosted on [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) as static files, deployed on every push to `main`.

```
web/            the site
  src/content/  lessons (Spanish at the root, English in en/), glossary and UI texts
  src/          components, playgrounds and the build's logic
  e2e/          accessibility tests in the browser
projects/       the guided project, one folder per step: tienda-api/ (Spanish) and shop-api/ (English)
docs/           the style guide for writing lessons
```

GitHub Actions checks every pull request in two jobs:

- **The site:** format, types, unused code, tests, build and accessibility.
- **The guided project:** in Node 26 against PostgreSQL and Redis, split by language and group of phases into 8 jobs in parallel. Each step is installed, type-checked and tested. The steps with a `Dockerfile` also get their image built and their Compose stack started.

A pull request checks only the steps it changes; pushes to `main` and a weekly run check them all.

## License

- **Code** (everything except the course content below, including the tests in `web/src/content/`): [MIT](LICENSE).
- **Course content** (the lessons in `web/src/content/docs/`, the glossary in `web/src/content/glossary/` and the UI texts in `web/src/content/i18n/`): [Creative Commons Attribution 4.0 International](LICENSE-CONTENT) (CC BY 4.0). You may share and adapt it, including commercially, as long as you give credit, for example: "Based on *Backend desde cero* by Gianmarco Segura, backenddesdecero.com, CC BY 4.0".
