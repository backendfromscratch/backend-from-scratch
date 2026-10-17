# The API for Ana and Luis's shop

The guided project for [Backend from Scratch](https://backenddesdecero.com/en/): it starts in Phase 3, "Your first server", carries on in Phase 4, "API design", in Phase 5, "Databases", in Phase 6, "Authentication, authorization and security", in Phase 7, "Docker and containers", and in Phase 8, "Deployment and infrastructure". Each folder is the project as it stands at the end of a lesson: if you get stuck, compare your code with the folder for that lesson.

| Folder               | Lesson                             |
| -------------------- | ---------------------------------- |
| `01-node`            | What Node.js is                    |
| `02-javascript`      | JavaScript from scratch            |
| `03-typescript`      | TypeScript with Node.js            |
| `04-http-server`     | An HTTP server without a framework |
| `05-framework`       | Express, Fastify or Hono           |
| `06-middleware`      | Middleware                         |
| `07-validation`      | Validating the input data          |
| `08-errors-and-logs` | Errors and logs                    |
| `09-event-loop`      | The event loop                     |
| `10-rest`            | REST                               |
| `11-api-errors`      | Errors                             |
| `12-pagination`      | Pagination                         |
| `13-versioning`      | Versioning                         |
| `14-openapi`         | OpenAPI                            |
| `15-serialization`   | Serialization                      |
| `16-webhooks`        | Webhooks                           |
| `17-realtime`        | Real time                          |
| `18-modeling`        | Data modeling                      |
| `19-postgres`        | Connecting Node.js to PostgreSQL   |
| `20-migrations`      | Migrations                         |
| `21-indexes`         | Indexes and EXPLAIN ANALYZE        |
| `22-transactions`    | Transactions                       |
| `23-orm`             | What an ORM is: Drizzle            |
| `24-passwords`       | Passwords                          |
| `25-sessions`        | Sessions                           |
| `26-jwt-keys`        | JWT                                |
| `27-oauth`           | OAuth                              |
| `28-roles`           | Authorization                      |
| `29-injection-xss`   | Injection                          |
| `30-csrf-ssrf`       | CSRF and SSRF                      |
| `31-rate-limits`     | Rate limiting                      |
| `32-dockerfile`      | Dockerfile                         |
| `33-small-image`     | Multi-stage                        |
| `34-compose`         | Compose                            |
| `35-production`      | Production, nginx and HTTPS        |

You need Node.js 24 or later; the course uses 26 (with nvm, `nvm use` in the folder picks it). On Linux and WSL, Node 26 also needs the `libatomic1` library (`sudo apt install libatomic1`). In each folder:

```sh
npm install   # installs the dependencies (if there are any)
npm test      # checks that everything works
npm start     # starts the server (from folder 04)
```

## Phase 5: the database

From folder `18-modeling`, the project uses PostgreSQL 18 (the server keeps its data there from `19-postgres`), and the tests need it too: the introduction to Phase 5 explains how to install it and how to create the `shop` user with its two databases, `shop` (yours) and `shop_test` (the tests' one, which they empty and fill again every time). The server and the scripts find the database in the `DATABASE_URL` variable: copy `.env.example` as `.env` and put in your password. The tests use the one in `test/.env`.

```sh
npm run db:create    # folders 18 and 19: creates the tables with the sample data (drops the ones there were)
npm run db:migrate   # from 20: applies the missing migrations
npm run db:seed      # from 20: the sample data, into an empty database; from 24, also the
                     # practice accounts, even if the database already has data
```

## Phase 6: the practice accounts

From folder `24-passwords`, the shop has accounts. These four are for practice (they're in `db/accounts.sql`, with their password's hash): don't use these passwords for anything else.

| Email                | Password               | Role (from `28-roles`) |
| -------------------- | ---------------------- | ---------------------- |
| `ana@shop.example`   | `ana-practice-2026`    | admin                  |
| `luis@shop.example`  | `luis-practice-2026`   | admin                  |
| `carmen@example.com` | `carmen-practice-2026` | customer               |
| `pablo@example.com`  | `pablo-practice-2026`  | customer               |

If you come from Phase 5 with your database, after `npm run db:migrate` run `npm run db:seed`: it adds the missing accounts and doesn't repeat the products. In `28-roles`, run it again after migrating: it gives each account its role.

## Phase 7: with Docker

From folder `32-dockerfile`, the project brings a `Dockerfile` to build the API's image, and from `34-compose`, a `compose.yaml` that starts the whole shop: the API, PostgreSQL 18 and Redis 8, each in its own container. You need Docker: the introduction to Phase 7 explains how to install it. The ports are published only on `127.0.0.1`, so only your computer reaches them.

**Without Docker**, everything stays as in the earlier phases: Node 26 and PostgreSQL on your computer, `npm run db:migrate`, `npm run db:seed` and `npm start`. Without `REDIS_URL`, the attempt limits are kept in the server's memory.

**With Docker** (from `34-compose`), copy `.env.example` as `.env`, generate its secrets as the file says and put a new password in `POSTGRES_PASSWORD` (`openssl rand -hex 24`). Then:

```sh
docker compose up --build                  # builds the image and starts everything: the API, on 3000 or 3001
docker compose up --build --scale api=2    # two copies of the API (3000 and 3001) that share Redis
docker compose down                        # stops it; with -v, it deletes the data too
docker compose port api 3000               # which port of your computer the API got
```

Before starting the API, Compose applies the migrations and loads the practice data (the `migrate` service). That database is a different one, in a Docker volume, not the one on your computer, and it doesn't clash with it: it publishes no port. Signing in with the practice provider (`npm run provider`) doesn't work from the containers, because inside a container `localhost` is the container itself; with email and password, it does.

Image size (`CONTENT SIZE` from `docker image ls`, on 2026-10-14): 145 MB for `32-dockerfile`'s, with one stage; 92 MB for `33-small-image`'s, multi-stage on `node:26-slim`. With the same final stage on `node:26-alpine` it would be 74 MB, and on distroless (`gcr.io/distroless/nodejs26-debian13`), 66 MB.

The Redis store's tests (`test/redis-store.test.ts`, from `34-compose`) need a Redis. Without one they're skipped, and the rest pass. To test them, start one and remove the `#` from `REDIS_URL_TESTS` in `test/.env`:

```sh
docker run --rm -d --name redis-tests -p 127.0.0.1:6379:6379 redis:8
```

## Phase 8: on a server

`35-production` brings what changes when you put the shop on a server, next to `compose.yaml` (which stays the one for your computer):

- `compose.production.yaml`: the same shop, with `restart: unless-stopped`, the image `${IMAGE:-shop-api}` (the one `--build` builds, or the published one if you set `IMAGE`), the network's subnet pinned (`172.18.0.0/16`) and no practice accounts: `migrate` only loads the sample products (`--no-accounts`). The API is still published only on `127.0.0.1`.
- `.env.production.example`: a server's configuration. Copy it as `.env` **on the server**, generate the secrets there (`openssl rand -base64 32` and `openssl rand -hex 24`) and change `shop.example` to your name. The four `OIDC_*` stay commented out: without an identity provider, the shop works with email and password.
- `nginx/shop.conf`: nginx in front, with port 80 redirecting to 443, the `X-Forwarded-For` and `X-Forwarded-Proto` headers, the two copies of the API in an `upstream`, and a `location` of its own for an order's events. It carries the instructions to install it. As it is, it uses your own certificate authority's certificate (`/etc/ssl/shop/`, the free path); with Let's Encrypt, `certbot --nginx` replaces those two lines.
- `deployment/backup.sh`, with `shop-backup.service` and `shop-backup.timer`: a `pg_dump` every night at 03:30, in `backups/` (readable only by your user), kept for 7 days. Your user has to be in the `docker` group (it's equivalent to root: be careful) and change `User` and the paths in the `.service` if it isn't `ubuntu` and `/opt/shop`.

```sh
cp .env.production.example .env && chmod 600 .env    # and generate the secrets in .env
docker compose -f compose.production.yaml up -d --build
docker compose -f compose.production.yaml run --rm api node scripts/create-admin.ts you@email.com
deployment/backup.sh                                 # a backup now
```

`create-admin` creates your admin account with a long random password, shows it just once and keeps only its hash. With `TRUSTED_PROXY`, the API reads the visitor's IP from `X-Forwarded-For` only when the request comes from that address (the gateway of Compose's network: `docker network inspect shop_default`).

`36-deployment` publishes the image and deploys it without GitHub having to get into your server:

- `.github/workflows/publish.yml`: on every pull request it installs, type-checks and runs the tests with a PostgreSQL 18; on every push to `main` it also builds the image for `linux/amd64` and `linux/arm64` and publishes it to `ghcr.io/<your-user>/shop-api` with the tags `sha-<7 letters of the commit>` and `main`. GitHub only runs the workflows at the root of a repository: here, inside the step's folder, it does nothing. Copy the step's contents to the root of your own repository and it switches on.
- `deployment/deploy.sh`, with `shop-deploy.service` and `shop-deploy.timer`: every two minutes the server asks whether `IMAGE` (in `.env`, for example `ghcr.io/your-user/shop-api:main`) points to a new image. If not, it does nothing and writes nothing. If so: backup, migrations, new API, and it waits for `/health`; if it never gets healthy, it goes back to the previous image (kept as `:previous`) and ends with an error. One deployment at a time (`flock`). It installs like the backup, with the same user.

```sh
# on the server: follow the published image (put yours)
echo 'IMAGE=ghcr.io/your-user/shop-api:main' >> .env
docker compose -f compose.production.yaml pull api       # downloads the published one (build isn't used)
sudo cp deployment/shop-deploy.service deployment/shop-deploy.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now shop-deploy.timer
journalctl -u shop-deploy                                # what it has done
```

Going back changes the code, not the data: that's why the script makes a backup before migrating.
