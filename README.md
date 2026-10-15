# Backend from Scratch

A free backend course for everyone, in Spanish and English: from how the internet works to building, securing and deploying your own backend. No programming knowledge assumed.

In Spanish it is **Backend desde cero**, the site's main language. It lives at [backenddesdecero.com](https://backenddesdecero.com), with the English version under [`/en/`](https://backenddesdecero.com/en/).

## What's in the course

Twelve phases, from 0 to 11, each made of lessons with diagrams and something hands-on: a guided exercise in your terminal, a playground with a real tool, or an interactive lab.

| Phase | Topic | Status |
| --- | --- | --- |
| 0 | How the internet works | Available |
| 1 | Terminal, Linux and SSH | Available |
| 2 | HTTP in depth | Available |
| 3 | Your first server | Available |
| 4 | API design | Available |
| 5 | Databases | Available |
| 6 | Authentication, authorisation and security | Available |
| 7 | Docker and containers | Available |
| 8 | Deployment and infrastructure | Planned |
| 9 | Architecture and scaling | Planned |
| 10 | Quality and observability | Planned |
| 11 | Backend for AI and agents | Planned |

Every available phase is in both languages. The interactive parts include a step-by-step TCP handshake, a DNS lookup, public and private keys with Web Crypto, a CORS lab, PostgreSQL running in your browser and a Docker layer visualiser.

From Phase 3 on, the course builds one project with you: the API of a small online shop, from a bare Node.js server to a Docker Compose stack with PostgreSQL and Redis. It lives in [`projects/`](projects/), once per language ([`tienda-api`](projects/tienda-api/) in Spanish, [`shop-api`](projects/shop-api/) in English), with one folder per project step showing the project as it stands at the end of the lesson that builds it.

It is written by a frontend developer learning backend while building it.

## Running it locally

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

`pnpm check` runs the type checks, `pnpm knip` looks for unused code, `pnpm test` runs the tests and `pnpm test:e2e` checks accessibility with axe-core on every page of the built site (the first time, run `pnpm --filter web exec playwright install chromium`). The build fails on purpose if a link is broken, a glossary term is missing, a text is missing in one language or an SEO rule breaks.

Each step of the guided projects is a standalone npm project, tested with the Node version the lessons use. With Docker:

```sh
docker run --rm -v "$PWD/projects/tienda-api/04-servidor-http":/p -w /p node:26 sh -c 'npm ci && npm run check && npm test'
```

The steps from Phase 5 on also need PostgreSQL 18, and from Phase 7 their Redis tests need a Redis (without one they are skipped). Each project's README ([Spanish](projects/tienda-api/README.md), [English](projects/shop-api/README.md)) says how to set them up, and from step 34 Docker Compose starts everything.

## How it's built

A static site made with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build), with content in MDX, interactive labs in React and TypeScript throughout. Diagrams, social images and an SEO audit are generated at build time, so readers get plain HTML; JavaScript only runs for the editor layout, the search and the labs. It is hosted on [Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/) as static files, deployed on every push to `main`.

```
web/            the site
  src/content/  lessons (Spanish at the root, English in en/), glossary and UI texts
  src/          components, playgrounds and the build's logic
  e2e/          accessibility tests in the browser
projects/       the guided projects, one folder per step: tienda-api/ (Spanish) and shop-api/ (English)
docs/           the style guide for writing lessons
```

GitHub Actions checks every pull request: format, types, unused code, tests, build and accessibility for the site, and every step of the guided projects in Node 26 against PostgreSQL and Redis, including building the Docker image of every step that has a `Dockerfile`.

## License

- **Code** (everything except the course content below, including the tests in `web/src/content/`): [MIT](LICENSE).
- **Course content** (the lessons in `web/src/content/docs/`, the glossary in `web/src/content/glossary/` and the UI texts in `web/src/content/i18n/`): [Creative Commons Attribution 4.0 International](LICENSE-CONTENT) (CC BY 4.0). You may share and adapt it, including commercially, as long as you give credit, for example: "Based on *Backend desde cero* by Gianmarco Segura, backenddesdecero.com, CC BY 4.0".
