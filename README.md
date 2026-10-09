# Backend from Scratch

A free backend course for everyone, in Spanish and English: from how the internet works to building, securing and deploying your own backend. No programming knowledge assumed.

In Spanish it is **Backend desde cero**, the site's main language. It will live at [backenddesdecero.com](https://backenddesdecero.com), with the English version under `/en/`.

## What's in the course

Twelve phases, from 0 to 11, each made of lessons with diagrams and something hands-on: a guided exercise in your terminal, a playground with a real tool, or an interactive lab.

| Phase | Topic | Status |
| --- | --- | --- |
| 0 | How the internet works | Done, in Spanish and English |
| 1 | Terminal, Linux and SSH | In progress |
| 2 | HTTP in depth | Planned |
| 3 | Your first server | Planned |
| 4 | API design | Planned |
| 5 | Databases | Planned |
| 6 | Authentication, authorisation and security | Planned |
| 7 | Docker and containers | Planned |
| 8 | Deployment and infrastructure | Planned |
| 9 | Architecture and scaling | Planned |
| 10 | Quality and observability | Planned |
| 11 | Backend for AI and agents | Planned |

It is written by a frontend developer learning backend while building it.

## Running it locally

You need Node 22 (see `.nvmrc`) and pnpm (the version is pinned in `package.json`).

```sh
pnpm install   # dependencies
pnpm dev       # dev server at http://localhost:4321
pnpm build     # static site in web/dist/
```

`pnpm check` runs the type checks and `pnpm test` the tests. The build fails on purpose if a link is broken, a glossary term is missing, a text is missing in one language or an SEO rule breaks.

## How it's built

A static site made with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build), with content in MDX, interactive labs in React and TypeScript throughout. Diagrams, social images and an SEO audit are generated at build time, so readers get plain HTML; JavaScript only runs for the editor layout, the search and the labs.

```
web/            the site
  src/content/  lessons (Spanish at the root, English in en/), glossary and UI texts
  src/          components, playgrounds and the build's logic
docs/           style guide, design specs and the to-do list
```

## License

- **Code** (everything outside `web/src/content/`): [MIT](LICENSE).
- **Course content** (everything in `web/src/content/`: lessons, glossary and UI texts): [Creative Commons Attribution 4.0 International](LICENSE-CONTENT) (CC BY 4.0). You may share and adapt it, including commercially, as long as you give credit, for example: "Based on *Backend desde cero* by Gianmarco Segura, backenddesdecero.com, CC BY 4.0".
