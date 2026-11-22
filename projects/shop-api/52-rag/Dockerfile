# The image of the shop's API, small and safe (Phase 7, lesson 4). Build it with:
#   docker build -t shop-api .
# compose.yaml builds it too (lesson 7), for the API, the migrate service and, since Phase 9, the
# worker.
#
# Three stages, each from its own FROM: the first two install and check, and only the last one
# becomes the image. What the first ones need (TypeScript, npm's cache, the tests) stays in them.
#
# Sizes, measured on 2026-10-14 in Phase 7, before the traces and the metrics, with docker image ls
# (CONTENT SIZE: what's downloaded, compressed; in parentheses, what it takes up uncompressed, the
# sum of docker history):
#   the image from lesson 3, with a single stage:              145 MB (451 MB)
#   the one from lesson 4, on node:26-slim:                     92 MB (343 MB)
#   the same final stage on node:26-alpine:                     74 MB (243 MB)
#   and on distroless (gcr.io/distroless/nodejs26-debian13):    66 MB (244 MB)
#   step 34's, with Redis and the migrations (node:26-slim):    93 MB (359 MB)
# Since Phase 11 (lesson 5), with the embedding model, measured on 2026-11-21 on the author's Mac
# (Colima, arm64), what it takes up uncompressed (SIZE in docker image ls):
#   step 50's, without Transformers.js:                         580 MB
#   step 51's, removing nothing:                               1.23 GB
#   step 51's, removing what Linux doesn't use (below):         669 MB
# (On x64, about 20 MB more: its onnxruntime for Linux weighs 45 MB, and arm64's, 25.)
# The model is in none of them: it's downloaded the first time it's needed, into a volume.
# slim, and not alpine or distroless: alpine uses another C library (musl) that some package with
# native code fails with, and distroless doesn't even bring a shell to look inside the container.

# Stage 1, dependencies: all of them, the development ones too (TypeScript, to check the types).
# node:26-slim, pinned by its digest.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS dependencies
WORKDIR /app
# .npmrc too: without it, npm ci would run the packages' install scripts.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Stage 2, check: starts from the previous one, copies the code and checks the types. If a type
# fails, the image isn't built. The tests don't run here: they need PostgreSQL.
FROM dependencies AS check
COPY . .
RUN npm run check

# Stage 3, the final image: from node:26-slim again, clean, with only what's needed to run the
# API.
FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS final
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Only the production dependencies (--omit=dev: without TypeScript or drizzle-kit), and without the
# cache npm leaves behind when installing.
# Since Phase 11, also without what Transformers.js brings for other systems: onnxruntime-node,
# the engine that runs the model, comes with its programs for macOS, Windows and Linux, on x64 and
# arm64 (about 290 MB), and here only Linux's for this processor is needed (process.arch: x64 or
# arm64); and onnxruntime-web (about 140 MB) is the engine for browsers, unused in Node. All in the
# same RUN as npm ci: deleting in another RUN doesn't shrink the image, because each RUN is a
# layer, and what was deleted would still be in the layer before.
RUN npm ci --omit=dev && npm cache clean --force \
  && rm -rf node_modules/onnxruntime-web \
  && cd node_modules/onnxruntime-node/bin/napi-v6 \
  && rm -rf darwin win32 \
  && find linux -mindepth 1 -maxdepth 1 ! -name "$(node -p process.arch)" -exec rm -rf {} +
# The code, from the check stage, not from the project: BuildKit skips the stages the final one
# takes nothing from, and then the types would never be checked.
COPY --from=check /app/src ./src
# The migrations and the practice data, with their scripts: compose.yaml's migrate service uses this
# same image, and create-admin (Phase 8) runs inside it, on the server. And the worker (Phase 9),
# the shop's other process: the same image, with another command. Since Phase 11, create-key too:
# the API key of an agent that comes in through MCP is created where the database is, in Compose
# or on the server. And embeddings and many-vectors (lesson 5): the missing vectors and the big
# table for EXPLAIN, which also run next to the database. And, since lesson 6, the help pages
# (help/) and the script that loads them.
COPY --from=check /app/db ./db
COPY --from=check /app/help ./help
COPY --from=check /app/scripts/migrate.ts /app/scripts/seed.ts /app/scripts/create-admin.ts /app/scripts/create-key.ts /app/scripts/worker.ts /app/scripts/embeddings.ts /app/scripts/many-vectors.ts /app/scripts/help.ts ./scripts/
# The embedding model's folder (Phase 11), owned by the node user: Compose mounts a volume on it
# (compose.yaml), and a new volume starts with the owner of the image's folder. Without this it
# would be root's, and the shop, which isn't root, couldn't download the model.
RUN mkdir models && chown node:node models
ENV NODE_ENV=production HOST=0.0.0.0
# Not as root: node is an unprivileged user that comes with the image. If someone breaks into the
# API, they can't change its code (it belongs to root) or install anything.
USER node
EXPOSE 3000
# Every 10 seconds, Docker asks /health whether the shop is fine, and docker ps shows it: healthy
# or unhealthy. The image doesn't bring curl, so it asks with Node's fetch.
HEALTHCHECK --interval=10s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Since Phase 10 (lesson 4), with --import: src/instrumentation.ts is loaded before the shop, for
# the traces. Without OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, it does nothing.
CMD ["node", "--import", "./src/instrumentation.ts", "src/server.ts"]
