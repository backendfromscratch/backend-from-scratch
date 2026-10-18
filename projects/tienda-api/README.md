# La API de la tienda de Ana y Luis

El proyecto guiado de [Backend desde cero](https://backenddesdecero.com/): empieza en la Fase 3, «Tu primer servidor», sigue en la Fase 4, «Diseño de APIs», en la Fase 5, «Bases de datos», en la Fase 6, «Autenticación, autorización y seguridad», en la Fase 7, «Docker y contenedores», y en la Fase 8, «Despliegue e infraestructura». Cada carpeta es el proyecto tal y como queda al final de una lección: si te atascas, compara tu código con el de la carpeta de esa lección.

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
