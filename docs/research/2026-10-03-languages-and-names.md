# Languages and project name

- **Date:** 2026-10-03.
- **Availability:** checked that day, and repeated at the end of the report for the names on the shortlist. A domain that is free today may not be tomorrow, and the final confirmation is given by the registrar when buying it.

## 1. The world's most spoken languages

Source: Ethnologue 2025 (via Visual Capitalist and Berlitz). Total speakers (native and non-native), in millions.

| # | Language | Total | Native |
|---|---|---|---|
| 1 | English | 1,528 | 390 |
| 2 | Mandarin Chinese | 1,184 | 990 |
| 3 | Hindi | 609 | 345 |
| 4 | **Spanish** | 558 | 484 |
| 5 | Standard Arabic | 335 | 0 (it is the written language; each local variety is what is spoken) |
| 6 | French | 312 | 74 |
| 7 | Bengali | 284 | 242 |
| 8 | Portuguese | 267 | 250 |
| 9 | Russian | 253 | 145 |
| 10 | Indonesian | 252 | 75 |
| 11 | Urdu | 246 | — |
| 12 | German | 134 | — |
| 13 | Japanese | 126 | — |

### What really matters: where the developers are

For a backend course, what counts is not how many people speak a language, but how many developers prefer it for learning.

- **GitHub Octoverse 2025 (developers by country):**
  1. United States, 28 million;
  2. India, 21.9 million;
  3. China;
  4. Brazil, 6.89 million (it has more than quadrupled since 2020);
  5. United Kingdom;
  6. Japan;
  7. Germany;
  8. Indonesia, 4.37 million;
  9. Russia;
  10. Canada.

  The fastest growing: India, Brazil and Indonesia, followed by Egypt, Nigeria, Kenya and Morocco.
- **Stack Overflow 2025 survey (responses by country):** United States (20.4%), Germany (8.6%), India (7.2%), United Kingdom (5.8%), France (4%), Canada, Ukraine, Poland, Netherlands and Italy. The respondents are mostly people who already consume content in English.

### Analysis: is it worth adding languages?

| Language | Developers | Do they learn in their language? | Cost of translating from Spanish | Value |
|---|---|---|---|---|
| **Portuguese (Brazil)** | 4th country on GitHub and among the fastest growing | Yes: there is a large training market in Portuguese (Alura, Rocketseat) | **Low:** it is very similar to Spanish | **High** |
| Japanese | 6th country | Yes, a lot | High | Medium-high, in the long term |
| Chinese | 3rd country | Yes | High; the ecosystem is fairly separate (GitHub and Google are used less) | Medium, but reaching that audience needs a different distribution |
| French | France and francophone Africa, which is growing | Partly; they usually read in English | Medium | Medium |
| Indonesian | 8th country and growing fast | Partly | Medium | Medium |
| Hindi and Bengali | India is the 2nd country | Little: Indian devs learn in English | Medium | Low |
| German and Russian | 7th and 9th countries | Little: they read in English | Medium | Low |
| Arabic | Egypt and Morocco are growing | Partly | High: right-to-left script (Starlight supports it, but the theme needs checking) | Low for now |

**Recommendation:**

1. **None more for now.** Each language multiplies maintenance:
   - today it is about 25,000 words (the 8 lessons add up to almost 24,000, plus the introduction and the 51 glossary terms);
   - plus the texts of the three labs and of the theme;
   - and every future lesson, for each language.

   With 11 phases ahead, the bottleneck is writing the course, not translating it.
2. **The third, when the course is well along: Brazilian Portuguese.** A large developer audience, little distance from Spanish and less quality competition in backend than in English.
3. **The site is already prepared:** Starlight supports more languages with one line of configuration, and the labs keep their texts in `strings.ts` per language. Adding one is translation work, not architecture work.

## 2. The project name and the domain

### Criteria

Reviewed on 2026-10-03, when the author set as priority no. 1 that the site ranks on Google and is understandable for everyone.

1. **That it matches what people search for.** A domain name with keywords barely weighs in the ranking (Google took away almost all its value in 2012). But the name appears in the title of every result. If it matches the search, it gets more clicks, and whoever links to the site will use those words.
2. **That anyone understands it,** not just a JavaScript dev.
3. **That it works in Spanish and in English,** with a single domain for both languages. That way all the authority (the links the site receives) adds up in one place.
4. **That it is memorable and can be said out loud.**
5. **Available** as `.com` and as a GitHub organisation.
6. **That it holds up for the whole course:** not just networks, but also databases, deployment and AI.

### Availability checked

How it was checked:
- **`.com`, `.dev` and `.app`:** with RDAP, the official registry; a 404 means the domain is not registered.
- **`.io`:** with its registry's whois.
- **`.es`:** nic.es offers no public whois, so we looked at whether the domain exists in the DNS. «libre*» ("free*") means it does not exist; it is a strong sign, but it is confirmed when buying.
- **GitHub:** whether the username or organisation is free.

✓ = free · ✗ = taken · ? = could not be checked · — = not checked.

| Name | .com | .dev | .app | .io | .es | GitHub | Clashes found |
|---|---|---|---|---|---|---|---|
| **awaitbackend** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None |
| **behindthefetch** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None (`beyondthefetch.com` is taken) |
| **detrasdelfetch** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None |
| **backenddesdecero** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | The phrase is generic: several courses use it (La Estación Academy, MoureDev…) |
| **backendfromscratch** | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Very generic phrase in English |
| defrontaback | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None; it sounds odd in English |
| frontaback | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Same |
| delfrontalback | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Long |
| trasdelfetch | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None |
| masalladelfetch | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Long |
| underthefetch | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None |
| awaitserver | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | None |
| escucha443 | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Very niche; `listen443` is taken on GitHub |
| aprendebackend | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Generic |
| cursobackend | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Generic; only useful for search engines |
| backendista | ✓ | — | — | ✓ | ✓* | ✓ | In Czech it is the usual word for "backend dev" (backendisti.cz) |
| backendear | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | It is an invented verb |
| bajoelcapo | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | Spanish only |
| holabackend | ✗ | ✓ | ✓ | ✓ | ✓* | ✓ | The `.com` is taken |
| fetchbackend | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | `FetchBackend` is an Angular class: confusing |
| serversidestory | ✓ | ✓ | ✓ | ✓ | ✓* | ✓ | A backend YouTube channel, "Server Side Story", already exists: **discarded** |

**Taken,** in case you liked any of them:
- `.com`: learnbackend, fronttoback, front2back, awaitresponse, beyondfrontend, puerto443, port443, elbackend, helloserver, ladoservidor and backendcourse;
- in all endings: synack, desdecero and fromscratch;
- with a themed ending: `backend.sh`, `backend.md`, `backend.academy`, `backend.school`, `backend.guide` and `backend.rest`.

### What people search for (Google autocomplete, 2026-10-03)

| You type… | Google suggests… |
|---|---|
| «aprender backend» | **«aprender backend desde cero»** (the first suggestion), «aprender backend gratis» |
| «curso backend» | «curso backend gratis», **«curso backend desde cero»** |
| «backend desde cero» | «aprender backend desde cero» |
| «learn backend» | «learn backend development», **«learn backend from scratch»** |
| «backend from scratch» | «learn backend from scratch», «backend development from scratch» |

Nobody searches for "await backend" or "detrás del fetch". "Backend desde cero", on the other hand, is almost literally the search of someone who wants to take this course.

### Recommendation (revised with SEO as the priority)

**1. «Backend desde cero / Backend from Scratch» at `backenddesdecero.com` — my recommendation**
- It matches the searches «aprender backend desde cero» and «curso backend desde cero». In the Google result it will read, for example, «Qué es el DNS y cómo funciona | Backend desde cero».
- Anyone understands it, without knowing how to code. It is also the title the site already has.
- **A single domain for both languages:** `backenddesdecero.com` in Spanish and `backenddesdecero.com/en/` in English, with «Backend from Scratch» as the title of the English version. Optional: buy `backendfromscratch.com` and redirect it to `/en/`.
- **Free:** `.com`, `.dev`, `.app`, `.io`, `.es` and GitHub (checked twice).
- **Against:** the phrase is used by other courses and videos (MoureDev, La Estación Academy). As a brand it is not very distinctive, and for the search "backend desde cero" you will compete with them. It does not affect what matters, which is ranking each lesson («qué es el DNS», «diferencia entre TCP y UDP»): there the best content wins, not the name.

**2. "await backend" (`awaitbackend.com`), my previous recommendation**
- It is still the most original brand and the easiest to remember for a frontend dev.
- **Against:** nobody searches for it, and whoever does not code in JavaScript does not get the wink. It clashes with both priorities.

**3. «Detrás del fetch / Behind the fetch»**
- Nice, but nobody searches for it either, they are two names and it also requires knowing what `fetch` is.

### Domain: which ending

- **`.com`, as the main one** (about €10-12/year). It is the ending everyone recognises and trusts the most, not just developers.
- **`.dev`, as a defence** (about €12-15/year), redirecting to the `.com`. A curious detail for lesson 7: all `.dev` domains are on browsers' HSTS preload list, so they only work with HTTPS.
- **`.es`, optional** (about €8-10/year).
- `.io` and `.app` add nothing.

### GitHub

- You choose the repository name inside your account. I recommend `backend-desde-cero`.
- If you want an organisation of your own (to separate the project from your personal account or to have collaborators in the future), `backenddesdecero` is free.

### Before deciding

- Search for the chosen name in the EU trademark register (EUIPO, free at euipo.europa.eu): no trademark search has been done here.
- Check whether the accounts are free on the social networks you will use (X, Bluesky, YouTube, LinkedIn).
- When you decide, changing the name on the site takes two files: `web/astro.config.ts` (the title) and the home pages (`es/index.mdx` and `en/index.mdx`).

## Sources

- [Ranked: The World's Most Spoken Languages in 2025 (Visual Capitalist, with Ethnologue data)](https://www.visualcapitalist.com/ranked-the-worlds-most-spoken-languages-in-2025/)
- [25 Most Spoken Languages in the World (Berlitz)](https://www.berlitz.com/blog/most-spoken-languages-world)
- [Octoverse 2025 (GitHub)](https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/)
- [Stack Overflow Developer Survey 2025](https://survey.stackoverflow.co/2025/)
- [CheerpX / WebVM licence](https://cheerpx.io/docs/licensing) (for the Phase 1 design)
- Availability: Verisign RDAP (`.com`) and Google Registry RDAP (`.dev` and `.app`), `whois.nic.io` whois, `.es` DNS and the GitHub API; on 2026-10-03.
