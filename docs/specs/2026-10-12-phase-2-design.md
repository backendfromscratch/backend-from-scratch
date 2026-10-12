# Design: Phase 2, «HTTP a fondo»

- **Date:** 2026-10-12
- **Status:** approved on 2026-10-12. The author accepted the four proposals in §9: no pilot, the English after they read the Spanish, the CORS lab, and no screenshots of DevTools.
- **Origin:** the roadmap in `CLAUDE.md` (Phase 2). The author asked for this spec once Phase 1 was merged (2026-10-12).
- **Reference specs:** `docs/specs/2026-10-02-site-and-phase-0-design.md` (template, levels of «Pruébalo», languages) and `docs/specs/2026-10-03-phase-1-design.md` (the practice VM and the way Phase 1 was written). Lesson template, quiz, glossary, translation and SEO rules do not change (`docs/style-guide.md`).

## 1. Goal

In Phase 0 the reader saw HTTP as a client: a request goes out, a response comes back. Phase 2 looks at the same conversation **from the side that answers**. By the end of the phase, the reader:

- reads any request or response line by line, in the terminal and in the browser's DevTools;
- knows what each method promises (safe, idempotent) and which status code a server should answer in each case;
- knows the headers that matter, including the security ones, and how a server sets them;
- understands cookies and their attributes, and why `HttpOnly`, `Secure` and `SameSite` exist;
- can explain a CORS error, who raises it and how the server fixes it;
- knows how HTTP caching works (`Cache-Control`, `ETag`, `304`) and what a CDN adds;
- and knows what changes between HTTP/1.1, HTTP/2 and HTTP/3.

Still no programming: the reader is the server by hand (`nc`), configures a real one (nginx in their VM) and reads real responses. Writing the server in code is Phase 3, and every lesson ends by saying what Phase 3 will do with it.

### What Phase 0 already covers (not repeated)

- «Qué es un protocolo»: the anatomy of a message (request line, `Host`, blank line, status line), `200` and `400`, talking HTTP by hand with `nc example.com 80`.
- «De la URL a la página»: the whole trip (DNS → TCP → TLS → HTTP), the `301` from `http://` to `https://`, round trips, and a one-line mention of caching, `keep-alive`, CDNs and HTTP/3 («lo verás en la Fase 2»).
- «TLS y HTTPS» and «TCP vs UDP»: the base for HTTPS and for QUIC.

Phase 2 links to those sections and starts one step further.

## 2. Cross-cutting decisions

### 2.1 Where the reader practices

| Environment | What for | How |
|---|---|---|
| **The terminal: `curl` and `nc`** | Seeing every byte of a request and a response; **being the server by hand**: `nc -l 8080` receives what `curl` sends and the reader types the answer | Already installed on macOS, Linux and WSL; `nc` was taught in Phase 1, lesson 5 |
| **The browser's DevTools** | The "Network" tab (methods, codes, headers, timing, protocol), the "Application"/"Storage" tab (cookies) and the console (a CORS error, live) | Chrome first, with the Firefox names next to them. New for most readers: the introduction teaches how to open it |
| **backenddesdecero.com itself** | A real server we control, so outputs do not change under us: `405` for `POST`, `307` without the final slash, `301` from `http://`, `404`, `immutable` assets with `ETag` and `304`, `br` compression, `alt-svc: h3` | Checked on 2026-10-12 (§5.1). Plus a few practice files under `/practicas/http/` whose headers are set in `_headers` (§5.1) |
| **The VM's nginx** (from Phase 1, lessons 6 and 9) | Being the one who answers: changing a status code, a header, a cookie, the CORS rules or the cache rules, and seeing the effect with `curl` | A practice configuration served by the site (§5.2), installed with `sudo cp`, `nginx -t` and `systemctl reload`, as in Phase 1 |

**Why not httpbin.org or a similar echo service:** it belongs to someone else and can change or go down, like Bandit in Phase 1, and the lessons would depend on it in every exercise. `nc` does the same job locally and shows more.

**Why not an echo endpoint of our own (a Worker):** the site is static by decision (2026-10-09), an open endpoint can be abused, and writing that very server is the first exercise of Phase 3. That is a better place for it.

**A practice thread:** the nginx configuration is the web of Ana and Luis's shop, the one whose Git history the reader explored in Phase 1, lesson 10. Its server answers a product list in JSON, a page that moved, a basket that sets a cookie, an API that the shop's frontend calls from another origin, and images that can be cached. Each lesson changes one piece of it (principle 7 of the style guide: concrete stories).

### 2.2 Tools and their limits (checked on 2026-10-12)

- **curl:** 8.7.1 on macOS and 8.5.0 on Ubuntu 24.04; **neither supports HTTP/3**. So lesson 8 shows HTTP/3 with the `alt-svc` header and the "Protocol" column of DevTools, not with `curl --http3`.
- **nginx:** 1.24.0 on Ubuntu 24.04, the one installed in Phase 1, lesson 6. It sends `ETag` and `Last-Modified` for static files by default.
- **DevTools:** Chrome's names in the text, Firefox's in parentheses when they differ. Safari needs its developer menu turned on: one line in the introduction.

### 2.3 Programming stays optional

- Everything is done with `curl`, `nc`, DevTools and nginx's configuration.
- JavaScript appears in two places only: one line pasted into the DevTools console in the CORS lesson (`fetch(…)`, explained word by word, the way Phase 0, lesson 1 used the browser), and the «Y si programas:» points at the end of "Ya lo has visto".

### 2.4 The reader's safety

- Never paste a real cookie, token or `Authorization` header into a command, a website or a chat; the lessons use invented values and say why.
- The CORS lesson never suggests turning off the browser's security, extensions that remove CORS or `mode: 'no-cors'` as a fix; they appear in "Errores comunes" as what not to do.
- Changes to nginx happen only in the VM, always with `nginx -t` before `reload`, and the lesson shows how to go back to the default configuration.

## 3. Lessons

Eight lessons and the introduction, 10 to 15 minutes each. Titles and slugs come from Google's autocomplete in Spanish and English (2026-10-12): «codigos de estado http», «codigos http mas comunes», «metodos http get post put delete patch», «put y patch diferencias», «metodos http idempotentes», «estructura peticion http», «peticion http ejemplo», «cabeceras http de seguridad», «error cors», «error cors policy», «que es cors en programacion», «cookies httponly secure samesite», «samesite lax vs strict», «cache-control max-age», «etag header», «http2 vs http 3»; in English, "http status codes list", "http methods idempotent", "put vs patch", "cors error fix", "httponly cookie vs localstorage", "http caching etag", "http/2 vs http/3".

| # | Slug (`translationKey`) | Title (sidebar label) | Content | Try it | Environment |
|---|---|---|---|---|---|
| 0 | `index` (`phase-2`) | El protocolo HTTP a fondo, desde el servidor (Introducción) | What changes when you are the one who answers. The four places where you practice. Opening DevTools and reading the "Network" tab. Installing the shop's practice configuration in the VM | Your first look at a request in DevTools, and the shop's server answering in the VM | Browser and VM |
| 1 | `peticion-y-respuesta-http` (`http-messages`) | Petición y respuesta HTTP: estructura con ejemplos (Petición y respuesta) | The parts of a URL and which ones travel (the fragment `#…` never does); request line, headers and body; `Content-Type` and `Content-Length`; a form (`application/x-www-form-urlencoded`) versus JSON; query string versus body; a response, field by field; `curl -v` and `-i` | **Be the server:** `nc -l 8080` in one terminal, `curl -d` in another, read the raw request, and type a response by hand that `curl` accepts | Terminal |
| 2 | `metodos-http` (`http-methods`) | Métodos HTTP: GET, POST, PUT, PATCH y DELETE (Métodos) | What each method promises; safe and idempotent, and why it matters (retries, the browser's "resend form?" warning, crawlers that follow links); `PUT` versus `PATCH`; `HEAD` and `OPTIONS`; `405` and the `Allow` header | `curl -X` against backenddesdecero.com (a static site answers `405`, and without `Allow`, a real deviation from the standard), `curl -I`, and the shop's API in the VM | Terminal and VM |
| 3 | `codigos-de-estado-http` (`status-codes`) | Códigos de estado HTTP: los más comunes y cuándo usarlos (Códigos de estado) | The five families and whose fault each one is; the ones that matter (`200`, `201`, `204`, `301`, `302`, `304`, `307`, `308`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `502`, `503`, `504`); `401` versus `403`; `404` to hide what exists; the `200` with an error inside, an anti-pattern; redirects and `Location` | `curl -I` on real URLs (`301`, `307`, `404`), the status counts of Phase 1's `access.log`, and a `503` with `Retry-After` from the shop's nginx | Terminal and VM |
| 4 | `cabeceras-http` (`http-headers`) | Cabeceras HTTP: las que importan y las de seguridad (Cabeceras) | Request headers (`Host`, `User-Agent`, `Accept`, `Accept-Language`, `Accept-Encoding`, `Authorization`) and response headers (`Content-Type`, `Content-Encoding`, `Location`, `Server`); content negotiation and compression (`br`, `gzip`, `Vary`); `Authorization: Bearer`, a preview of Phase 6; the security headers (`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`); headers are not case-sensitive and `X-` is no longer used | Comparing the headers of real sites; the course's own `_headers` as an example of configuration; adding a security header to the shop's nginx with `add_header` | Terminal and VM |
| 5 | `cookies-httponly-secure-samesite` (`cookies`) | Cookies HTTP: HttpOnly, Secure y SameSite (Cookies) | HTTP has no memory; `Set-Cookie` and `Cookie`; a session identifier; `Expires`/`Max-Age`, `Domain`, `Path`; `HttpOnly` (JavaScript cannot read it), `Secure`, `SameSite` (`Strict`, `Lax`, `None`; Chrome treats a cookie without it as `Lax`); first-party and third-party cookies; cookies versus `localStorage`; sessions versus tokens, left for Phase 6 | `curl -c` and `-b` with the shop's basket cookie; the "Application" tab; `document.cookie` does not see an `HttpOnly` cookie | Terminal, browser and VM |
| 6 | `que-es-cors` (`cors`) | Qué es CORS y cómo solucionar el error (CORS) | Origin (scheme, host and port, from Phase 0); the same-origin policy and why it exists (a page from another origin can make your browser send requests to a site where you are logged in, and some of them carry your cookies: forms, images, a `fetch` with `credentials: 'include'`; `fetch` sends them by default only to its own origin); what CORS controls: **whether the page's JavaScript can read a response from another origin**, not whether the request reaches the server; `Access-Control-Allow-Origin`; a simple request reaches the server even when the browser then hides its response (protecting against that is CSRF, Phase 6), while a failed preflight (`OPTIONS`) stops the real request from being sent; credentials and why `*` is not allowed with them; **the browser enforces it, not the server**, so `curl` never sees a CORS error; the wrong fixes | In the console of `example.com`: `fetch` to a practice file with CORS and to one without (§5.1); `curl -H 'Origin: …'` to see the header; the shop's API answering a preflight in the VM; **the CORS lab** (§4) | Browser, terminal and VM |
| 7 | `cache-http` (`http-caching`) | Caché HTTP: Cache-Control, ETag y el 304 (Caché) | Why cache (from Phase 0's round trips); freshness (`max-age`) and validation (`ETag` with `If-None-Match`, `Last-Modified` with `If-Modified-Since`, `304`); `no-cache` versus `no-store`; `private` and `public`; `immutable` with names that carry a hash (how this very site does it); CDNs (`Age`, `cf-cache-status`); invalidation, the hard part | A real `304` from backenddesdecero.com with `If-None-Match`; the HTML (`max-age=0, must-revalidate`) versus an `/_astro/` file (`immutable`); `ETag` from the shop's nginx; "Disable cache" in DevTools | Terminal, browser and VM |
| 8 | `http2-http3` (`http-versions`) | HTTP/1.1, HTTP/2 y HTTP/3: diferencias (Versiones de HTTP) | HTTP/1.1: text and `keep-alive`; pipelining (sending several requests without waiting) exists in the standard, but the responses must come back in order and browsers never turned it on, so in practice it is one request at a time per connection and browsers open several connections per server; head-of-line blocking; HTTP/2: binary frames, multiplexing, compressed headers, chosen inside TLS (ALPN); HTTP/3: QUIC over UDP (Phase 0, lesson 6), handshake and TLS in one round trip, survives a change of network; how a browser learns about HTTP/3 (`alt-svc`); what changes for the server and what does not (methods, codes and headers are the same) | `curl --http1.1` versus `curl --http2` with `-v` against the course's site; `alt-svc: h3` in the headers; the "Protocol" column in DevTools | Terminal and browser |

The phase's `lessonCount` in `web/src/data/phases.ts` becomes 8, and its status `available` when the first lesson is published.

### Changes from the roadmap in `CLAUDE.md` (proposed with the freedom the author gave)

- **"Anatomy of a request and a response" does not repeat Phase 0:** it starts where Phase 0 stopped (body, `Content-Type`, forms versus JSON, the parts of a URL) and introduces the phase's thread, being the server with `nc`.
- **Redirects** go into the status codes lesson, and **compression and content negotiation** into the headers one: they are not in the roadmap, and every server does them.
- **Security headers** go into the headers lesson because people search for them («cabeceras http de seguridad») and because this very site already deals with them (HSTS is pending in `docs/todo.md`). The full treatment of security stays in Phase 6.
- **Cookies before CORS:** the reason the same-origin policy exists is that the browser can attach your cookies to requests that another site triggers. The order makes that explanation possible.
- **Authorization** is introduced as a header (lesson 4) and explained in Phase 6.

## 4. «Pruébalo» ("Try it") and labs

- **Level 1 (terminal and browser) in every lesson.** Real outputs, as always (style guide, "Terminal exercises").
- **One level 3 lab: CORS, step by step** (lesson 6). `CLAUDE.md` reserves a lab for HTTP. A generic "request simulator" would repeat what `curl` already shows for real; what `curl` cannot show is what happens **inside the browser**: whether it sends a preflight, what the server answers, and whether it lets the page's JavaScript read the response. It is also the phase's most searched pain («error cors»).
  - **Idea:** the reader sets up the page (its origin), the request (method, a custom header, with or without credentials) and the server's CORS rules (allowed origins, methods and headers, credentials). The lab plays the conversation step by step and ends in "the page reads the response" or in the exact console error Chrome would show.
  - **Pattern:** the `tcp-handshake` lab (`docs/specs/2026-10-03-tcp-lab-design.md`): the decision is a pure function that follows the CORS algorithm of the Fetch standard, with tests calculated by hand from the standard; React only draws it. Its own spec before it is built.
- **Level 2, small:** none planned. If while writing lesson 3 a "which status code?" decision helper turns out useful, it is proposed then.

## 5. Practice material to create

### 5.1 On the course's site (`web/public/practicas/http/`)

Static files whose headers are set in `web/public/_headers`, so the lessons have a stable server with known answers:

- `con-cors.json` with `Access-Control-Allow-Origin: *`, and `sin-cors.json` without it: from the console of another origin (`https://example.com`), the first can be read and the second gives the CORS error (lesson 6). It needs no server code: `_headers` already sets headers on `/practicas/` (`X-Robots-Tag`, `Content-Type`).
- Nothing else is needed: what the rest of the lessons show on the site is already there (checked on 2026-10-12: `POST`, `PUT`, `DELETE` and `OPTIONS` answer `405` without `Allow`; `/fase-0` answers `307` to `/fase-0/`; `http://` answers `301`; the HTML is `public, max-age=0, must-revalidate`, compressed with `br` and without `ETag`; the `/_astro/` files are `public, max-age=31536000, immutable`, with `ETag` and `304` for `If-None-Match`; `alt-svc: h3=":443"`).
- **Risk:** Cloudflare can change these details (for example, add `Allow` to the `405`). Outputs carry their date, and a test cannot check production; a note in `docs/todo.md` asks to repeat them before each review of the phase.

### 5.2 The shop's nginx configuration (for the VM)

- `web/public/practicas/tienda-http.conf` (Spanish) and `shop-http.conf` (English), served as text like the Phase 1 scripts, so the reader reads them before installing them. The lessons install them with `curl -O`, `sudo cp … /etc/nginx/sites-available/`, a link in `sites-enabled`, `sudo nginx -t` and `sudo systemctl reload nginx`.
- **What it answers** (on port 8080 of the VM, so the default site on port 80 from Phase 1, lessons 6 and 9, keeps working): `/productos` (a JSON list), `/ofertas` (`301` to `/productos`), `/carrito` (`Set-Cookie` with `HttpOnly`, `SameSite=Lax` and `Max-Age`), `/api/` (CORS for the shop's frontend origin and answers to the preflight), `/img/` (static files with `ETag` and `Cache-Control`) and `/mantenimiento` (`503` with `Retry-After`). Each lesson changes one line, reloads and compares.
- **Checked when it is written:** `nginx -t` and every `curl` of the lessons in Ubuntu 24.04 with nginx 1.24.0 (Docker), the way Phase 1 was checked. A test in CI checks that both files define the same locations, so the languages do not drift apart.
- **Multipass:** the lessons that use the VM inherit Phase 1's pending check on the author's Mac (`docs/todo.md`). The VM part of each exercise says what to do without a VM: read the given output, or skip it.

## 6. Glossary

New terms, in both languages, with `acronym` where it applies (expected; the final list comes out of the lessons): HTTP method, idempotent, request body, MIME type (`Content-Type`), query string, URL, user agent, redirect, cookie, session, origin, same-origin policy, CORS, preflight, ETag, compression, HTTP/2, HTTP/3, QUIC, multiplexing. Existing ones are reused and linked to the lesson that explains them (`header`, `status-code`, `request`, `response`, `cache`, `cdn`, `http`, `https`).

## 7. Changes to the site

Small, and none of them blocks the first lesson:

1. `phases.ts`: Phase 2 `available` with `lessonCount: 8`, when its first lesson is published.
2. `_headers`: the CORS rule for `/practicas/http/con-cors.json` (§5.1); the `.conf` files served as text.
3. `playgrounds.ts`: the CORS lab, when it is built.
4. The pattern "you will see it in Phase 2" in Phase 0 (caching, `keep-alive`, HTTP/3) becomes a link to the lesson that explains it.

## 8. Order of work

1. **The author's review** of this design, and the decisions in §9 (done on 2026-10-12).
2. **Practice material** (§5): the `_headers` files and the shop's nginx configuration, checked in Docker, with their tests.
3. **The lessons in Spanish**, the Phase 1 way: one agent writes each lesson with every command run for real and another, independent one reviews it against the checklist; the agents' shared state (ports, keys) stays inside Docker.
4. **The CORS lab:** its own spec, then the logic with tests and the interface, while the lessons are being written; lesson 6 uses it once it exists.
5. **The author reads the Spanish**, and then **the English translation**, with its outputs run again.

## 9. Decisions and risks

- **Decided: no pilot.** Phase 1 had one because the template was new; now the template, the quiz and the way of writing are approved. The eight lessons are written in Spanish at once, and the author reads them all.
- **Decided: the English after the author reads the Spanish** (Phase 1 was translated the same day), so a correction is made once and not twice.
- **Decided: the CORS lab is built** (§4), with its own spec: it is the one thing in the phase that cannot be seen any other way. Lesson 6 also keeps the real console exercise.
- **Decided: no screenshots of DevTools.** The style guide has no images of interfaces, and DevTools changes often: the lessons give the exact names of tabs and columns, in Chrome and Firefox.
- **The VM is still unverified** on a real Multipass (Phase 1 pending). Four lessons use it; it is worth checking Phase 1 first.
- **Real sites change:** outputs from `example.com` and `github.com` are dated, and the lessons prefer the course's own site, which we control.
- **Size:** if the headers lesson grows past 15 minutes, the security headers become their own short lesson.
