/**
 * Real data for the docker-layers lab, written by capture.ts. Do not edit by hand: capture again.
 *
 * Captured on 2026-10-14 with Docker Engine 29.5.2 (BuildKit, buildx v0.37.2), on Apple M1 Pro, 16 GB (Docker's VM "colima": Ubuntu 24.04.4 LTS, 4 CPUs, 2 GB).
 * Command: node web/src/playgrounds/docker-layers/capture.ts projects/tienda-api/32-dockerfile projects/tienda-api/33-imagen-pequena
 *
 * Sizes: `docker history --human=false` (bytes, uncompressed). Seconds: the median of
 * 3 `docker build --progress=plain --no-cache` (`#N DONE x.ys`), on a machine where
 * other builds may run too.
 * Observed: the steps that said CACHED when building again after changing a file of `src/`, and
 * then after changing `package.json`.
 */
import type { Capture } from './measure';

export const capture: Capture = {
  date: '2026-10-14',
  docker: 'Docker Engine 29.5.2 (BuildKit, buildx v0.37.2)',
  machine: 'Apple M1 Pro, 16 GB (Docker\'s VM "colima": Ubuntu 24.04.4 LTS, 4 CPUs, 2 GB)',
  base: {
    image: 'node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0',
    layers: 4,
    bytes: 289185792,
  },
  variants: {
    good: {
      dockerfile: [
        'FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0',
        'WORKDIR /app',
        'COPY package.json package-lock.json .npmrc ./',
        'RUN npm ci',
        'COPY . .',
        'ENV HOST=0.0.0.0',
        'EXPOSE 3000',
        'CMD ["node", "src/servidor.ts"]',
      ],
      steps: [
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: 8192,
          seconds: 0,
        },
        {
          bytes: 106496,
          seconds: 0,
        },
        {
          bytes: 160849920,
          seconds: 4,
        },
        {
          bytes: 745472,
          seconds: 0.1,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
      ],
      observed: {
        src: [null, 'cached', 'cached', 'cached', 'rebuilt', null, null, null],
        package: [null, 'cached', 'rebuilt', 'rebuilt', 'rebuilt', null, null, null],
      },
    },
    wrong: {
      dockerfile: [
        'FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0',
        'WORKDIR /app',
        'COPY . .',
        'RUN npm ci',
        'ENV HOST=0.0.0.0',
        'EXPOSE 3000',
        'CMD ["node", "src/servidor.ts"]',
      ],
      steps: [
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: 8192,
          seconds: 0,
        },
        {
          bytes: 843776,
          seconds: 0,
        },
        {
          bytes: 160849920,
          seconds: 4.2,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
      ],
      observed: {
        src: [null, 'cached', 'rebuilt', 'rebuilt', null, null, null],
        package: [null, 'cached', 'rebuilt', 'rebuilt', null, null, null],
      },
    },
    multi: {
      dockerfile: [
        'FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS dependencias',
        'WORKDIR /app',
        'COPY package.json package-lock.json .npmrc ./',
        'RUN npm ci',
        'FROM dependencias AS comprobar',
        'COPY . .',
        'RUN npm run check',
        'FROM node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 AS final',
        'WORKDIR /app',
        'COPY package.json package-lock.json .npmrc ./',
        'RUN npm ci --omit=dev && npm cache clean --force',
        'COPY --from=comprobar /app/src ./src',
        'ENV NODE_ENV=production HOST=0.0.0.0',
        'USER node',
        'EXPOSE 3000',
        'HEALTHCHECK --interval=10s --timeout=3s CMD ["node", "-e", "fetch(\'http://127.0.0.1:3000/salud\').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]',
        'CMD ["node", "src/servidor.ts"]',
      ],
      steps: [
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: 8192,
          seconds: 0,
        },
        {
          bytes: 106496,
          seconds: 0,
        },
        {
          bytes: 160849920,
          seconds: 5.4,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: 749568,
          seconds: 0.5,
        },
        {
          bytes: 36864,
          seconds: 1.4,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: 8192,
          seconds: 0,
        },
        {
          bytes: 106496,
          seconds: 0,
        },
        {
          bytes: 53440512,
          seconds: 5,
        },
        {
          bytes: 233472,
          seconds: 0.1,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
        {
          bytes: null,
          seconds: null,
        },
      ],
      observed: {
        src: [
          null,
          'cached',
          'cached',
          'cached',
          null,
          'rebuilt',
          'rebuilt',
          null,
          'cached',
          'cached',
          'cached',
          'rebuilt',
          null,
          null,
          null,
          null,
          null,
        ],
        package: [
          null,
          'cached',
          'rebuilt',
          'rebuilt',
          null,
          'rebuilt',
          'rebuilt',
          null,
          'cached',
          'rebuilt',
          'rebuilt',
          'rebuilt',
          null,
          null,
          null,
          null,
          null,
        ],
      },
    },
  },
};
