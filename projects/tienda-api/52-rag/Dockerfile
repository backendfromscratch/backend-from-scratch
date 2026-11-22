# La imagen de la API de la tienda, pequeña y segura (Fase 7, lección 4). Constrúyela con:
#   docker build -t tienda-api .
# compose.yaml la construye también (lección 7), para la API, el servicio migrar y, desde la Fase 9,
# el trabajador.
#
# Tres etapas, cada una desde su FROM: las dos primeras instalan y comprueban, y solo la última se
# convierte en la imagen. Lo que necesitan las primeras (TypeScript, la caché de npm, los tests) se
# queda en ellas.
#
# Tamaños, medidos el 2026-10-14 en la Fase 7, antes de las trazas y las métricas, con docker image
# ls (CONTENT SIZE: lo que se descarga, comprimido; entre paréntesis, lo que ocupa descomprimida, la
# suma de docker history):
#   la imagen de la lección 3, de una sola etapa:              145 MB (451 MB)
#   la de la lección 4, sobre node:26-slim:                     92 MB (343 MB)
#   la misma etapa final sobre node:26-alpine:                  74 MB (243 MB)
#   y sobre distroless (gcr.io/distroless/nodejs26-debian13):   66 MB (244 MB)
#   la del paso 34, con Redis y migraciones (node:26-slim):     93 MB (359 MB)
# Desde la Fase 11 (lección 5), con el modelo de embeddings, medidas el 2026-11-21 en el Mac del
# autor (Colima, arm64), lo que ocupa descomprimida (SIZE de docker image ls):
#   la del paso 50, sin Transformers.js:                        580 MB
#   la del paso 51, sin quitar nada:                           1,23 GB
#   la del paso 51, quitando lo que Linux no usa (abajo):       669 MB
# (En x64, unos 20 MB más: su onnxruntime para Linux pesa 45 MB, y el de arm64, 25.)
# El modelo no está en ninguna: se descarga la primera vez que hace falta, en un volumen.
# slim, y no alpine ni distroless: alpine usa otra biblioteca de C (musl) con la que algún paquete
# con código nativo falla, y distroless no trae ni una shell para mirar dentro del contenedor.

# Etapa 1, dependencias: todas, también las de desarrollo (TypeScript, para comprobar los tipos).
# node:26-slim, fijada por su digest.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS dependencias
WORKDIR /app
# .npmrc también: sin él, npm ci ejecutaría los scripts de instalación de los paquetes.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Etapa 2, comprobar: parte de la anterior, copia el código y comprueba los tipos. Si un tipo
# falla, la imagen no se construye. Los tests no se pasan aquí: necesitan PostgreSQL.
FROM dependencias AS comprobar
COPY . .
RUN npm run check

# Etapa 3, la imagen final: desde node:26-slim otra vez, limpia, con solo lo que hace falta para
# ejecutar la API.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS final
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Solo las dependencias de producción (--omit=dev: sin TypeScript ni drizzle-kit), y sin la caché
# que npm deja al instalar.
# Desde la Fase 11, también sin lo que Transformers.js trae para otros sistemas: onnxruntime-node,
# el motor que ejecuta el modelo, viene con sus programas para macOS, Windows y Linux, en x64 y en
# arm64 (unos 290 MB), y aquí solo hace falta el de Linux de este procesador (process.arch: x64 o
# arm64); y onnxruntime-web (unos 140 MB) es el motor para navegadores, que en Node no se usa.
# Todo en el mismo RUN que npm ci: borrar en otro RUN no achica la imagen, porque cada RUN es una
# capa, y lo borrado seguiría en la capa de antes.
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf node_modules/onnxruntime-web \
  && cd node_modules/onnxruntime-node/bin/napi-v6 \
  && rm -rf darwin win32 \
  && find linux -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} +
# El código, de la etapa comprobar, no del proyecto: BuildKit se salta las etapas de las que la
# final no toma nada, y entonces los tipos no se comprobarían nunca.
COPY --from=comprobar /app/src ./src
# Las migraciones y los datos de práctica, con sus scripts: el servicio migrar de compose.yaml usa
# esta misma imagen, y crear-admin (Fase 8) se ejecuta dentro de ella, en el servidor. Y el
# trabajador (Fase 9), el otro proceso de la tienda: la misma imagen, con otro comando. Desde la
# Fase 11, también crear-clave: la clave de API de un agente que entra por MCP se crea donde está la
# base de datos, en Compose o en el servidor. Y embeddings y muchos-vectores (lección 5): los
# vectores que faltan y la tabla grande para EXPLAIN, que también se ejecutan junto a la base de
# datos. Y, desde la lección 6, las páginas de ayuda (ayuda/) y el script que las carga.
COPY --from=comprobar /app/bd ./bd
COPY --from=comprobar /app/ayuda ./ayuda
COPY --from=comprobar /app/scripts/migrar.ts /app/scripts/cargar-datos.ts /app/scripts/crear-admin.ts /app/scripts/crear-clave.ts /app/scripts/trabajador.ts /app/scripts/embeddings.ts /app/scripts/muchos-vectores.ts /app/scripts/ayuda.ts ./scripts/
# La carpeta del modelo de embeddings (Fase 11), del usuario node: Compose monta en ella un volumen
# (compose.yaml), y un volumen nuevo empieza con el dueño de la carpeta de la imagen. Sin esto sería
# de root, y la tienda, que no es root, no podría descargar el modelo.
RUN mkdir modelos && chown node:node modelos
ENV NODE_ENV=production HOST=0.0.0.0
# No como root: node es un usuario sin privilegios que trae la imagen. Si alguien se cuela en la
# API, no puede cambiar su código (es de root) ni instalar nada.
USER node
EXPOSE 3000
# Cada 10 segundos, Docker pregunta a /salud si la tienda está bien, y docker ps lo enseña: healthy
# o unhealthy. La imagen no trae curl, así que pregunta con el fetch de Node.
HEALTHCHECK --interval=10s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/salud').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Desde la Fase 10 (lección 4), con --import: src/instrumentacion.ts se carga antes que la tienda,
# para las trazas. Sin OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, no hace nada.
CMD ["node", "--import", "./src/instrumentacion.ts", "src/servidor.ts"]
