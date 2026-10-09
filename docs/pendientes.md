# Próximos pasos y pendientes del autor

Arriba, los próximos pasos en orden (actualizados el 2026-10-09). Debajo, el detalle de todo lo pendiente: lo que el autor revisará y lo que tiene que decidir. Añade aquí lo nuevo y tacha lo resuelto.

## Próximos pasos, en orden

Quién lo hace: **tú** (el autor), **Claude** (cuando se lo pidas) o **juntos**. El detalle de cada punto está en las secciones de abajo.

### 1. Guardar el trabajo y subirlo a GitHub (lo antes posible)

El código está en GitHub desde el 2026-10-09: `backendfromscratch/backend-from-scratch`.

- [x] **Tú:** crear la organización `backendfromscratch` en GitHub, en el plan *Free*.
- [x] **Juntos:** cómo subir con tu cuenta personal (`GianSegura`), si la clave SSH de este Mac entra como la del trabajo. Se sube por HTTPS: el remoto es `https://github.com/…` y `gh` hace de credencial **solo en este repositorio** (`git config --local credential.https://github.com.helper '!gh auth git-credential'`). Usa la cuenta activa de `gh`: si la cambias a la del trabajo, los push fallan. La segunda clave SSH con alias se deja para la lección 9 de la Fase 1.
- [x] **Tú, con Claude Code cerrado:** renombrar la carpeta a `backend-from-scratch`. La memoria de Claude ya está copiada a la ruta nueva.
- [x] **Claude:** el primer commit; crear el repositorio público `backendfromscratch/backend-from-scratch` y subir el código.
- [x] **Claude:** proteger `main` y hacer obligatorio el job del CI («format, types, tests and build»). Desde el mismo día también es obligatorio «conventional commit title» (el título de la PR sigue Conventional Commits), y solo se puede mergear con squash. Hecho el 2026-10-09: para mergear una PR, el CI tiene que pasar sobre la rama al día con `main`; no se permiten force push ni borrar `main`. Los admins (tú) pueden saltarse la regla con un push directo, pero Cloudflare desplegará cada push a `main`, así que lo normal es ir por PR.

### 2. Desbloquear la Fase 1

- [ ] **Tú:** revisar la piloto: leer y hacer como lector la introducción y la lección 1 de la Fase 1. Las otras nueve lecciones esperan a tu veredicto sobre la plantilla y el tono.
- [ ] **Tú:** dos decisiones rápidas antes de escribir más:
  - la puntuación en inglés: el punto fuera de las comillas (estilo británico, el actual) o dentro (estadounidense);
  - el límite de JavaScript por página: 400 KB, o estudiar Preact para aligerar los playgrounds.

### 3. Publicar la web

Cuanto antes se publique, antes empieza Google a confiar en el dominio. La Fase 0 ya está completa en los dos idiomas.

- [ ] **Tú:** comprar `backenddesdecero.com` y `backendfromscratch.com`, y `.dev` si quieres, como defensa.
- [ ] **Juntos:** conectar Cloudflare al repositorio (el comando de build es `pnpm build`) y redirigir `backendfromscratch.com` a `/en/`.
- [ ] **Juntos, antes de anunciarla:** Lighthouse con un móvil simulado, Google Search Console, Bing Webmaster Tools y la prueba de resultados enriquecidos.
- [ ] **Tú:** decidir la licencia antes de que nadie reutilice nada. Sin licencia, se puede leer pero no reutilizar. Lo habitual: MIT para el código y Creative Commons para el contenido.

### 4. Seguir con la Fase 1, lección a lección

- [ ] **Claude:** antes de la lección 2, el script que genera el `access.log` de prácticas (`web/public/practicas/access.log`).
- [ ] **Claude, y tú revisas cada una:** las lecciones 2 a 10, cada una con un plan corto, comandos ejecutados de verdad y una revisión independiente. En la lección 4 se comprueba Multipass en tu Mac; antes de la 10, el script del repositorio de Git para `bisect`.
- [ ] **Claude:** traducir la Fase 1 al inglés cuando apruebes el español.

### 5. Sin prisa: no bloquea nada

- [ ] **Tú:** leer con tu voz la Fase 0: las 9 lecciones, la introducción, los cambios «para todos los públicos», la traducción, los diagramas y la imagen para redes (en «Revisión de contenido»).
- [ ] **Tú:** la maqueta en tu navegador y el ancho del texto (en «Decisiones»).
- [ ] **Tú:** las preguntas abiertas de los laboratorios y de los menores técnicos (en «Decisiones» y en las secciones de menores).
- [ ] **Tú:** probar WSL en un Windows.
- [ ] **Tú, antes de la Fase 3:** decidir si se añade una fase «Programar desde cero con JavaScript y TypeScript».
- [ ] **Unos meses después de publicar:** separar el inglés en `backendfromscratch.com` si Search Console lo pide, decidir si se añade un tercer idioma y el panel de progreso.

## Revisión de contenido

- [ ] **Lección piloto de la Fase 1:** leer y hacer como lector la introducción (`fase-1/index.mdx`) y la lección 1, «La shell: comandos y rutas» (`fase-1/comandos-basicos-terminal.mdx`), y decir si la plantilla y el tono valen para las otras nueve. Hasta entonces no se escribe ninguna más. Decisiones tomadas en el plan (`docs/plans/2026-10-07-fase-1-piloto.md`): Multipass se instala en la lección 4, el título y la URL salen de búsquedas reales, y el término «terminal» se explica ahora en esta lección.
- [ ] **WSL sin verificar en la lección 1:** se comprobó en un Ubuntu de Docker, no en WSL. Conviene probar en un Windows: que WSL abierto desde Windows Terminal empieza en `/mnt/c/Users/…`, la tecla de la `~` (AltGr + 4) y el prefijo `-bash:` de los errores.
- [ ] Leer y hacer como lector la **lección 1, «Qué es el backend»** (`fase-0/que-es-el-backend.mdx`) y reescribirla con tu voz. La escribió un agente a partir de la spec del 2026-10-04. Prueba el ejercicio de Open-Meteo en tu navegador.
- [ ] Leer y hacer como lector la **lección 2, «Modelo cliente-servidor»** (`web/src/content/docs/fase-0/modelo-cliente-servidor.mdx`) y reescribirla con su voz. Responder:
  - ¿El tono es el que quiere para todo el curso?
  - ¿Sobra o falta alguna sección de la plantilla?
  - ¿Los componentes (definiciones, analogía, «Pruébalo», preguntas) ayudan o estorban?
- [ ] Revisar la **introducción de la Fase 0** (`web/src/content/docs/fase-0/index.mdx`).
- [ ] Revisar la **traducción al inglés** de la Fase 0 entera: la introducción, las lecciones 1 a 9 y el glosario (`web/src/content/docs/en/phase-0/` y `web/src/content/glossary/en/`). Las lecciones 3 a 9 se tradujeron a petición del autor antes de que revisara el español, y dos revisores compararon cada lección con su original. Si cambia el español, hay que ajustar el inglés. Detalles de la traducción:
  - en la lección 9, los comandos `curl` se volvieron a ejecutar con etiquetas en inglés, así que los tiempos del texto y de la tabla son otros que en español (por ejemplo, un RTT de unos 15 ms);
  - las palabras que en español van en cursiva por ser extranjeras (*handshake*, *round trip time*) van sin cursiva en inglés;
  - en la lección 3, la ruta del 404 es `/does-not-exist`.
  - **una decisión de estilo:** las lecciones en inglés ponen el punto fuera de las comillas (`“…hand it to me”.`), como en la lección 2 que ya revisaste. Es el estilo británico; el estadounidense lo pone dentro (`“…hand it to me.”`). El resto del inglés es estadounidense. Se mantuvo por coherencia, pero conviene decidirlo antes de escribir más.
- [ ] Leer y hacer como lector la **lección 3, «Qué es un protocolo»** (`fase-0/que-es-un-protocolo.mdx`).
- [ ] Leer y hacer como lector la **lección 4, «El modelo TCP/IP»** (`fase-0/modelo-tcp-ip.mdx`).
- [ ] Leer y hacer como lector la **lección 5, «IP, puertos y sockets»** (`fase-0/ip-puertos-y-sockets.mdx`). Ojo: el ejercicio 3 pide tres terminales abiertas a la vez; ¿es demasiado para alguien que acaba de conocer la terminal?
- [ ] Leer y hacer como lector la **lección 6, «TCP frente a UDP»** (`fase-0/tcp-vs-udp.mdx`), y probar con tus manos el **laboratorio del handshake**: una partida sin pérdidas, otra perdiendo el 2.º segmento de datos (mira «Aplicación del servidor») y otra en UDP. ¿Se entiende sin ayuda? ¿Sobra o falta algo en la escalera? Revisa también los textos en inglés del laboratorio (`web/src/playgrounds/tcp-handshake/strings.ts`).
- [ ] Leer y hacer como lector la **lección 7, «DNS»** (`fase-0/que-es-dns.mdx`), y probar el **laboratorio de consultas DNS** con varios dominios (uno que no exista, un MX, un CNAME). Decisiones de diseño tomadas sin consultarte (plan: `docs/plans/2026-10-03-laboratorio-dns-y-leccion-6.md`): consultas reales a Cloudflare (1.1.1.1) por DoH sin proxy, el recorrido paso a paso con «Siguiente paso» y «Ver todo», y la tabla de registros al final. ¿Te encaja?
- [ ] Leer y hacer como lector la **lección 8, «TLS y HTTPS»** (`fase-0/tls-y-https.mdx`), y probar el **playground de criptografía** (cifrar, descifrar con otra clave, firmar y alterar el mensaje). Decisiones tomadas sin consultarte (plan: `docs/plans/2026-10-03-playground-crypto-y-leccion-7.md`): RSA-OAEP para cifrar (la lección aclara que TLS 1.3 ya no cifra con RSA) y ECDSA P-256 para firmar, en el mismo panel; los ejercicios usan opciones de `openssl` que tienen tanto LibreSSL (el de macOS) como OpenSSL.
- [ ] Leer y hacer como lector la **lección 9, «De la URL a la página»** (`fase-0/que-pasa-cuando-escribes-una-url.mdx`), que cierra la Fase 0. El ejercicio con un servidor lejano usa `www.gov.za` (Johannesburgo, sin CDN): si prefieres otro, cualquiera a más de 150 ms sirve.
- [ ] Revisar el diseño de la **imagen para redes** de cada página (`web/dist/og/…` tras el build; la genera `web/src/lib/og/card.ts`).
- [x] **Títulos y descripciones** de las lecciones según lo que busca la gente (`docs/specs/2026-10-03-seo-design.md`, §4) y revisión **«para todos los públicos»**: un plan de contenido aparte. La portada aún dice «Para quien ya programa… No explicamos qué es una variable», y choca con la decisión de público. Hecho el 2026-10-03 (plan `docs/plans/2026-10-03-contenido-fase-0.md`). Revisa los cambios en `docs/plans/2026-10-03-contenido-fase-0/cambios.md`: los propusieron agentes y no los has leído con tu voz.
- [ ] Revisar los **diagramas**, ahora HTML en lugar de Mermaid: en escritorio, flechas entre participantes; en móvil (columna de menos de 32rem), una lista de pasos «A → B».
- [ ] **Leer con tu voz los cambios «para todos los públicos»** de la Fase 0 (`docs/plans/2026-10-03-contenido-fase-0/cambios.md`): los propusieron agentes, los revisó un revisor independiente y están aplicados, pero no los has leído tú.
- [ ] **Nombres de DevTools en español:** las lecciones usan *Network* y *Timing*. En Chrome en español son *Red* y otro nombre; conviene comprobarlos y añadirlos.
- [ ] **Textos de Chrome citados de memoria:** «La conexión no es privada» (lección 8). Comprobar que coinciden con los de tu navegador.
- [ ] **Fuera de la Fase 0:** el glosario (`web/src/content/glossary/`) no se ha revisado con el criterio «para todos los públicos».

## Diseño de la Fase 1

- [x] **Diseño aprobado el 2026-10-07,** con las propuestas tal cual: VM de Multipass, WSL como única vía en Windows, diez lecciones y el proyecto guiado en la Fase 3. Se empieza con una lección piloto (plan: `docs/plans/2026-10-07-fase-1-piloto.md`). Lo que se decidió:
  - **Dónde practica el lector:**
    - su propio terminal para lo básico;
    - una VM de Ubuntu con Multipass (`multipass launch --name curso`) como «servidor» para usuarios, servicios y SSH;
    - y, como servidores remotos de verdad, el juego Bandit de OverTheWire y GitHub por SSH.

    En Windows, la propia WSL hace de servidor.
  - **Windows: WSL como única vía,** y fuera la pestaña «Windows» de la lección 2.
  - **Diez lecciones en lugar de seis:**
    - «Procesos» se divide en procesos y señales por un lado, y servicios y paquetes (`systemd`, `apt`) por otro;
    - entran `nano` y salir de `vim`;
    - leer logs es el hilo práctico de pipes y redirecciones.
  - **Git:** «Git como base del despliegue» pasa a la Fase 8 (CI/CD). La lección de Git se centra en el modelo interno, `rebase`, `reflog` y `bisect`.
  - **Sin laboratorios de nivel 3,** como dice `CLAUDE.md`. Como mucho, una calculadora de permisos pequeña y opcional.
  - **Material de prácticas que hay que crear:** un `access.log` de ejemplo servido por la web y un script que monta un repositorio de Git con un error escondido para `bisect`.
  - **Pregunta abierta:** ¿adelantar un proyecto guiado pequeño a esta fase, o esperar a la Fase 3 como dice el roadmap? Se propone esperar.

## Decisiones

- [x] **Diseño visual:** elegida la propuesta D (editor de código), en oscuro y claro. Aplicada en la web (spec: `docs/specs/2026-10-02-tema-ide-design.md`).
- [x] **Maqueta de editor (diseño C):** elegida el 2026-10-03 sobre los bocetos e implementada (spec: `docs/specs/2026-10-03-maqueta-editor-design.md`).
- [ ] **Revisar la maqueta en tu navegador:** en oscuro y en claro, en el portátil y en el móvil. Prueba las pestañas fijadas (playgrounds y glosario), el esquema, el minimapa y las barras de scroll.
- [ ] **Ancho del texto:** `75ch` en nuestra fuente son unos 100 caracteres por línea (hoy eran unos 90). Si lo prefieres más estrecho, `--ide-measure: 40rem` deja unos 75 caracteres reales. Es una sola variable en `web/src/styles/theme.css`.
- [x] **Cambios decididos tras ver la maqueta (2026-10-03),** implementados el mismo día:
  - el ESQUEMA empieza plegado y, si el lector lo abre, sigue abierto en las páginas siguientes;
  - barra de actividad: explorador, buscar, **playgrounds** (nuevo, en lugar del temario) y glosario; abajo, tema e idioma (después se quitó la barra: ver el punto siguiente);
  - el explorador queda con `inicio.md` y las fases: salen `temario.md` y `glosario.md`;
  - la página del temario (`/roadmap/`) se mantiene, enlazada desde la portada (busca «roadmap backend»);
  - en el móvil, el menú ☰ enlazaba al glosario y a los playgrounds (sustituido por las pestañas fijadas);
  - nueva página `/playgrounds/` que reúne los laboratorios y playgrounds del curso, con su nivel y un enlace a su lección. Las páginas propias por playground, más adelante (buenas para el SEO).
- [x] **Sin barra de actividad (2026-10-03, después de verla):** los playgrounds y el glosario pasan a pestañas fijadas, que también se ven en el móvil; el tema y el idioma vuelven arriba a la derecha; se quita el botón de ocultar el explorador. Spec actualizada (§2, §4.1, §4.2).
- [x] **Pestaña de la página abierta, primera y siempre visible; explorador sin carpeta raíz y sin plegar** (2026-10-03). Spec actualizada (§4.2, §4.3).
- [x] **La primera pestaña no se cierra en playgrounds y glosario:** enlaza a la última página abierta (2026-10-03).
- [x] **Menores aplazados de la revisión de la maqueta, resueltos** (2026-10-03): esquema con una sola entrada, `aside` vacío, foco recortado, glosario en el minimapa y en el resaltado, esquema que enseña la sección marcada, comentario del import del buscador y contraste de `line` en la guía. Los demás ya no aplicaban tras quitar la barra de actividad.
- [ ] **Idea para más adelante:** un panel de progreso (lecciones terminadas, guardadas en el navegador), cuando haya más lecciones. Sin barra de actividad, podría ser otra pestaña fijada.

- [x] **Nombre y dominio:** «Backend desde cero / Backend from Scratch», en `backenddesdecero.com` (decidido el 2026-10-03). El nombre del repositorio lo cambió la decisión siguiente.
- [x] **Nombres técnicos en inglés (2026-10-08):**
  - organización de GitHub `backendfromscratch` (libre ese día) y repositorio público `backendfromscratch/backend-from-scratch`, con el autor como único dueño;
  - el paquete raíz, `backend-from-scratch` (`package.json`);
  - la carpeta local, `backend-from-scratch` (punto siguiente).

  El producto sigue en el idioma de cada lector: «Backend desde cero» en `backenddesdecero.com` y «Backend from Scratch» en `/en/`. **Se descartó pasarlo todo a «Backend from Scratch»** con `backendfromscratch.com` como dominio principal. Las lecciones posicionarían igual (Google apenas mira las palabras del dominio), pero:
  - Google admite un solo nombre de sitio por dominio, no por carpeta (documentación del 2025-12-10). Los resultados en español saldrían como «Backend from Scratch» y parecerían de una web en inglés;
  - se perdería el refuerzo de la búsqueda «aprender backend desde cero», la primera sugerencia del autocompletado, en cada título y en cada mención;
  - el español es el original, el de menos competencia y el del público «para todos». El inglés va en `/en/` hasta que Search Console diga otra cosa (punto «Revisar la opción de dos dominios», más abajo).
- [x] **Crear la organización `backendfromscratch` en GitHub** (2026-10-09; la crea el autor en la web: github.com → *Your organizations* → *New organization* → *Free*). Ojo: la clave SSH de este Mac entra en GitHub como la cuenta del trabajo, no como `GianSegura`. Antes de subir el código, una segunda clave para la cuenta personal con un alias en `~/.ssh/config` (es lo que explica la lección 9 de la Fase 1), o el remoto por HTTPS con `gh`. Se eligió HTTPS (punto 1 de «Próximos pasos»).
- [x] **Renombrar la carpeta local** (2026-10-09) a `backend-from-scratch`, con Claude Code cerrado: la sesión trabaja en esa carpeta, y su memoria y su historial van por la ruta. Comandos: `mv ~/backend-desde-cero ~/backend-from-scratch`, y dentro, `pnpm install` y `pnpm build` para comprobar que todo sigue en pie. El build falló: `<Tabs>` de Starlight carga el binario nativo de Sätteri y, sin `satteri` declarado, Vite lo metía en `dist/`, desde donde Node no encuentra el binario que pnpm guarda en `node_modules/.pnpm/`. Arreglo: `satteri` es dependencia directa de `web/` (misma versión que pide Starlight). No la borres aunque el código no la importe.
- [x] **Un dominio o dos (2026-10-04): opción 1.** Una sola web, `backenddesdecero.com`, con el inglés en `/en/`. Además se compra `backendfromscratch.com`, que solo redirige (301) a la misma página en inglés: `backendfromscratch.com/phase-0/what-is-dns/` → `backenddesdecero.com/en/phase-0/what-is-dns/`. Sirve para compartir la versión inglesa con un nombre que se entiende, y los enlaces que reciba suman para la web principal. Lo que se acepta: en Google, las páginas en inglés salen con el nombre de sitio «Backend desde cero», porque Google solo admite un nombre por dominio, no por carpeta.
- [ ] **Comprar los dominios:** `backenddesdecero.com` (principal) y `backendfromscratch.com` (redirección a `/en/`); `.dev`, opcional, como defensa. Las redirecciones se configuran en Cloudflare al desplegar.
- [ ] **Revisar la opción de dos dominios unos meses después de publicar:** si en Search Console el tráfico en inglés se acerca al español o crece más rápido, se mueve el inglés a `backendfromscratch.com` como web propia (opción 2: cada idioma con su nombre en Google, pero con los enlaces repartidos entre dos webs), con redirecciones 301 desde `/en/`. Análisis: `docs/research/2026-10-03-idiomas-y-nombres.md`.
- [x] **Público:** todos los públicos. Ninguna lección da por sabido nada de programación (decidido el 2026-10-03). Ya está en la guía de estilo.
- [ ] **Revisar las 9 lecciones de la Fase 0** con el criterio «todos los públicos»: frases que den por sabido `fetch`, DevTools o qué es una función sin explicarlo, y las secciones «Ya lo has visto».
- [x] **Revisar la spec de la lección «Qué es el backend»** (`docs/specs/2026-10-04-leccion-que-es-el-backend-design.md`): aprobada el 2026-10-04 e implementada el mismo día (plan `docs/plans/2026-10-04-leccion-que-es-el-backend.md`): es la lección 1 de la Fase 0, en español y en inglés, y las demás pasan a ser la 2 a la 9. Te queda leerla (arriba, en «Revisión de contenido»).
- [x] **¿Una lección «Qué es el backend (y en qué se diferencia del frontend)»?** Sí (2026-10-04): diseño en la spec de arriba. Propuesta del 2026-10-04. El autocompletado de Google en español muestra muchas búsquedas de principiante sin página nuestra que las responda: «qué es backend y frontend», «frontend y backend diferencias», «backend qué es y para qué sirve» o «qué es el backend de una web». Sería la primera lección de la Fase 0, antes de «Modelo cliente-servidor». También se podría ajustar el temario a «ruta para aprender backend» y «roadmap backend en español», y responder ahí a «qué estudiar para ser desarrollador backend».
- [ ] **Antes de la Fase 3:** decidir si se añade una fase corta, «Programar desde cero con JavaScript y TypeScript» (propuesta en `docs/specs/2026-10-03-seo-design.md`, §2.3).
- [x] **SEO: estructura de las URLs** (`docs/specs/2026-10-03-seo-design.md`, §2.2). La recomendación es poner el español en la raíz y traducir las rutas (`/fase-0/que-es-dns/`). **La prueba de concepto del 2026-10-03 confirma que se puede:** funcionan `hreflang`, el selector de idioma, el explorador y el sitemap, y no quedan copias de respaldo. Implementado el 2026-10-03 (plan `docs/plans/2026-10-03-seo-tecnico.md`), junto con el resto del SEO técnico. Quedan los títulos y descripciones de las lecciones (en «Revisión de contenido»).
- [ ] **¿Más idiomas?** Mismo documento. La recomendación es no añadir ninguno por ahora, y el tercero, cuando el curso esté avanzado, sería portugués de Brasil.
- [x] **Pestaña «Windows»: se quita (2026-10-07),** con el diseño de la Fase 1: WSL como única vía. Se aplica en el plan `docs/plans/2026-10-07-fase-1-piloto.md`. Lo que había: la lección 2 la tiene; las demás, no. La guía de estilo la reserva para alternativas nativas de Windows. Desde el 2026-10-03 se llama «Windows (WSL)» y sus comandos se ven como de terminal (`$`), no como de PowerShell (`PS>`), que era un error. Sigue pendiente la decisión: quitarla de la lección 2 o cambiar la guía. El diseño de la Fase 1 (§2.2) propone quitarla: WSL como única vía en Windows.
- [ ] **Laboratorio TCP: claves de narración.** Difieren del spec (`docs/specs/2026-10-03-laboratorio-tcp-design.md`, §3): el *timeout* se divide en tres frases, una por lo que se reenvía; el aviso final va aparte para no tapar la frase del último paso; el ACK que confirma todo tiene su propia frase. ¿Se actualiza el spec con las claves reales o se vuelve a las originales?
- [ ] **Laboratorio TCP: lo que recibe la aplicación en UDP.** Hoy se muestra como un solo texto («Hola, bien»), igual que en TCP. Mostrar cada datagrama por separado («Hola, » «bien») haría ver que UDP conserva los mensajes y TCP es un chorro de bytes. Es un cambio pequeño de lógica e interfaz.
- [ ] **Despliegue en Cloudflare** (Tarea 4 del plan): cuando el autor lo pida.
- [x] **Commit:** el primero, el 2026-10-09, al subir el código a GitHub.
- [x] **CI en GitHub (2026-10-07; activo desde el 2026-10-09):** el workflow `.github/workflows/ci.yml` ya está escrito, pero solo se ejecuta cuando el repositorio esté en GitHub. Al crearlo, protege `main` y marca el job «format, types, tests and build» como comprobación obligatoria: así no se puede mergear una PR con el CI en rojo. Ojo: Cloudflare despliega cada push a `main` por su cuenta, sin esperar al CI; su build sí falla con un enlace roto o un problema de SEO, pero no con un test roto.
- [ ] **Antes de publicar:** pasar Lighthouse con un móvil simulado, dar de alta Google Search Console y Bing Webmaster Tools, y comprobar las migas con la prueba de resultados enriquecidos de Google.
- [ ] **En Cloudflare,** el comando de build es `pnpm build` desde la raíz (o `pnpm --filter web build`). Las fuentes de las imágenes para redes ya se encuentran por el sistema de módulos, pero Astro necesita ejecutarse con `web/` como raíz.
- [ ] **Límite de JavaScript por página: 400 KB** (sin comprimir, contando todo lo que la página puede importar). El plan decía 300, pero una lección con laboratorio ya pesa unos 340 KB (React 208 KB y el buscador de Starlight 92 KB). ¿Te parece bien, o prefieres que se estudie aligerar los laboratorios (por ejemplo, Preact en lugar de React)?
- [ ] **Decisiones de los menores técnicos (2026-10-03), tomadas sin consultarte.** ¿Te encajan?
  - **Respaldo de Google en el laboratorio DNS:** si Cloudflare no responde (redes de empresa que lo bloquean), se pregunta a Google (8.8.8.8). Esa consulta también sale del navegador del lector hacia Google; el texto de privacidad del laboratorio ya lo dice.
  - **Los TXT se ven unidos y entre comillas,** respondan Cloudflare o Google. Coincide con `dig` cuando el TXT tiene un solo trozo (lo normal); con varios trozos (DKIM), `dig` los enseña separados y el laboratorio, unidos.
  - **Tests de clics con happy-dom** (dependencia de desarrollo nueva): un documento simulado para pulsar botones en los tests de los laboratorios, sin navegador.
  - **«Se explica en» del glosario:** por defecto, la primera lección que usa el término. Si no es la que lo explica, el YAML del término lo dice con `lesson:` (hoy en DNS, TLS, puerto, TCP, dirección IP y terminal). Al escribir lecciones nuevas, revisa el glosario: es la única parte que no se ajusta sola.

## Menores técnicos aplazados (de la revisión del código, del tema IDE y de los laboratorios)

- ~~Los menores de las tres revisiones.~~ Resueltos el 2026-10-03:
  - **`<Term>` y glosario:** ids de popover estables entre builds; el ratón ya no cierra un popover abierto con el teclado o con un clic; el glosario enlaza a la lección que explica cada término.
  - **Tema y explorador:** el prompt `$` delante de los comandos (no se copia); solo se abre la carpeta de la fase actual y se recuerdan las plegadas; el build falla si el menú tiene algo que no es una fase; `fase-N/` delante en la paginación y los requisitos al cambiar de fase; test de `lessonCount`; el fichero actual se distingue en colores forzados; fuera las claves i18n sin uso; test de `isLessonId` con rutas anidadas.
  - **Laboratorio DNS:** cancela la consulta anterior; usa Google si Cloudflare falla; anuncia dos errores iguales seguidos; cuenta bien las cadenas de CNAME; avisa si se escribe una IP (también IPv6 sin corchetes); da el nombre de REFUSED y los demás códigos; CSS sin `!important`.
  - **Laboratorio de criptografía:** clave privada ECDSA no exportable; avisa mientras genera claves sin callar los anuncios; borra la firma al cambiar el mensaje; enseña los errores; test del límite de 190 bytes.
  - **Comunes:** bordes de los campos de formulario a 3:1 (también el del buscador), `fill` compartido y tests de clics de los tres laboratorios.
- **Límite conocido del laboratorio DNS:** con subzonas delegadas (p. ej. `www.amazon.com`), el relato atribuye la cadena de alias a la zona padre. Arreglarlo pide una consulta de NS por cada destino de alias.
- **Aplazado:** si un alias lleva a un nombre que no existe (NXDOMAIN detrás de un CNAME), la respuesta final dice «Ese nombre no existe», aunque el nombre que escribiste sí existe.

## Menores aplazados (de la revisión de la lección «Qué es el backend»)

- La tabla «Frontend, backend y full stack» trata las apps del móvil como frontend, pero sus lenguajes no nombran Swift ni Kotlin. La lista viene de la spec: ¿se añaden?
- El diagrama de la compra dice «Backend de la tienda», y la historia empieza en «la app de una sala de conciertos».
- ~~En el tema claro, el sol de la figura parecía marrón.~~ Resuelto el 2026-10-04: usa su propio token, `--ide-sun` (ámbar en el claro; en el oscuro, el naranja de antes).
- ~~El test `phase-intro.test.ts` solo vigila la Fase 0.~~ Resuelto el 2026-10-07: recorre todas las fases con introducción.
- El resumen de la Fase 0 en `web/src/data/phases.ts` no menciona la lección nueva.

## Menores aplazados (de la revisión del SEO técnico)

- ~~Los nueve menores de la revisión.~~ Resueltos el 2026-10-03: rutas con tildes o mayúsculas, borrado de copias sin tocar páginas reales, paginación que respeta el frontmatter, enlaces externos en el sidebar, fases traducidas a medias (ahora el build lo impide), línea exacta en los errores de diagramas, mensaje del `noindex`, fuentes sin depender del directorio de trabajo y código obsoleto.

## Menores aplazados (de la revisión del contenido de la Fase 0)

- ~~Los diez menores de la revisión.~~ Resueltos el 2026-10-03; están al final de `docs/plans/2026-10-03-contenido-fase-0/cambios.md`.
- Queda la promesa de la portada («no hace falta… programar para empezar»): depende de la decisión «Antes de la Fase 3».
- **Ojo al editar la lección 5 en inglés:** está en 15,43 minutos de lectura (se muestra 15). Le quedan unas 14 palabras antes de pasar a 16.
