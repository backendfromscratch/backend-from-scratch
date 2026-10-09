# Cambios «para todos los públicos» de la Fase 0

Generado a partir de `ediciones/*.json`, que es lo que aplica el plan `docs/plans/2026-10-03-contenido-fase-0.md` (Tareas 4 a 7). Aquí solo el español; cada cambio tiene su equivalente en la versión inglesa, en el mismo JSON.

Criterios: ninguna lección da por sabido nada de programación; los términos de programación se explican en unas palabras la primera vez o pasan a «Y si programas:»; «Ya lo has visto» empieza por lo que ve cualquiera y termina, si hace falta, con «Y si programas:».

## Lección 1 · Modelo cliente-servidor

`web/src/content/docs/fase-0/modelo-cliente-servidor.mdx` (7 cambios)

### 1.1 Primera aparición de backend, frontend y API: se definen en pocas palabras, porque el SelfCheck y Errores comunes los usan después.

Antes:

````md
Tu backend atiende las peticiones de tu frontend y, para responderlas, les pide datos a una base de datos o a la API de Stripe.
````

Después:

````md
El *backend* de una web (su parte de servidor) atiende las peticiones de su *frontend* (lo que ves en el navegador) y, para responderlas, pide datos a una base de datos o a la API de Stripe (el servicio con el que muchas webs cobran con tarjeta).
````

### 1.2 Vite es jerga de dev; el mismo dato (Vite en el 5173) ya está en el aparte «Si programas» de «Ya lo has visto».

Antes:

````md
 El servidor de desarrollo de Vite escucha en el 5173.
````

Después:

````md
(se borra)
````

### 1.3 La sección empieza por experiencias de cualquiera (navegador, apps del móvil, router de casa); los ítems de dev (fetch, DevTools, Vite) quedan detrás de «Si programas».

Antes:

````md
Llevas años trabajando con este modelo, solo que desde el otro lado:
````

Después:

````md
Llevas años usando este modelo desde el lado del cliente:

- Cuando abres una web o actualizas una app, tu navegador o la app son el cliente. Si la pestaña se queda cargando, espera la respuesta.
- Hasta el router de casa hace de servidor: escribe `192.168.1.1` en el navegador y suele responderte con su página de configuración.

Y si programas:
````

### 1.4 «Framework» da por sabido programar; la idea (no hace falta nada especial) se mantiene con el ejemplo del propio ejercicio.

Antes:

````md
No hace falta una máquina especial ni un framework.
````

Después:

````md
No hace falta una máquina especial ni un programa complicado.
````

### 1.5 «Tu backend» daba por hecho que el lector tiene uno.

Antes:

````md
Tu backend es servidor para tu frontend, pero también es cliente
````

Después:

````md
El backend de una web es servidor para su frontend, pero también es cliente
````

### 1.6 Igual, en la autoevaluación.

Antes:

````md
question="Tu backend recibe una petición de tu frontend y, para responderla, llama a la API de Stripe. ¿Tu backend es cliente o servidor?"
````

Después:

````md
question="El backend de una tienda online recibe una petición de su frontend y, para responderla, llama a la API de Stripe. ¿Ese backend es cliente o servidor?"
````

### 1.7 Igual, en la respuesta.

Antes:

````md
Es servidor para tu frontend, porque espera sus peticiones
````

Después:

````md
Es servidor para su frontend, porque espera sus peticiones
````

## Lección 2 · Qué es un protocolo

`web/src/content/docs/fase-0/que-es-un-protocolo.mdx` (11 cambios)

### 2.1 «RFC» aparece aquí antes de definirse (se define más abajo con <Term id="rfc">); se dice en palabras normales.

Antes:

````md
Es porque el RFC permite a quien recibe aceptar también un `\n` suelto.
````

Después:

````md
Es porque las reglas de HTTP permiten a quien recibe aceptar también un `\n` suelto.
````

### 2.2 Quien no programa no sabe qué son Go, Node o C; «programado» deja claro que son formas de programar, sin quitarlos.

Antes:

````md
esté escrito en Go, en Node o en C
````

Después:

````md
esté programado en Go, en Node o en C
````

### 2.3 Primera aparición de «API» en la lección (luego sale en el error de REST); definición en pocas palabras.

Antes:

````md
pedir y servir páginas y APIs.
````

Después:

````md
pedir y servir páginas y APIs (servicios para programas, no para personas).
````

### 2.4 Primera vez que la prosa nombra el HTML; se explica qué es.

Antes:

````md
Hemos recortado el HTML, y tus fechas
````

Después:

````md
Hemos recortado el HTML (el código de la página), y tus fechas
````

### 2.5 La comparación con CSS solo sirve a quien programa webs; «base 16» lo entiende cualquiera.

Antes:

````md
en hexadecimal, como en los colores de CSS:
````

Después:

````md
en hexadecimal (en base 16, no en base 10):
````

### 2.6 La idea se entiende sin `fetch`; el detalle de `response.ok` pasa a un aparte «Si programas».

Antes:

````md
pero un programa que use `fetch` sabría por el `404` que lo que pidió no existe: `response.ok` sería `false` y `response.status`, `404`.
````

Después:

````md
pero una app sabría por el `404` que lo que pidió no existe (si programas: con `fetch`, `response.ok` sería `false` y `response.status`, `404`).
````

### 2.7 «Ya lo has visto» empieza por lo que ve cualquiera (páginas de error, el principio de la URL, que sube desde el final); los ítems de dev quedan detrás de «Si programas». En el esquema, la mención a Git pasa a ser condicional.

Antes:

````md
- **`fetch` escribe estos mensajes por ti.**
````

Después:

````md
- **Las páginas de «Error 404» que ves al navegar** muestran el código de estado del ejercicio 3; un «Error 500» dice que ha fallado el propio servidor.
- **El principio de una URL, el *esquema*, suele decir qué protocolo se habla:** `http://`, `https://`, `ws://` (WebSockets) o `ssh://`, que, si programas, quizá has visto en URLs de Git. También fija el puerto por defecto: 80 para `http://`, como en el ejercicio, y 443 para `https://`. No todos los esquemas son protocolos de red: `mailto:` o `data:` no lo son.

Y si programas:

- **`fetch` escribe estos mensajes por ti.**
````

### 2.8 Se borra aquí porque el ítem del esquema se ha movido arriba (edición anterior).

Antes:

````md
- **El principio de una URL, el *esquema*, suele decir qué protocolo se habla:** `http://`, `https://`, `ws://` (WebSockets) o `ssh://`, que quizá has visto en URLs de Git. También fija el puerto por defecto: 80 para `http://`, como en el ejercicio, y 443 para `https://`. No todos los esquemas son protocolos de red: `mailto:` o `data:` no lo son.
````

Después:

````md
(se borra)
````

### 2.9 «Objeto» es jerga de programación; un ejemplo muestra qué es JSON sin darlo por sabido.

Antes:

````md
una forma de escribir un objeto como texto.
````

Después:

````md
una forma de escribir información como texto, por ejemplo `{"nombre": "Ana"}`.
````

### 2.10 Librería, Node, fetch y axios son de dev: el error se plantea para todos (con `curl`, que el lector ya conoce) y la parte de código pasa a «Si programas».

Antes:

````md
**«Un protocolo es una librería o un programa.»** Un protocolo es un acuerdo escrito. Programas como Chrome, Node o nginx lo implementan, y `fetch` o axios son la forma de usar esa implementación desde tu código.
````

Después:

````md
**«Un protocolo es un programa.»** Un protocolo es un acuerdo escrito. Programas como Chrome, `curl` o nginx lo implementan. Si programas, tampoco es una librería: `fetch` o axios son la forma de usar esa implementación desde tu código.
````

### 2.11 Mismo cambio que en Errores comunes: sin «objeto».

Antes:

````md
dice cómo escribir un objeto como texto.
````

Después:

````md
dice cómo escribir información como texto.
````

## Lección 3 · El modelo TCP/IP

`web/src/content/docs/fase-0/modelo-tcp-ip.mdx` (8 cambios)

### 3.1 «Tu programa» daba por hecho que el lector programa; el navegador es un programa que todos usan.

Antes:

````md
casi todo lo hace tu sistema operativo sin que tu programa se entere.
````

Después:

````md
casi todo lo hace tu sistema operativo sin que el navegador se entere.
````

### 3.2 «Tu programa» y «librería» suponían saber programar: ejemplos que todos conocen y librería explicada en dos palabras.

Antes:

````md
Tu programa, o la librería que usa
````

Después:

````md
El programa (el navegador, `curl`…) o una librería (código ya hecho)
````

### 3.3 Mismo mensaje con el navegador en lugar de `fetch`; `fetch` pasa al aparte «Si programas» de «Ya lo has visto».

Antes:

````md
Cuando haces `fetch`, tu código solo toca la capa de aplicación.
````

Después:

````md
Cuando el navegador pide una página, solo toca la capa de aplicación.
````

### 3.4 Impersonal: no da por hecho que el lector programa.

Antes:

````md
Por eso puedes programar una web entera sin saber nada de esto.
````

Después:

````md
Por eso se puede programar una web entera sin saber nada de esto.
````

### 3.5 No todos vieron las pseudo-cabeceras en DevTools en la lección 1; se explican con la petición del ejercicio 1.

Antes:

````md
`:method` o `:path` que viste en DevTools en la lección 1.
````

Después:

````md
`:method` o `:path`, que hacen el papel de la primera línea de HTTP/1.1 (`GET /`).
````

### 3.6 Ya lo has visto empieza por lo cotidiano: los errores de Chrome suben aquí (con la página del dinosaurio) y DevTools pasa detrás, como opcional y diciendo cómo abrirlo. La tabla de Timing no cambia.

Antes:

````md
**La pestaña *Timing* de DevTools** (en *Network*, haz clic en una petición y abre *Timing*) desglosa cada petición en fases, y cada fase es una capa o un protocolo de los que acabas de ver:
````

Después:

````md
**Cuando una web no carga, los errores de Chrome se pueden leer por capas:**

- `ERR_INTERNET_DISCONNECTED` (la página del dinosaurio): tu sistema operativo dice que no hay ninguna conexión de red activa. Normalmente falla la capa de enlace (el wifi apagado o el cable suelto). Si el wifi funciona pero tu router no tiene salida a internet, verás otros errores.
- `ERR_NAME_NOT_RESOLVED`: DNS no ha encontrado la dirección del nombre (capa de aplicación).
- `ERR_CONNECTION_REFUSED`: el ordenador de destino responde, pero nadie escucha en ese puerto. Es la capa de transporte. Es lo que viste con `curl` en la lección 1.
- **Un `404`:** todas las capas han funcionado y el servidor te ha respondido, en HTTP, que eso no existe.

**Si quieres verlo por dentro, abre DevTools**, las herramientas para desarrolladores de Chrome: <kbd>F12</kbd>, o <kbd>Cmd</kbd> + <kbd>Opción</kbd> + <kbd>I</kbd> en Mac. En *Network*, recarga la página, haz clic en una petición y abre *Timing*. Verás la petición desglosada en fases, y cada fase es una capa o un protocolo de los que acabas de ver:
````

### 3.7 La lista de errores se ha movido arriba; en su sitio queda el aparte opcional para quien programa (localhost:3000 y `fetch`).

Antes:

````md
**Los errores de Chrome también se pueden leer por capas:**

- `ERR_INTERNET_DISCONNECTED`: tu sistema operativo dice que no hay ninguna conexión de red activa. Normalmente falla la capa de enlace (el wifi apagado o el cable suelto). Si el wifi funciona pero tu router no tiene salida a internet, verás otros errores.
- `ERR_NAME_NOT_RESOLVED`: DNS no ha encontrado la dirección del nombre (capa de aplicación).
- `ERR_CONNECTION_REFUSED`: el ordenador de destino responde, pero nadie escucha en ese puerto. Es la capa de transporte. Es lo que viste con `curl` en la lección 1, y lo que ves en la consola cuando tu frontend llama a `localhost:3000` y el backend no está arrancado.
- **Un `404`:** todas las capas han funcionado y el servidor te ha respondido, en HTTP, que eso no existe.
````

Después:

````md
Y si programas:

- `ERR_CONNECTION_REFUSED` es también lo que ves en la consola cuando tu frontend llama a `localhost:3000` y el backend no está arrancado. Y un `fetch` en tu código solo toca la capa de aplicación.
````

### 3.8 Igual que en la tabla: un programa que todos conocen, no «tu programa».

Antes:

````md
Tu programa solo toca la capa de aplicación.
````

Después:

````md
Un programa como el navegador solo toca la capa de aplicación.
````

## Lección 4 · IP, puertos y sockets

`web/src/content/docs/fase-0/ip-puertos-y-sockets.mdx` (8 cambios)

### 4.1 «Los de desarrollo» daba por sabido qué es un servidor de desarrollo; frase más corta para compensar.

Antes:

````md
5432 (PostgreSQL), 3306 (MySQL). Los de desarrollo, como 3000, 5173 u 8080, también están aquí, por costumbre
````

Después:

````md
5432 (PostgreSQL), 3306 (MySQL). Por costumbre, también los de las herramientas para crear webs: 3000, 5173, 8080
````

### 4.2 El ejemplo pasa del servidor de desarrollo al `localhost:8080` que todos abrieron en la lección 1; lo de `new URL` se mueve al aparte «Si programas».

Antes:

````md
y por eso tu servidor de desarrollo te obliga a escribir `:5173`. En JavaScript, `new URL('https://example.com:443').port` es una cadena vacía: el puerto por defecto ni se apunta.
````

Después:

````md
y por eso en la lección 1 escribiste `:8080`.
````

### 4.3 Código de Node: se mueve, sin perder nada, al aparte «Si programas» de «Ya lo has visto».

Antes:

````md
En Node, `http.createServer(…).listen(3000)` da esos tres pasos (pedir el socket, *bind* y *listen*) en una línea, y cada `fetch` usa un socket de cliente.
````

Después:

````md
(se borra)
````

### 4.4 Vite no se explicaba (quien no programa no lo tendrá abierto); «por IPv4 y IPv6» compensa las palabras.

Antes:

````md
`[::1]:5173` (un servidor de Vite) solo aceptan conexiones de tu ordenador, por IPv4 y por IPv6.
````

Después:

````md
`[::1]:5173` (Vite, para crear webs) solo aceptan conexiones de tu ordenador, por IPv4 y IPv6.
````

### 4.5 Empieza por dos experiencias cotidianas (la página del router, abrir puertos para jugar) y lo de programación va detrás de «Si programas». Para no pasar de 0 palabras: los dos puntos de Vite se funden en uno (sin perder ninguna idea), la línea de Node se une a EADDRINUSE y `new URL` pasa a ser el último punto.

Antes:

````md
- **`Network: use --host to expose` en Vite.** Por defecto, Vite solo escucha en localhost. Con `--host` escucha en todas las direcciones y te enseña `Network: http://192.168.1.133:5173/`, con tu IP privada.
- **`EADDRINUSE`.** `Error: listen EADDRINUSE: address already in use :::3000` significa que ya hay un socket escuchando en ese puerto, a menudo un servidor que dejaste abierto. `:::3000` es `::` (Node escucha por defecto en todas las direcciones) y `:3000`. Para ver quién lo ocupa: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
- **«Con localhost funciona y con 127.0.0.1 no».** En macOS, Vite escucha por defecto solo en `[::1]`, como viste en el ejercicio 2. `http://localhost:5173` funciona, porque se prueba `::1`, pero `http://127.0.0.1:5173` da «Connection refused». Es la lección 1 al revés.
````

Después:

````md
- **La página del router** está en su IP privada, a menudo `192.168.1.1`: tu puerta de enlace.
- **«Abrir puertos» para jugar online**, como piden algunas consolas, es añadir esa entrada fija al router.

Y si programas:

- **`Network: use --host to expose` en Vite.** Por defecto, Vite solo escucha en localhost; en macOS, solo en `[::1]` (ejercicio 2): `http://localhost:5173` funciona (se prueba `::1`), pero `http://127.0.0.1:5173` da «Connection refused», la lección 1 al revés. Con `--host` escucha en todas las direcciones y te enseña tu IP privada: `Network: http://192.168.1.133:5173/`.
- **En Node**, `http.createServer(…).listen(3000)` pide el socket, hace *bind* y *listen*; cada `fetch` usa un socket de cliente. `Error: listen EADDRINUSE: address already in use :::3000`: ya hay un socket escuchando en ese puerto, a menudo un servidor que dejaste abierto. `:::3000` es `::` (Node escucha por defecto en todas las direcciones) y `:3000`. Para ver quién lo ocupa: `lsof -nP -iTCP:3000 -sTCP:LISTEN`.
- **`new URL('https://example.com:443').port`** es una cadena vacía: el puerto por defecto ni se apunta.
````

### 4.6 La pregunta daba por sabido Vite; nc es lo que el lector ya ha usado.

Antes:

````md
question="Arrancas vite --host en tu portátil. ¿Puede abrirlo tu móvil conectado a tu wifi? ¿Y un amigo desde su casa?"
````

Después:

````md
question="Dejas nc -l 8080 escuchando en tu portátil. ¿Puede conectarse tu móvil, que está en tu wifi? ¿Y un amigo desde su casa?"
````

### 4.7 Mismo puerto que la pregunta.

Antes:

````md
puede llegar a tu IP privada, `http://192.168.1.133:5173`.
````

Después:

````md
puede llegar a tu IP privada, `http://192.168.1.133:8080`.
````

### 4.8 Sin jerga de desarrollo.

Antes:

````md
y para un servidor de desarrollo no es buena idea.
````

Después:

````md
y para un servidor de pruebas no es buena idea.
````

## Lección 5 · TCP frente a UDP

`web/src/content/docs/fase-0/tcp-vs-udp.mdx` (8 cambios)

### 5.1 Explica en pocas palabras qué son el HTML y el JavaScript, que no se definían.

Antes:

````md
el HTML llega entero y en orden. Si faltara un solo byte de un fichero JavaScript, la página se rompería.
````

Después:

````md
el HTML (el fichero que describe la página) llega entero y en orden. Si faltara un solo byte de un fichero JavaScript (el código que hace funcionar la web), la página se rompería.
````

### 5.2 «Tu programa» da por hecho que el lector programa.

Antes:

````md
no sabe dónde empieza ni dónde acaba cada mensaje de tu programa.
````

Después:

````md
no sabe dónde empieza ni dónde acaba cada mensaje del programa que lo usa.
````

### 5.3 «Tu programa» da por hecho que el lector programa.

Antes:

````md
Para TCP, lo que envía tu programa es un chorro de bytes sin cortes.
````

Después:

````md
Para TCP, lo que envía un programa es un chorro de bytes sin cortes.
````

### 5.4 Primera aparición de «API»: se explica; «datos en JSON» se entiende sin saber qué es JSON.

Antes:

````md
| Webs y APIs con HTTP/1.1 o HTTP/2 | TCP | Cada byte del HTML o del JSON cuenta |
````

Después:

````md
| Webs y APIs (los servicios que dan datos a las apps) con HTTP/1.1 o HTTP/2 | TCP | Cada byte del HTML o de los datos en JSON cuenta |
````

### 5.5 `fetch` solo lo conoce quien programa; la idea es la misma con «petición», que ya está explicada.

Antes:

````md
- **«Cada `fetch` hace un handshake.»**
````

Después:

````md
- **«Cada petición hace su propio handshake.»**
````

### 5.6 «Ya lo has visto» empieza por lo cotidiano (una videollamada, la página de error) y deja DevTools al final, como opcional.

Antes:

````md
- **_Initial connection_, en la pestaña _Timing_ de DevTools,**
````

Después:

````md
- **Una videollamada que se pixela un instante, en vez de congelarse,** va por UDP: no espera a lo que se pierde.
- **`ERR_CONNECTION_REFUSED` y `ERR_CONNECTION_TIMED_OUT`,** en la página de error del navegador, son el segundo y el tercer caso del ejercicio 3. `REFUSED` llega enseguida, porque alguien respondió con un rechazo. `TIMED_OUT` tarda, porque nadie respondió.

Y si programas, en DevTools:

- **_Initial connection_, en la pestaña _Timing_,**
````

### 5.7 «De DevTools» ya lo dice la frase que introduce el bloque opcional.

Antes:

````md
- **`h3` en la columna _Protocol_ de DevTools**
````

Después:

````md
- **`h3` en la columna _Protocol_**
````

### 5.8 Este punto sube al principio de la sección (ver la edición anterior); aquí se quita para no duplicarlo.

Antes:

````md
- **`ERR_CONNECTION_REFUSED` y `ERR_CONNECTION_TIMED_OUT`** son el segundo y el tercer caso del ejercicio 3. `REFUSED` llega enseguida, porque alguien respondió con un rechazo. `TIMED_OUT` tarda, porque nadie respondió.
````

Después:

````md
(se borra)
````

## Lección 6 · DNS

`web/src/content/docs/fase-0/que-es-dns.mdx` (4 cambios)

### 6.1 Precisión: el navegador sí usa UDP (HTTP/3, lección 5); lo que no puede es una página web.

Antes:

````md
porque un navegador no puede enviar UDP, pero sí peticiones HTTPS.
````

Después:

````md
porque una página web no puede enviar UDP, pero sí peticiones HTTPS.
````

### 6.2 Ejemplo cotidiano (el wifi) en lugar de DevTools, que baja al final de la sección como opcional.

Antes:

````md
- **_DNS Lookup_ en la pestaña _Timing_** de DevTools es esta consulta. En la primera petición a un dominio verás unos milisegundos; en las siguientes, 0 o ni aparece, porque la respuesta está en caché o la conexión se reutiliza.
````

Después:

````md
- **El campo «DNS» de los ajustes del wifi** (en el móvil o el ordenador) es la dirección de tu resolver. Muchas veces es tu router, que reenvía las consultas al de tu operador.
````

### 6.3 Añade un servicio que usa gente que no programa (Wix) junto a los de desarrolladores.

Antes:

````md
Cuando conectas un dominio a Vercel, Netlify o GitHub Pages,
````

Después:

````md
Cuando conectas un dominio a un servicio como Wix, Vercel, Netlify o GitHub Pages,
````

### 6.4 `ping` no se explicaba y no termina solo; DevTools queda al final, como extra para quien programa.

Antes:

````md
Para comprobarlo, usa `ping miapp.test`.
````

Después:

````md
Para comprobarlo, usa `ping miapp.test`: su primera línea dice a qué IP va. Páralo con <kbd>Ctrl</kbd> + <kbd>C</kbd>.

Y si programas, en DevTools:

- **_DNS Lookup_ en la pestaña _Timing_** es esta consulta. En la primera petición a un dominio verás unos milisegundos; en las siguientes, 0 o ni aparece, porque la respuesta está en caché o la conexión se reutiliza.
````

## Lección 7 · TLS y HTTPS

`web/src/content/docs/fase-0/tls-y-https.mdx` (5 cambios)

### 7.1 «script» se da por sabido: glosa breve la primera vez.

Antes:

````md
por ejemplo para meter un script en la página que descargas.
````

Después:

````md
por ejemplo para meter un script (código que tu navegador ejecuta) en la página que descargas.
````

### 7.2 DevTools se usaba sin decir qué es; se explica y se remite a la lección 8, donde se abren.

Antes:

````md
Por eso, en DevTools, *Initial connection* incluye la parte *SSL* (el nombre antiguo de TLS).
````

Después:

````md
Por eso, en DevTools (herramientas del navegador que abrirás en la lección siguiente), *Initial connection* incluye la parte *SSL* (el nombre antiguo de TLS).
````

### 7.3 «API» sin explicar: se dice en palabras normales qué es la Web Crypto API.

Antes:

````md
es criptografía de verdad, con la Web Crypto API de tu navegador.
````

Después:

````md
es criptografía de verdad, la que trae tu navegador (la Web Crypto API).
````

### 7.4 «Ya lo has visto»: primero lo cotidiano (aviso de Chrome, fecha, wifi de hotel, nuevo); después, opcional, lo de quien programa (contenido mixto y crypto.subtle).

Antes:

````md
- **«No es seguro»** a la izquierda de la URL en una web `http://`: no hay TLS, así que todo viaja como una postal.
- **`NET::ERR_CERT_DATE_INVALID`, `NET::ERR_CERT_COMMON_NAME_INVALID` y `NET::ERR_CERT_AUTHORITY_INVALID`** son, en Chrome, los tres casos del ejercicio 3: caducado, nombre equivocado y firmado por alguien en quien no confía.
- **Si la fecha de tu ordenador está mal,** verás `ERR_CERT_DATE_INVALID` en todas las webs: para el navegador, todos los certificados están fuera de fecha.
- **`crypto.subtle` es `undefined`.** Si abres tu servidor de desarrollo desde el móvil con `http://192.168.1.133:5173`, la Web Crypto API (y otras como `crypto.randomUUID` o el acceso al portapapeles) desaparecen: el navegador solo las da en contextos seguros, con HTTPS o en `localhost`. Es el aviso que verías en el playground.
- **Contenido mixto (*mixed content*):** una página HTTPS que carga un script por `http://`. El navegador lo bloquea, porque ese script sí viajaría como una postal y alguien podría cambiarlo.
````

Después:

````md
- **«No es seguro»** a la izquierda de la URL en una web `http://`: no hay TLS, así que todo viaja como una postal.
- **El aviso «La conexión no es privada»** de Chrome lleva debajo un código: `NET::ERR_CERT_DATE_INVALID`, `NET::ERR_CERT_COMMON_NAME_INVALID` o `NET::ERR_CERT_AUTHORITY_INVALID`. Son los tres casos del ejercicio 3: caducado, nombre equivocado y firmado por alguien en quien no confía.
- **Si la fecha de tu ordenador está mal,** verás `ERR_CERT_DATE_INVALID` en todas las webs: para el navegador, todos los certificados están fuera de fecha.
- **La wifi de un hotel** puede darte errores de certificado hasta que aceptas sus condiciones: se hace pasar por la web que pides, y TLS lo descubre.

Y si programas:

- **Contenido mixto (*mixed content*):** una página HTTPS que carga un script por `http://`. El navegador lo bloquea, porque ese script sí viajaría como una postal y alguien podría cambiarlo.
- **`crypto.subtle` es `undefined`.** Si abres tu servidor de desarrollo desde el móvil con `http://192.168.1.133:5173`, la Web Crypto API (y otras como `crypto.randomUUID` o el acceso al portapapeles) desaparecen: el navegador solo las da en contextos seguros, con HTTPS o en `localhost`. Es el aviso que verías en el playground.
````

### 7.5 «API» y «tus proyectos» daban por hecho que el lector programa.

Antes:

````md
la API que usa el playground, por si quieres usarla en tus proyectos.
````

Después:

````md
la criptografía que usa el playground, por si programas y quieres usarla en tus proyectos.
````

## Lección 8 · De la URL a la página

`web/src/content/docs/fase-0/que-pasa-cuando-escribes-una-url.mdx` (6 cambios)

### 8.1 HTML, estilos y scripts se daban por sabidos: glosa breve la primera vez.

Antes:

````md
El HTML le dice qué más necesita (estilos, scripts, imágenes), y lo pide a la vez
````

Después:

````md
El HTML, la página en sí, le dice qué más necesita (estilos, scripts con código, imágenes), y lo pide a la vez
````

### 8.2 «los CSS» se daba por sabido: se dice que son los estilos.

Antes:

````md
Lee el HTML, encuentra los CSS, los scripts y las imágenes y los pide.
````

Después:

````md
Lee el HTML, encuentra los estilos (CSS), los scripts y las imágenes y los pide.
````

### 8.3 «Ya la conoces» suponía que el lector es dev frontend.

Antes:

````md
Esta parte ya la conoces.
````

Después:

````md
Esta parte ya no es backend: la tienes en «Para profundizar».
````

### 8.4 Primera vez que se usa DevTools: qué es, cómo se abre y qué fila pulsar.

Antes:

````md
abre DevTools, ve a *Network* y entra en `https://example.com`. Haz clic en la petición del documento y abre la pestaña *Timing*.
````

Después:

````md
abre DevTools, las herramientas para desarrolladores (<kbd>F12</kbd>, o clic derecho › *Inspeccionar*), ve a la pestaña *Network* y entra en `https://example.com`. Haz clic en la petición del documento (la primera, `example.com`) y abre la pestaña *Timing*.
````

### 8.5 «Ya lo has visto»: primero lo cotidiano (web lejana lenta, primera página más lenta, nuevo); después, opcional, preconnect y Lighthouse.

Antes:

````md
- **`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`** le dice al navegador que haga DNS, TCP y TLS con ese servidor cuanto antes, sin esperar a descubrir que lo necesita. `dns-prefetch` hace solo el DNS. Ahora sabes qué viajes se ahorran. (El `crossorigin` hace falta porque las fuentes se piden en modo CORS, que verás en la Fase 2.)
- **«Document request latency»** en Lighthouse (antes, «Reduce initial server response time»), o el TTFB en las métricas de rendimiento, depende mucho del paso 6: lo que tarda tu servidor. Desde la Fase 3 será cosa tuya.
- **Una web «rápida en tu ordenador» y lenta para usuarios de otro continente:** casi siempre es la latencia. Por eso las webs grandes usan CDN.
````

Después:

````md
- **Una web de otro continente que tarda en empezar a cargar,** aunque tu conexión sea rápida: casi siempre es la latencia. Por eso las webs grandes usan CDN.
- **La primera página de una web tarda más que las siguientes:** después, la conexión sigue abierta y la IP está en caché.

Y si programas:

- **`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`** le dice al navegador que haga DNS, TCP y TLS con ese servidor cuanto antes, sin esperar a descubrir que lo necesita. `dns-prefetch` hace solo el DNS. Ahora sabes qué viajes se ahorran. (El `crossorigin` hace falta porque las fuentes se piden en modo CORS, que verás en la Fase 2.)
- **«Document request latency»** en Lighthouse (antes, «Reduce initial server response time»), o el TTFB en las métricas de rendimiento, depende mucho del paso 6: lo que tarda tu servidor. Desde la Fase 3 será cosa tuya.
````

### 8.6 «Tu API» daba por hecho que el lector programa.

Antes:

````md
question="Tu API está en un servidor de Estados Unidos,
````

Después:

````md
question="Una web está en un servidor de Estados Unidos,
````

## Correcciones tras la revisión final

Aplicadas después de las Tareas 4 a 7 (también en inglés):

- **DevTools, para todos desde la lección 3:** en las lecciones 5 y 6, «Y si programas, en DevTools:» pasa a «En DevTools (lección 3):». En la 7, «herramientas del navegador que abrirás en la lección siguiente» pasa a «las herramientas de Chrome que abriste en la lección 3». En la 8, «abre DevTools, las herramientas para desarrolladores (F12…)» pasa a «abre DevTools en Chrome (lección 3: F12…)».
- **Lección 1, qué es una API:** «…o a la API de Stripe, el servicio con el que muchas webs cobran con tarjeta. Una API es eso: un servicio pensado para que lo usen otros programas, no personas.»
- **Lección 1, error común y autoevaluación:** «tu backend» y «tu frontend» pasan a «el backend de una web» o «de una tienda online» y «su frontend».
- **Lección 3, precisión técnica:** «el navegador solo toca la capa de aplicación» pasa a «trabaja casi solo en la capa de aplicación». Con HTTP/3 el navegador hace QUIC él mismo (lección 5).

## Menores corregidos después

Aplicados a petición del autor tras la revisión final (también en inglés):

- **Lección 4:**
  - en la autoevaluación de `nc -l 8080`, «Y por IPv6, aunque tu portátil tenga dirección pública…» pasa a «Por IPv6 tampoco: en macOS, `nc` solo escucha en IPv4 y, aunque escuchara, el router suele bloquear las conexiones que nadie ha pedido.»;
  - «añadir esa entrada fija al router» pasa a «añadir una entrada fija a la tabla NAT del router»;
  - la viñeta de Node se separa de la de `EADDRINUSE`;
  - «eso es `EADDRINUSE`» pasa a «eso es el error `EADDRINUSE` («dirección ya en uso»)».
- **Lección 5:** «JavaScript (el código que hace funcionar la web)» pasa a «(el código que el navegador ejecuta en la página)», y «tu servidor siempre lee» a «el programa que recibe los datos siempre lee».
- **Lección 8:** «scripts con código» pasa a «scripts que el navegador ejecuta», y la primera página tarda más también porque «el navegador ya tiene guardados muchos ficheros, como estilos e imágenes».
- **Lección 7:** la wifi del hotel «responde en lugar de la web que pides, con un certificado que no es el de esa web, y TLS lo descubre».
- **Lección 6:** «una página web no puede enviar consultas DNS por UDP».
- **Lección 3:** la viñeta de «Y si programas» se parte en dos.
- **Lección 2:** «programado en Go, en JavaScript o en C» (Node no es un lenguaje).
- **Introducción de la Fase 0:** «Tu dispositivo averigua…».
- **Portada:** «como una base de datos o criptografía, funcionando en tu navegador».

