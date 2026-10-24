# La API de la tienda de Ana y Luis

El proyecto guiado de [Backend desde cero](https://backenddesdecero.com/): empieza en la Fase 3, «Tu primer servidor», sigue en la Fase 4, «Diseño de APIs», en la Fase 5, «Bases de datos», en la Fase 6, «Autenticación, autorización y seguridad», en la Fase 7, «Docker y contenedores», en la Fase 8, «Despliegue e infraestructura», y en la Fase 9, «Arquitectura y escalado». Cada carpeta es el proyecto tal y como queda al final de una lección: si te atascas, compara tu código con el de la carpeta de esa lección.

| Carpeta             | Lección                         |
| ------------------- | ------------------------------- |
| `01-node`           | Qué es Node.js                  |
| `02-javascript`     | JavaScript desde cero           |
| `03-typescript`     | TypeScript con Node.js          |
| `04-servidor-http`  | Un servidor HTTP sin framework  |
| `05-framework`      | Express, Fastify o Hono         |
| `06-middleware`     | Middleware                      |
| `07-validacion`     | Validar los datos de entrada    |
| `08-errores-y-logs` | Errores y logs                  |
| `09-event-loop`     | El event loop                   |
| `10-rest`           | REST                            |
| `11-errores-api`    | Errores                         |
| `12-paginacion`     | Paginación                      |
| `13-versiones`      | Versionado                      |
| `14-openapi`        | OpenAPI                         |
| `15-serializacion`  | Serialización                   |
| `16-webhooks`       | Webhooks                        |
| `17-tiempo-real`    | Tiempo real                     |
| `18-modelo`         | Modelado de datos               |
| `19-postgres`       | Conectar Node.js con PostgreSQL |
| `20-migraciones`    | Migraciones                     |
| `21-indices`        | Índices y EXPLAIN ANALYZE       |
| `22-transacciones`  | Transacciones                   |
| `23-orm`            | Qué es un ORM: Drizzle          |
| `24-contrasenas`    | Contraseñas                     |
| `25-sesiones`       | Sesiones                        |
| `26-jwt-claves`     | JWT                             |
| `27-oauth`          | OAuth                           |
| `28-roles`          | Autorización                    |
| `29-inyeccion-xss`  | Inyección                       |
| `30-csrf-ssrf`      | CSRF y SSRF                     |
| `31-limites`        | Rate limiting                   |
| `32-dockerfile`     | Dockerfile                      |
| `33-imagen-pequena` | Multi-stage                     |
| `34-compose`        | Compose                         |
| `35-produccion`     | Producción, nginx y HTTPS       |
| `36-despliegue`     | CI/CD                           |
| `37-cola`           | Colas                           |
| `38-cache`          | Caché                           |
| `39-escalado`       | Escalado                        |
| `40-sin-cortes`     | Sin cortes                      |
| `41-eventos`        | Eventos                         |
| `42-tests`          | Tests                           |
| `43-contrato`       | Contrato                        |
| `44-trazas`         | Trazas                          |
| `45-metricas`       | Métricas                        |
| `46-alertas`        | Alertas                         |

Necesitas Node.js 24 o posterior; el curso usa el 26 (con nvm, `nvm use` en la carpeta lo elige). En Linux y en WSL, Node 26 necesita además la librería `libatomic1` (`sudo apt install libatomic1`). En cada carpeta:

```sh
npm install   # instala las dependencias (si las hay)
npm test      # comprueba que todo funciona
npm start     # arranca el servidor (desde la carpeta 04)
```

## Fase 5: la base de datos

Desde la carpeta `18-modelo`, el proyecto usa PostgreSQL 18 (el servidor guarda en él sus datos desde la `19-postgres`), y los tests también lo necesitan: la introducción de la Fase 5 explica cómo instalarlo y cómo crear el usuario `tienda` con sus dos bases de datos, `tienda` (la tuya) y `tienda_test` (la de los tests, que la vacían y la vuelven a llenar cada vez). El servidor y los scripts encuentran la base de datos en la variable `DATABASE_URL`: copia `.env.ejemplo` como `.env` y pon tu contraseña. Los tests usan la de `test/.env`.

```sh
npm run bd:crear     # carpetas 18 y 19: crea las tablas con los datos de ejemplo (borra las que hubiera)
npm run bd:migrar    # desde la 20: aplica las migraciones que falten
npm run bd:datos     # desde la 20: los datos de ejemplo, en una base de datos vacía; desde la 24,
                     # también las cuentas de práctica, aunque la base de datos ya tenga datos
```

## Fase 6: las cuentas de práctica

Desde la carpeta `24-contrasenas`, la tienda tiene cuentas. Estas cuatro son para practicar (están en `bd/cuentas.sql`, con el hash de su contraseña): no uses estas contraseñas para nada más.

| Email                 | Contraseña             | Rol (desde la `28-roles`) |
| --------------------- | ---------------------- | ------------------------- |
| `ana@tienda.example`  | `ana-practica-2026`    | admin                     |
| `luis@tienda.example` | `luis-practica-2026`   | admin                     |
| `carmen@ejemplo.com`  | `carmen-practica-2026` | cliente                   |
| `pablo@ejemplo.com`   | `pablo-practica-2026`  | cliente                   |

Si vienes de la Fase 5 con tu base de datos, después de `npm run bd:migrar` ejecuta `npm run bd:datos`: añade las cuentas que falten y no repite los productos. En la `28-roles`, vuelve a ejecutarlo después de migrar: pone a cada cuenta su rol.

## Fase 7: con Docker

Desde la carpeta `32-dockerfile`, el proyecto trae un `Dockerfile` para construir la imagen de la API, y desde la `34-compose`, un `compose.yaml` que arranca la tienda entera: la API, PostgreSQL 18 y Redis 8, cada uno en su contenedor. Necesitas Docker: la introducción de la Fase 7 explica cómo instalarlo. Los puertos se publican solo en `127.0.0.1`, así que solo llega a ellos tu ordenador.

**Sin Docker**, todo sigue como en las fases anteriores: Node 26 y PostgreSQL en tu ordenador, `npm run bd:migrar`, `npm run bd:datos` y `npm start`. Sin `REDIS_URL`, los límites de intentos se guardan en la memoria del servidor.

**Con Docker** (desde la `34-compose`), copia `.env.ejemplo` como `.env`, genera sus secretos como dice el fichero y pon en `POSTGRES_PASSWORD` una contraseña nueva (`openssl rand -hex 24`). Después:

```sh
docker compose up --build                  # construye la imagen y arranca todo: la API, en el 3000 o el 3001
docker compose up --build --scale api=2    # dos copias de la API (3000 y 3001) que comparten Redis
docker compose down                        # lo para; con -v, borra también los datos
docker compose port api 3000               # en qué puerto de tu ordenador ha quedado la API
```

Antes de arrancar la API, Compose aplica las migraciones y carga los datos de práctica (el servicio `migrar`). Esa base de datos es otra, en un volumen de Docker, no la de tu ordenador, y no choca con ella: no publica ningún puerto. Iniciar sesión con el proveedor de práctica (`npm run proveedor`) no funciona desde los contenedores, porque dentro de un contenedor `localhost` es el propio contenedor; con email y contraseña, sí.

Tamaño de la imagen (`CONTENT SIZE` de `docker image ls`, el 2026-10-14): 145 MB la de la `32-dockerfile`, de una etapa; 92 MB la de la `33-imagen-pequena`, multi-stage sobre `node:26-slim`. Con la misma etapa final sobre `node:26-alpine` serían 74 MB, y sobre distroless (`gcr.io/distroless/nodejs26-debian13`), 66 MB.

Los tests del almacén de Redis (`test/almacen-redis.test.ts`, desde la `34-compose`) necesitan un Redis. Sin él se saltan, y el resto pasa. Para probarlos, arranca uno y quita el `#` de `REDIS_URL_TESTS` en `test/.env`:

```sh
docker run --rm -d --name redis-tests -p 127.0.0.1:6379:6379 redis:8
```

## Fase 8: en un servidor

La `35-produccion` trae lo que cambia al poner la tienda en un servidor, junto a `compose.yaml` (que sigue siendo el de tu ordenador):

- `compose.produccion.yaml`: la misma tienda, con `restart: unless-stopped`, la imagen `${IMAGEN:-tienda-api}` (la que construye `--build`, o la publicada si defines `IMAGEN`), la subred de la red fijada (`172.18.0.0/16`) y sin cuentas de práctica: `migrar` carga solo los productos de ejemplo (`--sin-cuentas`). La API sigue publicada solo en `127.0.0.1`.
- `.env.produccion.ejemplo`: la configuración de un servidor. Cópialo como `.env` **en el servidor**, genera ahí los secretos (`openssl rand -base64 32` y `openssl rand -hex 24`) y cambia `tienda.example` por tu nombre. Las cuatro `OIDC_*` quedan comentadas: sin proveedor de identidad, la tienda funciona con email y contraseña.
- `nginx/tienda.conf`: nginx delante, con el 80 redirigiendo al 443, las cabeceras `X-Forwarded-For` y `X-Forwarded-Proto`, las dos copias de la API en un `upstream`, y su propio `location` para los eventos de un pedido. Lleva las instrucciones para instalarlo. Tal como está usa el certificado de tu propia autoridad (`/etc/ssl/tienda/`, camino gratuito); con Let's Encrypt, `certbot --nginx` cambia esas dos líneas.
- `despliegue/copia-seguridad.sh`, con `tienda-copia.service` y `tienda-copia.timer`: un `pg_dump` cada noche a las 03:30, en `copias/` (solo legible por tu usuario), guardado 7 días. Tu usuario tiene que estar en el grupo `docker` (equivale a root: ten cuidado) y cambiar `User` y las rutas del `.service` si no es `ubuntu` y `/opt/tienda`.

```sh
cp .env.produccion.ejemplo .env && chmod 600 .env    # y genera los secretos en .env
docker compose -f compose.produccion.yaml up -d --build
docker compose -f compose.produccion.yaml run --rm api node scripts/crear-admin.ts tu@email.com
despliegue/copia-seguridad.sh                        # una copia ahora
```

`crear-admin` crea tu cuenta de admin con una contraseña larga al azar, la enseña una sola vez y guarda solo su hash. Con `PROXY_CONFIABLE`, la API lee la IP del visitante en `X-Forwarded-For` solo cuando la petición llega de esa dirección (la puerta de enlace de la red de Compose: `docker network inspect tienda_default`). Solo se admite un salto de proxy (se lee la última entrada de `X-Forwarded-For`): con otro proxy delante, como el de Cloudflare, el limitador vería las direcciones de ese proxy.

`36-despliegue` publica la imagen y la despliega sin que GitHub tenga que entrar en tu servidor:

- `.github/workflows/publicar.yml`: en cada pull request instala, comprueba los tipos y pasa los tests con una PostgreSQL 18; en cada push a `main`, además construye la imagen para `linux/amd64` y `linux/arm64` y la publica en `ghcr.io/<tu-usuario>/tienda-api` con las etiquetas `sha-<7 letras del commit>` y `main`. GitHub solo ejecuta los workflows de la raíz de un repositorio: aquí, dentro de la carpeta del paso, no hace nada. Copia el contenido del paso a la raíz de tu propio repositorio y se activa.
- `despliegue/desplegar.sh`, con `tienda-despliegue.service` y `tienda-despliegue.timer`: cada dos minutos el servidor pregunta si `IMAGEN` (en `.env`, por ejemplo `ghcr.io/tu-usuario/tienda-api:main`) apunta a una imagen nueva. Si no, no hace nada ni escribe nada. Si sí: copia de seguridad, migraciones, API nueva, y espera a `/salud`; si no llega a estar sana, vuelve a la imagen anterior (guardada como `:anterior`) y termina con error. Un despliegue a la vez (`flock`). Se instala como la copia de seguridad, con el mismo usuario.

```sh
# en el servidor: sigue la imagen publicada (pon la tuya)
echo 'IMAGEN=ghcr.io/tu-usuario/tienda-api:main' >> .env
docker compose -f compose.produccion.yaml pull api       # descarga la publicada (build no se usa)
sudo cp despliegue/tienda-despliegue.service despliegue/tienda-despliegue.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now tienda-despliegue.timer
journalctl -u tienda-despliegue                          # lo que ha hecho
```

La primera vez que se publica la imagen, ghcr.io la crea **privada**: en su página de paquete (Package settings → Change visibility) hazla pública, o el servidor no podrá descargarla sin credenciales. Una imagen que el script dio por mala no se reintenta sola (cada intento son segundos sin API): si el fallo era del entorno y no de la imagen (un `.env` mal escrito, por ejemplo), arréglalo y borra `.despliegue-fallido` para que la pruebe otra vez.

Volver atrás cambia el código, no los datos: por eso el script hace una copia antes de migrar.

## Fase 9: la cola, el trabajador, Mailpit y la caché

Desde la `37-cola`, lo que una petición no tiene por qué esperar va a una cola de trabajos en Redis (con BullMQ): cuando un pedido pasa a pagado, un aviso por cada URL de la empresa de reparto (con la cabecera `X-Id-Evento`, la misma en cada reintento) y el correo de confirmación para quien lo hizo. Los hace otro proceso, el trabajador (`scripts/trabajador.ts`): el mismo código y la misma imagen que la API, con otro comando. Un trabajo que falla se vuelve a intentar, hasta cinco intentos en total, esperando 1, 2, 4 y 8 segundos entre uno y otro. Redis guarda ahora la cola en disco (`--appendonly yes`, en el volumen `redis`).

Con Docker, `docker compose up --build` arranca también el trabajador y Mailpit, un servidor de correo de práctica: recibe los correos de la tienda, no los manda a nadie y los enseña en `http://localhost:8025`.

```sh
docker compose up --build --wait                  # todo, en segundo plano
npm run pasarela -- 21                            # la pasarela de pago avisa: el pedido 21, pagado
curl -s http://localhost:8025/api/v1/messages     # el correo, en la bandeja de Mailpit (o en el navegador)
docker compose logs trabajador                    # lo que ha hecho el trabajador
docker compose stop trabajador                    # sin trabajador, los trabajos esperan en la cola…
docker compose start trabajador                   # …y salen en cuanto vuelve
```

`npm run pasarela` lee `WEBHOOK_SECRET` de tu `.env`, el mismo que usa la API en Compose, y llama a la API en el puerto 3000 (otro, con `PORT=3001 npm run pasarela -- 21`).

**Sin Docker**, la tienda sigue funcionando sin Redis: los trabajos se hacen en el mismo proceso de la API, en cuanto llegan y sin reintentos, como hasta la Fase 8. Con Redis en tu ordenador (`REDIS_URL` en `.env`), arranca el trabajador en otra terminal con `npm run trabajador`. Sin `SMTP_URL`, no sale ningún correo: el log dice cuál habría salido. En un servidor, `SMTP_URL` es opcional (`.env.produccion.ejemplo` explica qué pide un proveedor de correo), y `desplegar.sh` actualiza el trabajador con la API.

Las pruebas de carga se hacen con autocannon (`npm run carga`), con la tienda arrancada:

```sh
npm run carga -- -d 10 http://127.0.0.1:3000/v2/productos   # 10 segundos de peticiones, y la tabla de resultados
```

Los tests de la cola (`test/cola.test.ts`) necesitan Redis, como los del almacén: sin `REDIS_URL_TESTS` se saltan los que lo usan.

Desde la `38-cache`, el catálogo (la lista de productos y cada producto) se guarda un minuto en una caché, un segundo Redis (el servicio `cache`, con `CACHE_URL`): como mucho 64 MB, borra las claves menos leídas cuando se llena y no guarda nada en disco, al revés que el de la cola. Crear, cambiar (`PATCH /v2/productos/{id}`, nuevo en este paso: el nombre o el precio, solo admin) o borrar un producto, hacer un pedido, cambiar su cantidad y cancelarlo (los tres cambian el stock) borran de la caché lo que ha cambiado; comprar sigue comprobando el stock en PostgreSQL. Sin `CACHE_URL`, o con la caché caída o colgada (ninguna orden la espera más de 200 ms), todo se lee de PostgreSQL, como antes. Para mirar dentro: `docker compose exec cache redis-cli keys '*'`. Sus tests (`test/cache.test.ts`) usan la base 2 del Redis de `REDIS_URL_TESTS`.

Desde la `39-escalado`, la API puede ir en varias copias (`docker compose up --scale api=2`, cada una en su puerto, el 3000 o el 3001: `docker compose port --index 1 api 3000`). Lo único que vivía en la memoria de una copia, los avisos de los cambios de los pedidos que sigue `GET /v2/pedidos/{id}/eventos`, va ahora por Redis (pub/sub, en el canal `tienda:pedidos`, `src/eventos-pedidos.ts`): un pedido cancelado a través de una copia le llega a quien lo sigue en la otra. Cada copia se suscribe al canal la primera vez que lo necesita. Si Redis se corta, quien sigue un pedido no recibe los cambios; cuando vuelve, la API cierra esos flujos, y el navegador (`EventSource`) se conecta otra vez y recibe el estado de ahora. Sin `REDIS_URL`, siguen en la memoria del proceso, como antes. Para verlos pasar: `docker compose exec redis redis-cli subscribe tienda:pedidos`. Sus tests (`test/escalado.test.ts`) usan el Redis de `REDIS_URL_TESTS`, con un canal propio en cada pasada.

Desde la `40-sin-cortes`, el servidor corre dos copias de la API, `api-a` (puerto 3000) y `api-b` (3001), los dos puertos que nginx ya tenía en su `upstream`, así que no hay que tocar nginx (en `nginx/tienda.conf` solo cambia el comentario del `upstream`). `desplegar.sh` las cambia de una en una: `api-b` con la imagen nueva y, cuando Docker la da por sana, 10 segundos de margen para nginx y después `api-a`; al final, el trabajador, y `docker image prune` borra las imágenes sin etiqueta (quedan la nueva y la anterior). Si una copia nueva no llega a estar sana (deja de esperar en cuanto Docker la da por `unhealthy`), las que ya ha cambiado vuelven a la imagen anterior, también de una en una. El primer despliegue de este paso quita la copia única de los pasos anteriores (el servicio `api`, que estará en el 3000 o en el 3001) cuando la copia nueva del otro puerto ya atiende: si la vieja está en el 3001, empieza por `api-a`. Al recibir `SIGTERM`, la API se apaga sin cortar a nadie (`src/apagado.ts`): deja de aceptar conexiones, termina las peticiones que tiene a medias, cierra los flujos de eventos y los WebSocket (sus clientes se vuelven a conectar, a la otra copia), y después PostgreSQL y Redis, todo en 8 segundos como mucho; mientras, `/salud` contesta 503. nginx repite en la otra copia lo que la que se apaga rechaza, aunque sea un POST, siempre que Docker no ponga su `docker-proxy` delante de los puertos publicados: con él (viene encendido), el puerto acepta la conexión y la corta, y nginx no repite un POST que ya ha mandado (502). Así que en el servidor, una sola vez, antes del primer despliegue de este paso, se apaga en la configuración de Docker, `/etc/docker/daemon.json`. Si seguiste la Fase 8, ese fichero ya existe, con los límites de los logs de su lección 3, que no hay que perder; míralo primero:

```sh
cat /etc/docker/daemon.json
```

Si tiene esos límites y nada más, o no existe («No such file or directory»), escríbelo entero, con ellos y la clave nueva:

```sh
sudo tee /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "userland-proxy": false
}
EOF
```

Si tiene otros ajustes, ábrelo con `sudo nano /etc/docker/daemon.json` y añade `"userland-proxy": false` dentro de sus llaves, sin borrar nada, con una coma detrás del ajuste anterior. Después:

```sh
sudo systemctl restart docker   # para y arranca todos los contenedores, una vez
```

Si Docker no arranca, el JSON tiene un error: `sudo journalctl -u docker -n 20` dice cuál.

Los puertos de `127.0.0.1` siguen sirviendo en el propio servidor y cerrados desde fuera, y la API sigue viendo a nginx llegar desde `172.18.0.1` (`PROXY_CONFIABLE` no cambia). Mientras no lo hagas, `desplegar.sh` lo avisa en cada despliegue. Sus tests: `test/apagado.test.ts`, y `test/despliegue-ficheros.test.ts`, que ejecuta `desplegar.sh` con un `docker` de mentira (`test/docker-falso.sh`).

Desde la `41-eventos`, pagar un pedido ya no pone nada en la cola: en una sola transacción, apunta el evento de la pasarela, pasa el pedido a pagado y guarda sus trabajos (los avisos y el correo) en la tabla `eventos_salientes` (la migración `011`). Si la API se cae justo después, o el Redis de la cola no contesta, los trabajos ya están en PostgreSQL. El trabajador los reparte (`src/salientes.ts`): al arrancar y cada segundo, coge los que no se han enviado (`FOR UPDATE SKIP LOCKED`: dos trabajadores nunca cogen el mismo), los pone en la cola y apunta cuándo (`enviado_en`); si Redis falla o no contesta, no apunta nada, y lo intenta otra vez un segundo después; si va lento, apunta los que han llegado en 2 segundos y deja el resto para la vuelta siguiente. Un trabajo puede llegar a la cola dos veces (el trabajador se cae después de encolarlo y antes de apuntarlo), así que cada uno lleva su id (`correo-<pedido>`; `aviso-<id del pago>-<aviso>`), y BullMQ no apunta dos veces el mismo. Sin Redis, los reparte la propia API, y cada trabajo se hace en ese proceso, como antes. Para mirar la tabla: `docker compose exec db psql -U tienda -c 'SELECT id, tipo, creado_en, enviado_en FROM eventos_salientes'`. Sus tests: `test/eventos.test.ts`.

## Fase 10: tests, contrato, trazas, métricas y alertas

Desde la `42-tests`, hay dos scripts más. `npm run e2e` prueba la tienda de verdad, la de Compose, solo con `fetch`: crea una cuenta, inicia sesión, hace un pedido, lo paga con la pasarela (`npm run pasarela`) y espera a que el correo llegue a Mailpit. Necesita la tienda arrancada (`docker compose up -d --build --wait`) y lee `BASE_URL` (por defecto `http://127.0.0.1:3000`; si tu API quedó en el 3001, `BASE_URL=http://127.0.0.1:3001 npm run e2e`) y `MAILPIT_URL` (por defecto `http://127.0.0.1:8025`). Sus tests están en `test/e2e/`. `npm run cobertura` pasa `npm test` con la opción de cobertura de Node y enseña qué líneas de `src/` no ejecuta ningún test. `npm test` solo corre `test/*.test.ts`: Node, sin eso, también ejecutaría `test/e2e/`, que sin tienda arrancada falla. Los tests unitarios nuevos de la firma están en `test/firma.test.ts`.

Desde la `43-contrato`, la API comprueba que sus respuestas tienen la forma que promete su contrato (`/v2/openapi.json`). `src/contrato-respuestas.ts` compila cada respuesta del documento con Ajv y la usan dos cosas: los tests (`test/contrato.ts`, `cumpleContrato(res, 'get', '/pedidos/{id}')`, con un caso por ruta en `test/contrato.test.ts`) y un middleware sobre `/v2`, que `VALIDAR_RESPUESTAS` controla: `no` (nada, el valor por defecto), `registrar` (un `warn` «respuesta fuera del contrato» con el `requestId`, la ruta, el estado y los fallos, sin el cuerpo, que puede llevar datos personales) o `fallar` (un 500 en su lugar). `test/.env` usa `fallar`: todos los tests, además de lo suyo, son tests del contrato. `contrato.json` es el contrato publicado, guardado en Git: si el documento cambia, `npm test` falla hasta que lo regeneres con `npm run contrato` y se vea el cambio en el diff. Está montado el primero después del registro, así que ve también lo que responden los middleware antes de llegar a la ruta (la comprobación contra CSRF, la sesión). No mira lo que no tiene cuerpo JSON (un 204, el flujo de eventos; un `HEAD` se valida como su `GET`), ni los 405 de un método que la ruta no tiene, ni ningún 5xx: un fallo del servidor ya lo registra `app.onError`, y no es que la respuesta rompa el contrato. Al escribir los tests de contrato, leyendo el código, aparecieron huecos del contrato: no decía que las rutas con cuerpo responden 400 (JSON mal escrito) y 415 (sin `Content-Type: application/json`), ni que `POST /v2/cuentas`, `POST /v2/sesion`, `DELETE /v2/sesion` y `POST /v2/webhooks/pagos` pueden responder 403 (la comprobación contra CSRF, con la cookie de otra web). Los 400 y 415 los encontró la validación al correr todos los tests con `fallar`; los 403, no: se vieron al leer el código, y hay un test para cada uno. `npm run carga -- -d 10 http://127.0.0.1:3000/v2/productos` cuesta con `registrar` o `fallar` alrededor de un 12 % de peticiones por segundo (de unas 14 100 a unas 12 400 en una prueba con 10 conexiones): mídelo en tu máquina antes de activarlo en producción.

Desde la `44-trazas`, la API y el trabajador dejan trazas con OpenTelemetry: `src/instrumentacion.ts` se carga antes que la tienda (`node --import ./src/instrumentacion.ts`, en `npm start`, `npm run dev`, `npm run trabajador`, el `CMD` del `Dockerfile` y el comando del trabajador en los dos Compose) y, solo si hay `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, manda los spans por OTLP a esa URL; sin ella no arranca nada, y la tienda funciona como antes. `compose.yaml` no cambia: `docker compose -f compose.yaml -f compose.observabilidad.yaml up -d --build --wait` le añade Jaeger (la web en `http://localhost:16686`; las trazas se guardan en memoria) y les pone a la API y al trabajador la URL y su nombre (`OTEL_SERVICE_NAME`: `tienda-api`, `tienda-trabajador`). Para no escribir los dos ficheros cada vez, `COMPOSE_FILE=compose.yaml:compose.observabilidad.yaml` en tu `.env`. Cada petición tiene un solo span de servidor, el de `@hono/otel`, con la plantilla de la ruta (`GET /v2/pedidos/:id`) y el `requestId` como `tienda.request_id`: en Jaeger, busca por la etiqueta `tienda.request_id=<el X-Request-Id de la respuesta>`. Dentro, un span por cada consulta a PostgreSQL y cada orden a Redis (solo dentro de una petición o un trabajo: las consultas del repartidor cada segundo no hacen trazas sueltas), y los avisos a la empresa de reparto (`node:http`). Las líneas del log llevan `trace_id` y `span_id`. Un pago es una sola traza, de la API al trabajador: el evento saliente guarda la traza en la que se creó (la columna `contexto`, migración `012`, con el `traceparent` del estándar W3C), el repartidor apunta el trabajo en la cola dentro de esa traza y BullMQ (`bullmq-otel`) la lleva hasta el trabajador. Los tests, con los spans en memoria, en `test/instrumentacion.test.ts`. Las trazas necesitan Node 24.11.1 o posterior (`module.registerHooks`; `engines` lo dice). Una traza no lleva lo que el log no lleva: `url.full` va sin la query (la vuelta del proveedor trae el código y el `state`), y los spans de Redis solo dicen la orden y de qué es la clave (`ZADD limites:?`), sin el email ni la IP de los límites. En producción no hay Jaeger: si tienes dónde mandar las trazas, pon su URL en el `.env` del servidor (`.env.produccion.ejemplo`).

Desde la `45-metricas`, la tienda también mide. Una métrica es un número que se mide a lo largo del tiempo; Prometheus las guarda y Grafana las dibuja. `compose.observabilidad.yaml` añade los dos servicios: Prometheus en `http://localhost:9090` (con `--web.enable-otlp-receiver`, para recibir por OTLP lo que manda la tienda, y las métricas en un volumen) y Grafana en `http://localhost:3100`, **sin contraseña**: entra como administrador (`GF_AUTH_ANONYMOUS_ENABLED`), y por eso solo se publica en `127.0.0.1`; en un servidor, nunca así. La API y el trabajador mandan sus métricas a `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` (la URL entera, `http://prometheus:9090/api/v1/otlp/v1/metrics`), cada 5 segundos; sin esa variable no arranca nada (`src/instrumentacion.ts`). Grafana nace provisionada, desde ficheros de `observabilidad/grafana/`: las fuentes (Prometheus, en `provisioning/datasources/`) y el panel «La tienda» (`paneles/tienda.json`), con las tres de RED (peticiones por segundo, errores 5xx y duración p99, por plantilla de ruta, con la métrica de `@hono/otel`, `http_server_request_duration_seconds`), los pedidos pagados por minuto, los trabajos esperando en la cola y las respuestas fuera del contrato. Las métricas propias están en `src/metricas.ts`: `tienda.pedidos.pagados` (v2.ts, solo cuando el pago cambia de verdad el estado), `tienda.respuestas.fuera_de_contrato` (con la ruta del contrato) y el indicador `tienda.cola.esperando`, que se lee de la cola con un tiempo máximo; si Redis no contesta, no observa nada, pero el SDK sigue mandando el último valor que vio (temporalidad acumulada): la gráfica no se corta, se queda plana. Cuidado con los atributos: cada combinación distinta es una serie para siempre, así que solo llevan plantillas de ruta y códigos de estado, nunca una URL, un id ni un email. Con la tienda arrancada, `npm run carga -- -c 10 -d 30 http://localhost:3000/v2/productos` y mira cómo se mueve el panel. Los tests, con las métricas en memoria, en `test/metricas.test.ts`. Las alertas llegan en la `46`.

Desde la `46-alertas`, la tienda dice si está bien de tres maneras. `GET /salud` no cambia (la usan el `HEALTHCHECK` y `desplegar.sh`: PostgreSQL contesta y la copia no se está apagando). `GET /salud/viva` (liveness) solo dice que el proceso contesta, sin preguntar a nadie: si mirara la base de datos, un corte de PostgreSQL haría reiniciar todas las copias, y eso no arregla nada. `GET /salud/lista` (readiness) pregunta a PostgreSQL, al Redis de la cola y al de la caché, cada uno con 500 ms como mucho (`src/salud.ts`), y responde `{ estado, comprobaciones: { bd, cola, cache } }` con `ok`, `falla` o `sin-configurar` en cada uno: 503 si falla la base de datos o la cola; la caché se dice, pero no cuenta. Arregla los tres fallos que dejó la Fase 9: los límites de intentos esperan a Redis 200 ms como mucho y, si no contesta, cada uno hace lo que dice su `siFalla` (`src/limites.ts`): los dos de iniciar sesión se cierran (503 «No se pueden comprobar los intentos», con `Retry-After: 5`) y el de crear cuentas se abre (deja pasar, con un `warn` en el log como mucho una vez por segundo); `src/bd.ts` escucha el `'error'` de las conexiones prestadas, así que un corte de PostgreSQL en mitad de una transacción ya no para el proceso; y `desplegar.sh` solo da una copia por sana si la ve sana dos veces, con 5 segundos entre una y otra y el mismo `RestartCount`. Hay una métrica más, `tienda.salientes.antiguedad` (en Prometheus, `tienda_salientes_antiguedad_seconds`): los segundos que lleva sin enviar el evento saliente más antiguo, leídos de PostgreSQL (no de Redis, para que siga funcionando cuando el que falla es Redis). Grafana nace con tres reglas de alerta (`observabilidad/grafana/provisioning/alerting/reglas.yaml`): más de un 5 % de respuestas 5xx en `/v2` durante 2 minutos, un p99 de `/v2` de más de 0,5 s durante 2 minutos y un evento saliente sin enviar desde hace más de 2 minutos; los umbrales, medidos con `npm run trafico` (el razonamiento, en el fichero). Avisan por correo (`contacto.yaml` y `politica.yaml`): Grafana manda a Mailpit por SMTP (`GF_SMTP_*`, en `compose.observabilidad.yaml`), y llegan a `http://localhost:8025`. `npm run trafico` es una clienta de práctica que compra sin parar hasta Ctrl + C: inicia sesión, compra una taza, la paga con la pasarela y cancela el pedido (para no vaciar el stock), y escribe una línea por vuelta con los códigos. Con él en marcha, `docker compose pause redis` congela el Redis de la cola: los pagos siguen respondiendo, los inicios de sesión dan 503 al momento y los eventos salientes dejan de salir, y llegan dos alertas; con `docker compose unpause redis`, salen los correos que esperaban. `docs/postmortem.md` es la plantilla de un postmortem sin culpables. Los tests nuevos están en `test/salud.test.ts` y `test/limites-fallos.test.ts`.
