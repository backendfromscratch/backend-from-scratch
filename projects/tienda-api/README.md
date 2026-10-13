# La API de la tienda de Ana y Luis

El proyecto guiado de [Backend desde cero](https://backenddesdecero.com/): empieza en la Fase 3, «Tu primer servidor», y sigue en la Fase 4, «Diseño de APIs». Cada carpeta es el proyecto tal y como queda al final de una lección: si te atascas, compara tu código con el de la carpeta de esa lección.

| Carpeta             | Lección                        |
| ------------------- | ------------------------------ |
| `01-node`           | Qué es Node.js                 |
| `02-javascript`     | JavaScript desde cero          |
| `03-typescript`     | TypeScript con Node.js         |
| `04-servidor-http`  | Un servidor HTTP sin framework |
| `05-framework`      | Express, Fastify o Hono        |
| `06-middleware`     | Middleware                     |
| `07-validacion`     | Validar los datos de entrada   |
| `08-errores-y-logs` | Errores y logs                 |
| `09-event-loop`     | El event loop                  |
| `10-rest`           | REST                           |
| `11-errores-api`    | Errores                        |
| `12-paginacion`     | Paginación                     |
| `13-versiones`      | Versionado                     |
| `14-openapi`        | OpenAPI                        |
| `15-serializacion`  | Serialización                  |
| `16-webhooks`       | Webhooks                       |
| `17-tiempo-real`    | Tiempo real                    |

Necesitas Node.js 24 o posterior; el curso usa el 26 (con nvm, `nvm use` en la carpeta lo elige). En Linux y en WSL, Node 26 necesita además la librería `libatomic1` (`sudo apt install libatomic1`). En cada carpeta:

```sh
npm install   # instala las dependencias (si las hay)
npm test      # comprueba que todo funciona
npm start     # arranca el servidor (desde la carpeta 04)
```
