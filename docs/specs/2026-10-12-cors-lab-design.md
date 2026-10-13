# Design: `cors-lab` lab (Phase 2, lesson 6)

- **Date:** 2026-10-12
- **Status:** proposed, waiting for the author's review.
- **Origin:** the Phase 2 spec, §4 (`docs/specs/2026-10-12-phase-2-design.md`): one level 3 lab for the phase, about what `curl` cannot show, what happens **inside the browser** with a request to another origin. The pattern is the `tcp-handshake` lab (`docs/specs/2026-10-03-tcp-lab-design.md`): pure logic with tests calculated by hand from the standard, React that only draws, step by step, accessible and in both languages.

## 1. Intent

After using it, the reader has to be able to explain three things:

1. **CORS does not stop the request; it stops the page from reading the answer.** A simple request reaches the server (and does whatever it does there) even when the page then gets an error.
2. **Some requests are asked about first.** A request that is not "simple" (a `PUT`, a `POST` with JSON, an `Authorization` header) makes the browser send a preflight (`OPTIONS`) first; if the server does not approve it, the real request is never sent.
3. **With cookies, the rules are stricter.** With `credentials: 'include'`, `*` is not enough: the server has to name the origin and say `Access-Control-Allow-Credentials: true`.

Every step comes with a sentence that explains what happened and why, and the outcome always answers three questions in the same place: did the request reach the server? did it carry the cookies? can the page's JavaScript read the response?

## 2. Behaviour

### 2.1 The setting

- **The page** is the shop's frontend, `https://tienda.example` (`https://shop.example` in English), the same origin the shop's nginx allows in the practice configuration.
- **The API** is `https://api.tienda.example/pedidos` (another origin: the host is different). One option sends the request to `https://tienda.example/api/pedidos` instead, the same origin, to see that then CORS does not intervene at all.
- The browser has a cookie for the API (`sesion=…`, `SameSite=None; Secure`), so the only thing that decides whether it travels is the request's `credentials`. `SameSite` itself is lesson 5's subject and is left out here (§7).

### 2.2 What the reader can change

**The request** (what the page's `fetch` asks for):

| Control | Values |
|---|---|
| Method | `GET`, `POST`, `PUT`, `DELETE` |
| Body type (`Content-Type`) | none, `text/plain`, `application/x-www-form-urlencoded`, `application/json` (only with `POST` and `PUT`) |
| `Authorization` header | without, with (an invented token) |
| Credentials | `same-origin` (the default), `include` |
| Destination | the API (another origin), the shop itself (same origin) |

**The server** (what the API answers; the same answers for the preflight and for the real request):

| Control | Values |
|---|---|
| Answers `OPTIONS` | yes (`204`), no (`405`, like a static server: the course's own site does it) |
| `Access-Control-Allow-Origin` | absent, `*`, `https://tienda.example`, `https://otra.example` |
| `Access-Control-Allow-Methods` | any of `GET`, `POST`, `PUT`, `DELETE` (checkboxes) |
| `Access-Control-Allow-Headers` | none, `Content-Type`, `Authorization` (checkboxes) |
| `Access-Control-Allow-Credentials` | absent, `true` |

**Scenarios:** a selector loads ready-made settings, because the free form alone is a lot to take in. The lesson refers to them by name:

1. «El error de siempre»: `GET`, the server sends no CORS header. The request reaches the server; the page cannot read it.
2. «El servidor da permiso»: the same, with `Access-Control-Allow-Origin: https://tienda.example`.
3. «Un POST con JSON»: preflight; the server answers `OPTIONS` with `405`. The real request is never sent.
4. «El preflight aprobado»: the same `POST` with JSON, and the server answers the `OPTIONS` with `204`, `Access-Control-Allow-Origin: https://tienda.example`, `Access-Control-Allow-Methods: GET, POST` and `Access-Control-Allow-Headers: Content-Type`, and the real response with the same `Access-Control-Allow-Origin`. The real request is sent and the page reads the answer. These are the headers the shop's nginx sends in the practice configuration (`location /api/`; its `Access-Control-Max-Age` is left out, §2.4), so the lesson can point from one to the other.
5. «Con cookies y `*`»: `credentials: 'include'` and `Access-Control-Allow-Origin: *`. The request reaches the server with the cookie; the page cannot read the answer.
6. «Mismo origen»: no CORS at all.

### 2.3 The rules (the Fetch standard, simplified)

The decision is a pure function of the request and the server settings. It follows the CORS parts of the Fetch standard (fetch.spec.whatwg.org, "CORS protocol", "CORS check", "CORS-preflight fetch"):

1. **Same origin:** the request is sent with the cookie (`same-origin` and `include` both send it) and the page reads the response. No `Origin` check, no preflight.
2. **Another origin, simple or not:**
   - **Safelisted method:** `GET`, `HEAD` or `POST`.
   - **Safelisted headers:** no `Authorization`, and a `Content-Type` that is `text/plain`, `application/x-www-form-urlencoded` or `multipart/form-data`.
   - Anything else needs a **preflight**.
3. **Preflight:** `OPTIONS` with `Origin`, `Access-Control-Request-Method` and, if there are non-safelisted headers, `Access-Control-Request-Headers` (lowercase, comma-separated). **It never carries cookies.** It fails, and the real request is not sent, if:
   - the status is not `2xx`;
   - the CORS check fails (point 5);
   - the method is not safelisted and is not in `Access-Control-Allow-Methods` (a `*` there counts only without credentials);
   - a non-safelisted header is not in `Access-Control-Allow-Headers` (case-insensitive; a `*` counts only without credentials, and never for `Authorization`).
4. **The real request** carries `Origin`, and the cookie if `credentials` is `include`. **It always reaches the server** (and the server acts on it).
5. **The CORS check** of a response (preflight or real):
   - `Access-Control-Allow-Origin` absent → fail;
   - `*` → passes only if `credentials` is not `include`;
   - an origin → passes only if it is exactly the page's;
   - with `credentials: 'include'`, also `Access-Control-Allow-Credentials: true`, or fail.
6. **Outcome:** if the check passes, the page reads the response; if not, `fetch` rejects with `TypeError: Failed to fetch` and the console shows Chrome's message for that exact failure.

### 2.4 Simplifications, said in the lab or in the lesson

- No preflight cache (`Access-Control-Max-Age`): every non-simple request is asked about.
- No `Access-Control-Expose-Headers`, redirects, `mode: 'no-cors'` (lesson 6 explains why it is not a fix) or private network access.
- The server answers the same CORS headers to every request; a real server can answer each origin differently (`Vary: Origin`, lesson 6).
- Chrome's console messages are Chrome's; Firefox words them differently. The lesson says so.

## 3. Steps and narration

The function returns the whole conversation as a list of steps; the interface reveals them one by one with «Siguiente paso», like the TCP lab. Possible steps, each with a narration key (`{ key, ...data }`, turned into a sentence by `strings.ts`):

| Key | When |
|---|---|
| `page-calls-fetch` | The page's JavaScript calls `fetch` (method, destination, credentials) |
| `same-origin` | The browser sees the same origin: no CORS |
| `simple-request` | Another origin, but a simple request: no preflight |
| `needs-preflight` | Another origin and not simple: why (the method, the `Content-Type` or the header) |
| `preflight-sent` / `preflight-answered` | The `OPTIONS` and the server's answer, with its headers |
| `preflight-fails` | Why it fails; the real request is not sent |
| `request-sent` | The real request, with `Origin` and, if any, the cookie |
| `server-acts` | The server receives it and acts on it («el pedido se ha guardado»): always, before any check |
| `response-answered` | The response and its CORS headers |
| `check-passes` / `check-fails` | The browser's verdict, with the exact rule |
| `page-reads` / `page-gets-error` | The end: what the JavaScript gets (the data, or `TypeError: Failed to fetch` and the console message) |

Example (es, `check-fails`, scenario 1): «La respuesta no trae `Access-Control-Allow-Origin`. El navegador ya la tiene, pero no se la da a la página: el pedido sí llegó al servidor.»

**Console messages:** each failure carries Chrome's real text (in English, as Chrome writes it), captured with Playwright's Chromium from a local server with the same headers when the lab is built, and checked in a test against a fixed list.

## 4. Interface

### 4.1 Layout

- **Panel** in the theme's style, like the TCP lab: header `// laboratorio · CORS` (`// lab · CORS`), the scenario selector, and two collapsible groups of controls, «La petición» and «El servidor».
- **Sequence diagram** with three columns: **la página** (its JavaScript), **el navegador** and **el servidor**. Each step is a row with an arrow (`fetch(…)`, `OPTIONS /pedidos`, `GET /pedidos`, `204`, `200`…) and its headers below, in code font. A step that does not happen (the real request after a failed preflight) is shown as such: «no se envía».
- **The outcome**, always visible at the end and in the same order: «¿Llegó al servidor?», «¿Con la cookie?», «¿Puede leerla la página?», each with yes/no in text and icon, never colour alone; and, on failure, Chrome's console message.
- **Controls:** «Siguiente paso», «Ver todo» and «Reiniciar». Changing a control resets the run.
- **At 375 px:** the three columns become a list of steps with "who → who" on each; no horizontal scroll.

### 4.2 Accessibility

- Controls as native form elements (`fieldset`/`legend`, `select`, checkboxes), all operable with the keyboard.
- The diagram is an ordered list; each row reads in full («3. El navegador → el servidor: OPTIONS /pedidos, con Origin: https://tienda.example y Access-Control-Request-Method: PUT»). Arrows are decorative.
- The narration in an `aria-live="polite"` region; the outcome as a list with text.
- `prefers-reduced-motion`, theme tokens only, contrast checked by `tokens.test.ts`, and the initial state rendered without JavaScript, as in the TCP lab.

## 5. Technical integration

- **Files** in `web/src/playgrounds/cors-lab/`:

  | File | Responsibility |
  |---|---|
  | `cors.ts` | Pure logic: types, the scenarios, `run(request, server) → Step[]` and the outcome. Knows nothing of React or languages |
  | `cors.test.ts` | §6 |
  | `strings.ts` | UI strings and narration templates (`es`, `en`, the English typed from the Spanish) |
  | `chrome-messages.ts` | Chrome's console messages for each failure, with the values filled in |
  | `CorsLab.tsx`, `Sequence.tsx` | The root (`useReducer`: settings and step) and the diagram |
  | `cors-lab.css` | Styles, `cors-lab` prefix, theme tokens only |
  | `CorsLab.dom.test.tsx` | Clicks in happy-dom: a scenario, steps, the outcome, keyboard |

- **In the lesson:** `<CorsLab client:visible lang="es" />` in «Pruébalo», after the real console exercise; an entry in `web/src/data/playgrounds.ts` (`level: 'lab'`, `lesson: 'cors'`).
- **JavaScript budget:** React is already loaded by the other labs; the lab's own code should stay well under the 400 KB per page limit (the heaviest page today is 343 KB, with the TCP lab).

## 6. Tests and verification

| What | How |
|---|---|
| Same origin | No preflight, cookie sent with both credentials values, readable |
| Simple requests | `GET` and `POST` with `text/plain` or a form: no preflight; readable only with the right `Access-Control-Allow-Origin` |
| Preflight triggers | `PUT`, `DELETE`, `POST` with JSON, `Authorization`: each one, alone, triggers a preflight, with the right `Access-Control-Request-*` headers |
| Preflight failures | Non-2xx status (the `405`), CORS check, method not allowed, header not allowed: the real request is not sent |
| Credentials | `*` with `include` fails; the exact origin without `Access-Control-Allow-Credentials: true` fails; with both, passes; the preflight never carries the cookie |
| `server-acts` | In every run where the real request is sent, the server acts, whatever the check says |
| Scenarios | The six scenarios give the outcomes of §2.2 |
| Messages | Each failure has its Chrome message; the list matches what Chromium printed when the lab was built |
| Texts and rendering | Every narration key exists in `es` and `en` and fills all its data; `react-dom/server` renders both languages |
| Browser | Keyboard and focus, light and dark, 375 and 1280 px, reduced motion; the axe tests of `states.e2e.ts` with a failed and a successful scenario |

## 7. Out of scope

- `SameSite` and third-party cookie blocking (lesson 5), CSRF protection (Phase 6).
- Preflight cache, exposed headers, redirects, `no-cors`, private network access.
- Different answers per origin, and servers that answer the preflight and the real request differently.
- Firefox's and Safari's console messages.
