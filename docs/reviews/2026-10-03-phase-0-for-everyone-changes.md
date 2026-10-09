# Phase 0 changes for «everyone»

Generated from the edits applied to Phase 0 on 2026-10-03 (their plan and edit files were deleted once applied; they are in the first commit, `3bcdc57`). Only the Spanish is shown here; each change has its equivalent in the English version. This file only exists for the author's review: delete it once read.

Criteria: no lesson assumes any programming knowledge; programming terms are explained in a few words the first time or move to «Y si programas:» («If you code:»); «Ya lo has visto» («You have already seen it») starts with what anyone sees and ends, if needed, with «Y si programas:».

## Lesson 1 · Client-server model

`web/src/content/docs/fase-0/modelo-cliente-servidor.mdx` (7 changes)

### 1.1 First appearance of backend, frontend and API: they are defined in a few words, because the SelfCheck and Common mistakes use them later.

Before:

````md
Tu backend atiende las peticiones de tu frontend y, para responderlas, les pide datos a una base de datos o a la API de Stripe.
````

After:

````md
El *backend* de una web (su parte de servidor) atiende las peticiones de su *frontend* (lo que ves en el navegador) y, para responderlas, pide datos a una base de datos o a la API de Stripe (el servicio con el que muchas webs cobran con tarjeta).
````

### 1.2 Vite is dev jargon; the same fact (Vite on 5173) is already in the «Si programas» aside of «Ya lo has visto».

Before:

````md
 El servidor de desarrollo de Vite escucha en el 5173.
````

After:

````md
(deleted)
````

### 1.3 The section starts with experiences anyone has (browser, phone apps, home router); the dev items (fetch, DevTools, Vite) go behind «Si programas».

Before:

````md
Llevas años trabajando con este modelo, solo que desde el otro lado:
````

After:

````md
Llevas años usando este modelo desde el lado del cliente:

- Cuando abres una web o actualizas una app, tu navegador o la app son el cliente. Si la pestaña se queda cargando, espera la respuesta.
- Hasta el router de casa hace de servidor: escribe `192.168.1.1` en el navegador y suele responderte con su página de configuración.

Y si programas:
````

### 1.4 «Framework» assumes the reader codes; the idea (nothing special is needed) stays, using the exercise's own example.

Before:

````md
No hace falta una máquina especial ni un framework.
````

After:

````md
No hace falta una máquina especial ni un programa complicado.
````

### 1.5 «Tu backend» assumed the reader has one.

Before:

````md
Tu backend es servidor para tu frontend, pero también es cliente
````

After:

````md
El backend de una web es servidor para su frontend, pero también es cliente
````

### 1.6 Same, in the self-check.

Before:

````md
question="Tu backend recibe una petición de tu frontend y, para responderla, llama a la API de Stripe. ¿Tu backend es cliente o servidor?"
````

After:

````md
question="El backend de una tienda online recibe una petición de su frontend y, para responderla, llama a la API de Stripe. ¿Ese backend es cliente o servidor?"
````

### 1.7 Same, in the answer.

Before:

````md
Es servidor para tu frontend, porque espera sus peticiones
````

After:

````md
Es servidor para su frontend, porque espera sus peticiones
````

## Lesson 2 · What is a protocol

`web/src/content/docs/fase-0/que-es-un-protocolo.mdx` (11 changes)

### 2.1 «RFC» appears here before it is defined (it is defined further down with <Term id="rfc">); it is said in plain words.

Before:

````md
Es porque el RFC permite a quien recibe aceptar también un `\n` suelto.
````

After:

````md
Es porque las reglas de HTTP permiten a quien recibe aceptar también un `\n` suelto.
````

### 2.2 Someone who does not code does not know what Go, Node or C are; «programado» (programmed) makes clear they are ways of programming, without removing them.

Before:

````md
esté escrito en Go, en Node o en C
````

After:

````md
esté programado en Go, en Node o en C
````

### 2.3 First appearance of «API» in the lesson (it appears later in the REST mistake); short definition.

Before:

````md
pedir y servir páginas y APIs.
````

After:

````md
pedir y servir páginas y APIs (servicios para programas, no para personas).
````

### 2.4 First time the prose mentions HTML; it is explained.

Before:

````md
Hemos recortado el HTML, y tus fechas
````

After:

````md
Hemos recortado el HTML (el código de la página), y tus fechas
````

### 2.5 The comparison with CSS only helps people who build websites; «base 16» is understandable by anyone.

Before:

````md
en hexadecimal, como en los colores de CSS:
````

After:

````md
en hexadecimal (en base 16, no en base 10):
````

### 2.6 The idea is understood without `fetch`; the `response.ok` detail moves to an «Si programas» aside.

Before:

````md
pero un programa que use `fetch` sabría por el `404` que lo que pidió no existe: `response.ok` sería `false` y `response.status`, `404`.
````

After:

````md
pero una app sabría por el `404` que lo que pidió no existe (si programas: con `fetch`, `response.ok` sería `false` y `response.status`, `404`).
````

### 2.7 «Ya lo has visto» starts with what anyone sees (error pages, the start of the URL, which goes up from the end); the dev items go behind «Si programas». In the scheme, the mention of Git becomes conditional.

Before:

````md
- **`fetch` escribe estos mensajes por ti.**
````

After:

````md
- **Las páginas de «Error 404» que ves al navegar** muestran el código de estado del ejercicio 3; un «Error 500» dice que ha fallado el propio servidor.
- **El principio de una URL, el *esquema*, suele decir qué protocolo se habla:** `http://`, `https://`, `ws://` (WebSockets) o `ssh://`, que, si programas, quizá has visto en URLs de Git. También fija el puerto por defecto: 80 para `http://`, como en el ejercicio, y 443 para `https://`. No todos los esquemas son protocolos de red: `mailto:` o `data:` no lo son.

Y si programas:

- **`fetch` escribe estos mensajes por ti.**
````

### 2.8 Removed here because the scheme item has moved up (previous edit).

Before:

````md
- **El principio de una URL, el *esquema*, suele decir qué protocolo se habla:** `http://`, `https://`, `ws://` (WebSockets) o `ssh://`, que quizá has visto en URLs de Git. También fija el puerto por defecto: 80 para `http://`, como en el ejercicio, y 443 para `https://`. No todos los esquemas son protocolos de red: `mailto:` o `data:` no lo son.
````

After:

````md
(deleted)
````

### 2.9 «Objeto» (object) is programming jargon; an example shows what JSON is without assuming it is known.

Before:

````md
una forma de escribir un objeto como texto.
````

After:

````md
una forma de escribir información como texto, por ejemplo `{"nombre": "Ana"}`.
````

### 2.10 Library, Node, fetch and axios are dev terms: the mistake is posed for everyone (with `curl`, which the reader already knows) and the code part moves to «Si programas».

Before:

````md
**«Un protocolo es una librería o un programa.»** Un protocolo es un acuerdo escrito. Programas como Chrome, Node o nginx lo implementan, y `fetch` o axios son la forma de usar esa implementación desde tu código.
````

After:

````md
**«Un protocolo es un programa.»** Un protocolo es un acuerdo escrito. Programas como Chrome, `curl` o nginx lo implementan. Si programas, tampoco es una librería: `fetch` o axios son la forma de usar esa implementación desde tu código.
````

### 2.11 Same change as in Common mistakes: no «objeto».

Before:

````md
dice cómo escribir un objeto como texto.
````

After:

````md
dice cómo escribir información como texto.
````

## Lesson 3 · The TCP/IP model

`web/src/content/docs/fase-0/modelo-tcp-ip.mdx` (8 changes)

### 3.1 «Tu programa» (your program) assumed the reader codes; the browser is a program everyone uses.

Before:

````md
casi todo lo hace tu sistema operativo sin que tu programa se entere.
````

After:

````md
casi todo lo hace tu sistema operativo sin que el navegador se entere.
````

### 3.2 «Tu programa» and «librería» (library) assumed the reader can code: examples everyone knows, and library explained in two words.

Before:

````md
Tu programa, o la librería que usa
````

After:

````md
El programa (el navegador, `curl`…) o una librería (código ya hecho)
````

### 3.3 Same message with the browser instead of `fetch`; `fetch` moves to the «Si programas» aside of «Ya lo has visto».

Before:

````md
Cuando haces `fetch`, tu código solo toca la capa de aplicación.
````

After:

````md
Cuando el navegador pide una página, solo toca la capa de aplicación.
````

### 3.4 Impersonal: it does not assume the reader codes.

Before:

````md
Por eso puedes programar una web entera sin saber nada de esto.
````

After:

````md
Por eso se puede programar una web entera sin saber nada de esto.
````

### 3.5 Not everyone saw the pseudo-headers in DevTools in lesson 1; they are explained with the request from exercise 1.

Before:

````md
`:method` o `:path` que viste en DevTools en la lección 1.
````

After:

````md
`:method` o `:path`, que hacen el papel de la primera línea de HTTP/1.1 (`GET /`).
````

### 3.6 «Ya lo has visto» starts with everyday things: the Chrome errors move up here (with the dinosaur page) and DevTools goes behind, as optional and saying how to open it. The Timing table does not change.

Before:

````md
**La pestaña *Timing* de DevTools** (en *Network*, haz clic en una petición y abre *Timing*) desglosa cada petición en fases, y cada fase es una capa o un protocolo de los que acabas de ver:
````

After:

````md
**Cuando una web no carga, los errores de Chrome se pueden leer por capas:**

- `ERR_INTERNET_DISCONNECTED` (la página del dinosaurio): tu sistema operativo dice que no hay ninguna conexión de red activa. Normalmente falla la capa de enlace (el wifi apagado o el cable suelto). Si el wifi funciona pero tu router no tiene salida a internet, verás otros errores.
- `ERR_NAME_NOT_RESOLVED`: DNS no ha encontrado la dirección del nombre (capa de aplicación).
- `ERR_CONNECTION_REFUSED`: el ordenador de destino responde, pero nadie escucha en ese puerto. Es la capa de transporte. Es lo que viste con `curl` en la lección 1.
- **Un `404`:** todas las capas han funcionado y el servidor te ha respondido, en HTTP, que eso no existe.

**Si quieres verlo por dentro, abre DevTools**, las herramientas para desarrolladores de Chrome: <kbd>F12</kbd>, o <kbd>Cmd</kbd> + <kbd>Opción</kbd> + <kbd>I</kbd> en Mac. En *Network*, recarga la página, haz clic en una petición y abre *Timing*. Verás la petición desglosada en fases, y cada fase es una capa o un protocolo de los que acabas de ver:
````

### 3.7 The error list has moved up; in its place stays the optional aside for people who code (localhost:3000 and `fetch`).

Before:

````md
**Los errores de Chrome también se pueden leer por capas:**

- `ERR_INTERNET_DISCONNECTED`: tu sistema operativo dice que no hay ninguna conexión de red activa. Normalmente falla la capa de enlace (el wifi apagado o el cable suelto). Si el wifi funciona pero tu router no tiene salida a internet, verás otros errores.
- `ERR_NAME_NOT_RESOLVED`: DNS no ha encontrado la dirección del nombre (capa de aplicación).
- `ERR_CONNECTION_REFUSED`: el ordenador de destino responde, pero nadie escucha en ese puerto. Es la capa de transporte. Es lo que viste con `curl` en la lección 1, y lo que ves en la consola cuando tu frontend llama a `localhost:3000` y el backend no está arrancado.
- **Un `404`:** todas las capas han funcionado y el servidor te ha respondido, en HTTP, que eso no existe.
````

After:

````md
Y si programas:

- `ERR_CONNECTION_REFUSED` es también lo que ves en la consola cuando tu frontend llama a `localhost:3000` y el backend no está arrancado. Y un `fetch` en tu código solo toca la capa de aplicación.
````

### 3.8 Same as in the table: a program everyone knows, not «tu programa».

Before:

````md
Tu programa solo toca la capa de aplicación.
````

After:

````md
Un programa como el navegador solo toca la capa de aplicación.
````

## Lesson 4 · IP, ports and sockets

`web/src/content/docs/fase-0/ip-puertos-y-sockets.mdx` (8 changes)

### 4.1 «Los de desarrollo» (the development ones) assumed the reader knows what a development server is; shorter sentence to compensate.

Before:

````md
5432 (PostgreSQL), 3306 (MySQL). Los de desarrollo, como 3000, 5173 u 8080, también están aquí, por costumbre
````

After:

````md
5432 (PostgreSQL), 3306 (MySQL). Por costumbre, también los de las herramientas para crear webs: 3000, 5173, 8080
````

### 4.2 The example moves from the development server to the `localhost:8080` everyone opened in lesson 1; the `new URL` part moves to the «Si programas» aside.

Before:

````md
y por eso tu servidor de desarrollo te obliga a escribir `:5173`. En JavaScript, `new URL('https://example.com:443').port` es una cadena vacía: el puerto por defecto ni se apunta.
````

After:

````md
y por eso en la lección 1 escribiste `:8080`.
````

### 4.3 Node code: it moves, losing nothing, to the «Si programas» aside of «Ya lo has visto».

Before:

````md
En Node, `http.createServer(…).listen(3000)` da esos tres pasos (pedir el socket, *bind* y *listen*) en una línea, y cada `fetch` usa un socket de cliente.
````

After:

````md
(deleted)
````

### 4.4 Vite was not explained (someone who does not code will not have it open); «por IPv4 y IPv6» compensates for the words.

Before:

````md
`[::1]:5173` (un servidor de Vite) solo aceptan conexiones de tu ordenador, por IPv4 y por IPv6.
````

After:

````md
`[::1]:5173` (Vite, para crear webs) solo aceptan conexiones de tu ordenador, por IPv4 y IPv6.
````

### 4.5 Starts with two everyday experiences (the router page, opening ports to play) and the programming material goes behind «Si programas». To stay within the word count: the two Vite points are merged into one (losing no idea), the Node line joins EADDRINUSE and `new URL` becomes the last point.

Before:

````md
- **`Network: use --host to expose` en Vite.** Por defecto, Vite solo escucha en localhost. Con `--host` escucha en todas las direcciones y te enseña `Network: http://192.168.1.133:5173/`, con tu IP privada.
- **`EADDRINUSE`.** `Error: listen EADDRINUSE: address already in use :::3000` significa que ya hay un socket escuchando en ese puerto, a menudo un servidor que dejaste abierto. `:::3000` es `::` (Node escucha por defecto en todas las direcciones) y `:3000`. Para ver quién lo ocupa: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
- **«Con localhost funciona y con 127.0.0.1 no».** En macOS, Vite escucha por defecto solo en `[::1]`, como viste en el ejercicio 2. `http://localhost:5173` funciona, porque se prueba `::1`, pero `http://127.0.0.1:5173` da «Connection refused». Es la lección 1 al revés.
````

After:

````md
- **La página del router** está en su IP privada, a menudo `192.168.1.1`: tu puerta de enlace.
- **«Abrir puertos» para jugar online**, como piden algunas consolas, es añadir esa entrada fija al router.

Y si programas:

- **`Network: use --host to expose` en Vite.** Por defecto, Vite solo escucha en localhost; en macOS, solo en `[::1]` (ejercicio 2): `http://localhost:5173` funciona (se prueba `::1`), pero `http://127.0.0.1:5173` da «Connection refused», la lección 1 al revés. Con `--host` escucha en todas las direcciones y te enseña tu IP privada: `Network: http://192.168.1.133:5173/`.
- **En Node**, `http.createServer(…).listen(3000)` pide el socket, hace *bind* y *listen*; cada `fetch` usa un socket de cliente. `Error: listen EADDRINUSE: address already in use :::3000`: ya hay un socket escuchando en ese puerto, a menudo un servidor que dejaste abierto. `:::3000` es `::` (Node escucha por defecto en todas las direcciones) y `:3000`. Para ver quién lo ocupa: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
- **`new URL('https://example.com:443').port`** es una cadena vacía: el puerto por defecto ni se apunta.
````

### 4.6 The question assumed Vite was known; nc is what the reader has already used.

Before:

````md
question="Arrancas vite --host en tu portátil. ¿Puede abrirlo tu móvil conectado a tu wifi? ¿Y un amigo desde su casa?"
````

After:

````md
question="Dejas nc -l 8080 escuchando en tu portátil. ¿Puede conectarse tu móvil, que está en tu wifi? ¿Y un amigo desde su casa?"
````

### 4.7 Same port as the question.

Before:

````md
puede llegar a tu IP privada, `http://192.168.1.133:5173`.
````

After:

````md
puede llegar a tu IP privada, `http://192.168.1.133:8080`.
````

### 4.8 No development jargon.

Before:

````md
y para un servidor de desarrollo no es buena idea.
````

After:

````md
y para un servidor de pruebas no es buena idea.
````

## Lesson 5 · TCP vs UDP

`web/src/content/docs/fase-0/tcp-vs-udp.mdx` (8 changes)

### 5.1 Explains in a few words what HTML and JavaScript are, which were not defined.

Before:

````md
el HTML llega entero y en orden. Si faltara un solo byte de un fichero JavaScript, la página se rompería.
````

After:

````md
el HTML (el fichero que describe la página) llega entero y en orden. Si faltara un solo byte de un fichero JavaScript (el código que hace funcionar la web), la página se rompería.
````

### 5.2 «Tu programa» (your program) assumes the reader codes.

Before:

````md
no sabe dónde empieza ni dónde acaba cada mensaje de tu programa.
````

After:

````md
no sabe dónde empieza ni dónde acaba cada mensaje del programa que lo usa.
````

### 5.3 «Tu programa» (your program) assumes the reader codes.

Before:

````md
Para TCP, lo que envía tu programa es un chorro de bytes sin cortes.
````

After:

````md
Para TCP, lo que envía un programa es un chorro de bytes sin cortes.
````

### 5.4 First appearance of «API»: it is explained; «datos en JSON» (JSON data) is understood without knowing what JSON is.

Before:

````md
| Webs y APIs con HTTP/1.1 o HTTP/2 | TCP | Cada byte del HTML o del JSON cuenta |
````

After:

````md
| Webs y APIs (los servicios que dan datos a las apps) con HTTP/1.1 o HTTP/2 | TCP | Cada byte del HTML o de los datos en JSON cuenta |
````

### 5.5 `fetch` is only known by people who code; the idea is the same with «petición» (request), which is already explained.

Before:

````md
- **«Cada `fetch` hace un handshake.»**
````

After:

````md
- **«Cada petición hace su propio handshake.»**
````

### 5.6 «Ya lo has visto» starts with everyday things (a video call, the error page) and leaves DevTools for the end, as optional.

Before:

````md
- **_Initial connection_, en la pestaña _Timing_ de DevTools,**
````

After:

````md
- **Una videollamada que se pixela un instante, en vez de congelarse,** va por UDP: no espera a lo que se pierde.
- **`ERR_CONNECTION_REFUSED` y `ERR_CONNECTION_TIMED_OUT`,** en la página de error del navegador, son el segundo y el tercer caso del ejercicio 3. `REFUSED` llega enseguida, porque alguien respondió con un rechazo. `TIMED_OUT` tarda, porque nadie respondió.

Y si programas, en DevTools:

- **_Initial connection_, en la pestaña _Timing_,**
````

### 5.7 «De DevTools» (of DevTools) is already said by the sentence that introduces the optional block.

Before:

````md
- **`h3` en la columna _Protocol_ de DevTools**
````

After:

````md
- **`h3` en la columna _Protocol_**
````

### 5.8 This point moves to the start of the section (see the previous edit); it is removed here to avoid duplicating it.

Before:

````md
- **`ERR_CONNECTION_REFUSED` y `ERR_CONNECTION_TIMED_OUT`** son el segundo y el tercer caso del ejercicio 3. `REFUSED` llega enseguida, porque alguien respondió con un rechazo. `TIMED_OUT` tarda, porque nadie respondió.
````

After:

````md
(deleted)
````

## Lesson 6 · DNS

`web/src/content/docs/fase-0/que-es-dns.mdx` (4 changes)

### 6.1 Precision: the browser does use UDP (HTTP/3, lesson 5); what it cannot do is a web page.

Before:

````md
porque un navegador no puede enviar UDP, pero sí peticiones HTTPS.
````

After:

````md
porque una página web no puede enviar UDP, pero sí peticiones HTTPS.
````

### 6.2 Everyday example (wifi) instead of DevTools, which moves to the end of the section as optional.

Before:

````md
- **_DNS Lookup_ en la pestaña _Timing_** de DevTools es esta consulta. En la primera petición a un dominio verás unos milisegundos; en las siguientes, 0 o ni aparece, porque la respuesta está en caché o la conexión se reutiliza.
````

After:

````md
- **El campo «DNS» de los ajustes del wifi** (en el móvil o el ordenador) es la dirección de tu resolver. Muchas veces es tu router, que reenvía las consultas al de tu operador.
````

### 6.3 Adds a service used by people who do not code (Wix) next to the developer ones.

Before:

````md
Cuando conectas un dominio a Vercel, Netlify o GitHub Pages,
````

After:

````md
Cuando conectas un dominio a un servicio como Wix, Vercel, Netlify o GitHub Pages,
````

### 6.4 `ping` was not explained and does not stop on its own; DevTools goes at the end, as an extra for people who code.

Before:

````md
Para comprobarlo, usa `ping miapp.test`.
````

After:

````md
Para comprobarlo, usa `ping miapp.test`: su primera línea dice a qué IP va. Páralo con <kbd>Ctrl</kbd> + <kbd>C</kbd>.

Y si programas, en DevTools:

- **_DNS Lookup_ en la pestaña _Timing_** es esta consulta. En la primera petición a un dominio verás unos milisegundos; en las siguientes, 0 o ni aparece, porque la respuesta está en caché o la conexión se reutiliza.
````

## Lesson 7 · TLS and HTTPS

`web/src/content/docs/fase-0/tls-y-https.mdx` (5 changes)

### 7.1 «Script» is assumed to be known: short gloss the first time.

Before:

````md
por ejemplo para meter un script en la página que descargas.
````

After:

````md
por ejemplo para meter un script (código que tu navegador ejecuta) en la página que descargas.
````

### 7.2 DevTools was used without saying what it is; it is explained and the reader is pointed to lesson 8, where they are opened.

Before:

````md
Por eso, en DevTools, *Initial connection* incluye la parte *SSL* (el nombre antiguo de TLS).
````

After:

````md
Por eso, en DevTools (herramientas del navegador que abrirás en la lección siguiente), *Initial connection* incluye la parte *SSL* (el nombre antiguo de TLS).
````

### 7.3 «API» unexplained: the Web Crypto API is described in plain words.

Before:

````md
es criptografía de verdad, con la Web Crypto API de tu navegador.
````

After:

````md
es criptografía de verdad, la que trae tu navegador (la Web Crypto API).
````

### 7.4 «Ya lo has visto»: everyday things first (Chrome warning, date, hotel wifi, new); then, optional, what concerns people who code (mixed content and crypto.subtle).

Before:

````md
- **«No es seguro»** a la izquierda de la URL en una web `http://`: no hay TLS, así que todo viaja como una postal.
- **`NET::ERR_CERT_DATE_INVALID`, `NET::ERR_CERT_COMMON_NAME_INVALID` y `NET::ERR_CERT_AUTHORITY_INVALID`** son, en Chrome, los tres casos del ejercicio 3: caducado, nombre equivocado y firmado por alguien en quien no confía.
- **Si la fecha de tu ordenador está mal,** verás `ERR_CERT_DATE_INVALID` en todas las webs: para el navegador, todos los certificados están fuera de fecha.
- **`crypto.subtle` es `undefined`.** Si abres tu servidor de desarrollo desde el móvil con `http://192.168.1.133:5173`, la Web Crypto API (y otras como `crypto.randomUUID` o el acceso al portapapeles) desaparecen: el navegador solo las da en contextos seguros, con HTTPS o en `localhost`. Es el aviso que verías en el playground.
- **Contenido mixto (*mixed content*):** una página HTTPS que carga un script por `http://`. El navegador lo bloquea, porque ese script sí viajaría como una postal y alguien podría cambiarlo.
````

After:

````md
- **«No es seguro»** a la izquierda de la URL en una web `http://`: no hay TLS, así que todo viaja como una postal.
- **El aviso «La conexión no es privada»** de Chrome lleva debajo un código: `NET::ERR_CERT_DATE_INVALID`, `NET::ERR_CERT_COMMON_NAME_INVALID` o `NET::ERR_CERT_AUTHORITY_INVALID`. Son los tres casos del ejercicio 3: caducado, nombre equivocado y firmado por alguien en quien no confía.
- **Si la fecha de tu ordenador está mal,** verás `ERR_CERT_DATE_INVALID` en todas las webs: para el navegador, todos los certificados están fuera de fecha.
- **La wifi de un hotel** puede darte errores de certificado hasta que aceptas sus condiciones: se hace pasar por la web que pides, y TLS lo descubre.

Y si programas:

- **Contenido mixto (*mixed content*):** una página HTTPS que carga un script por `http://`. El navegador lo bloquea, porque ese script sí viajaría como una postal y alguien podría cambiarlo.
- **`crypto.subtle` es `undefined`.** Si abres tu servidor de desarrollo desde el móvil con `http://192.168.1.133:5173`, la Web Crypto API (y otras como `crypto.randomUUID` o el acceso al portapapeles) desaparecen: el navegador solo las da en contextos seguros, con HTTPS o en `localhost`. Es el aviso que verías en el playground.
````

### 7.5 «API» and «tus proyectos» (your projects) assumed the reader codes.

Before:

````md
la API que usa el playground, por si quieres usarla en tus proyectos.
````

After:

````md
la criptografía que usa el playground, por si programas y quieres usarla en tus proyectos.
````

## Lesson 8 · From the URL to the page

`web/src/content/docs/fase-0/que-pasa-cuando-escribes-una-url.mdx` (6 changes)

### 8.1 HTML, styles and scripts were assumed to be known: short gloss the first time.

Before:

````md
El HTML le dice qué más necesita (estilos, scripts, imágenes), y lo pide a la vez
````

After:

````md
El HTML, la página en sí, le dice qué más necesita (estilos, scripts con código, imágenes), y lo pide a la vez
````

### 8.2 «Los CSS» (the CSS) was assumed to be known: it says they are the styles.

Before:

````md
Lee el HTML, encuentra los CSS, los scripts y las imágenes y los pide.
````

After:

````md
Lee el HTML, encuentra los estilos (CSS), los scripts y las imágenes y los pide.
````

### 8.3 «Ya la conoces» (you already know it) assumed the reader is a frontend dev.

Before:

````md
Esta parte ya la conoces.
````

After:

````md
Esta parte ya no es backend: la tienes en «Para profundizar».
````

### 8.4 First time DevTools is used: what it is, how to open it and which row to click.

Before:

````md
abre DevTools, ve a *Network* y entra en `https://example.com`. Haz clic en la petición del documento y abre la pestaña *Timing*.
````

After:

````md
abre DevTools, las herramientas para desarrolladores (<kbd>F12</kbd>, o clic derecho › *Inspeccionar*), ve a la pestaña *Network* y entra en `https://example.com`. Haz clic en la petición del documento (la primera, `example.com`) y abre la pestaña *Timing*.
````

### 8.5 «Ya lo has visto»: everyday things first (distant site slow, first page slower, new); then, optional, preconnect and Lighthouse.

Before:

````md
- **`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`** le dice al navegador que haga DNS, TCP y TLS con ese servidor cuanto antes, sin esperar a descubrir que lo necesita. `dns-prefetch` hace solo el DNS. Ahora sabes qué viajes se ahorran. (El `crossorigin` hace falta porque las fuentes se piden en modo CORS, que verás en la Fase 2.)
- **«Document request latency»** en Lighthouse (antes, «Reduce initial server response time»), o el TTFB en las métricas de rendimiento, depende mucho del paso 6: lo que tarda tu servidor. Desde la Fase 3 será cosa tuya.
- **Una web «rápida en tu ordenador» y lenta para usuarios de otro continente:** casi siempre es la latencia. Por eso las webs grandes usan CDN.
````

After:

````md
- **Una web de otro continente que tarda en empezar a cargar,** aunque tu conexión sea rápida: casi siempre es la latencia. Por eso las webs grandes usan CDN.
- **La primera página de una web tarda más que las siguientes:** después, la conexión sigue abierta y la IP está en caché.

Y si programas:

- **`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`** le dice al navegador que haga DNS, TCP y TLS con ese servidor cuanto antes, sin esperar a descubrir que lo necesita. `dns-prefetch` hace solo el DNS. Ahora sabes qué viajes se ahorran. (El `crossorigin` hace falta porque las fuentes se piden en modo CORS, que verás en la Fase 2.)
- **«Document request latency»** en Lighthouse (antes, «Reduce initial server response time»), o el TTFB en las métricas de rendimiento, depende mucho del paso 6: lo que tarda tu servidor. Desde la Fase 3 será cosa tuya.
````

### 8.6 «Tu API» (your API) assumed the reader codes.

Before:

````md
question="Tu API está en un servidor de Estados Unidos,
````

After:

````md
question="Una web está en un servidor de Estados Unidos,
````

## Fixes after the final review

Applied after Tasks 4 to 7 (also in English):

- **DevTools, for everyone from lesson 3:** in lessons 5 and 6, «Y si programas, en DevTools:» becomes «En DevTools (lección 3):». In lesson 7, «herramientas del navegador que abrirás en la lección siguiente» becomes «las herramientas de Chrome que abriste en la lección 3». In lesson 8, «abre DevTools, las herramientas para desarrolladores (F12…)» becomes «abre DevTools en Chrome (lección 3: F12…)».
- **Lesson 1, what an API is:** «…o a la API de Stripe, el servicio con el que muchas webs cobran con tarjeta. Una API es eso: un servicio pensado para que lo usen otros programas, no personas.»
- **Lesson 1, common mistake and self-check:** «tu backend» and «tu frontend» become «el backend de una web» or «de una tienda online» and «su frontend».
- **Lesson 3, technical precision:** «el navegador solo toca la capa de aplicación» becomes «trabaja casi solo en la capa de aplicación». With HTTP/3 the browser does QUIC itself (lesson 5).

## Minor fixes made later

Applied at the author's request after the final review (also in English):

- **Lesson 4:**
  - in the `nc -l 8080` self-check, «Y por IPv6, aunque tu portátil tenga dirección pública…» becomes «Por IPv6 tampoco: en macOS, `nc` solo escucha en IPv4 y, aunque escuchara, el router suele bloquear las conexiones que nadie ha pedido.»;
  - «añadir esa entrada fija al router» becomes «añadir una entrada fija a la tabla NAT del router»;
  - the Node bullet is split from the `EADDRINUSE` one;
  - «eso es `EADDRINUSE`» becomes «eso es el error `EADDRINUSE` («dirección ya en uso»)».
- **Lesson 5:** «JavaScript (el código que hace funcionar la web)» becomes «(el código que el navegador ejecuta en la página)», and «tu servidor siempre lee» becomes «el programa que recibe los datos siempre lee».
- **Lesson 8:** «scripts con código» becomes «scripts que el navegador ejecuta», and the first page is slower also because «el navegador ya tiene guardados muchos ficheros, como estilos e imágenes».
- **Lesson 7:** the hotel wifi «responde en lugar de la web que pides, con un certificado que no es el de esa web, y TLS lo descubre».
- **Lesson 6:** «una página web no puede enviar consultas DNS por UDP».
- **Lesson 3:** the «Y si programas» bullet is split in two.
- **Lesson 2:** «programado en Go, en JavaScript o en C» (Node is not a language).
- **Phase 0 introduction:** «Tu dispositivo averigua…».
- **Home page:** «como una base de datos o criptografía, funcionando en tu navegador».

