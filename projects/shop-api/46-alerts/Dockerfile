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
RUN npm ci --omit=dev && npm cache clean --force
# The code, from the check stage, not from the project: BuildKit skips the stages the final one
# takes nothing from, and then the types would never be checked.
COPY --from=check /app/src ./src
# The migrations and the practice data, with their scripts: compose.yaml's migrate service uses this
# same image, and create-admin (Phase 8) runs inside it, on the server. And the worker (Phase 9),
# the shop's other process: the same image, with another command.
COPY --from=check /app/db ./db
COPY --from=check /app/scripts/migrate.ts /app/scripts/seed.ts /app/scripts/create-admin.ts /app/scripts/worker.ts ./scripts/
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
