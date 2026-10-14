# La API de la tienda de Ana y Luis

El proyecto guiado de [Backend desde cero](https://backenddesdecero.com/): empieza en la Fase 3, «Tu primer servidor», sigue en la Fase 4, «Diseño de APIs», en la Fase 5, «Bases de datos», y en la Fase 6, «Autenticación, autorización y seguridad». Cada carpeta es el proyecto tal y como queda al final de una lección: si te atascas, compara tu código con el de la carpeta de esa lección.

| Carpeta             | Lección                          |
| ------------------- | -------------------------------- |
| `01-node`           | Qué es Node.js                   |
| `02-javascript`     | JavaScript desde cero            |
| `03-typescript`     | TypeScript con Node.js           |
| `04-servidor-http`  | Un servidor HTTP sin framework   |
| `05-framework`      | Express, Fastify o Hono          |
| `06-middleware`     | Middleware                       |
| `07-validacion`     | Validar los datos de entrada     |
| `08-errores-y-logs` | Errores y logs                   |
| `09-event-loop`     | El event loop                    |
| `10-rest`           | REST                             |
| `11-errores-api`    | Errores                          |
| `12-paginacion`     | Paginación                       |
| `13-versiones`      | Versionado                       |
| `14-openapi`        | OpenAPI                          |
| `15-serializacion`  | Serialización                    |
| `16-webhooks`       | Webhooks                         |
| `17-tiempo-real`    | Tiempo real                      |
| `18-modelo`         | Modelado de datos                |
| `19-postgres`       | Conectar Node.js con PostgreSQL  |
| `20-migraciones`    | Migraciones                      |
| `21-indices`        | Índices y EXPLAIN ANALYZE        |
| `22-transacciones`  | Transacciones                    |
| `23-orm`            | Qué es un ORM: Drizzle           |
| `24-contrasenas`    | Contraseñas                      |
| `25-sesiones`       | Sesiones                         |
| `26-jwt-claves`     | JWT                              |
| `27-oauth`          | OAuth                            |
| `28-roles`          | Autorización                     |
| `29-inyeccion-xss`  | Inyección                        |
| `30-csrf-ssrf`      | CSRF y SSRF                      |
| `31-limites`        | Rate limiting                    |

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
