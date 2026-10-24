# The API for Ana and Luis's shop

The guided project for [Backend from Scratch](https://backenddesdecero.com/en/): it starts in Phase 3, "Your first server", carries on in Phase 4, "API design", in Phase 5, "Databases", in Phase 6, "Authentication, authorization and security", in Phase 7, "Docker and containers", in Phase 8, "Deployment and infrastructure", and in Phase 9, "Architecture and scaling". Each folder is the project as it stands at the end of a lesson: if you get stuck, compare your code with the folder for that lesson.

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
| `36-deployment`      | CI/CD                              |
| `37-queue`           | Queues                             |
| `38-cache`           | Cache                              |
| `39-scaling`         | Scaling                            |
| `40-zero-downtime`   | Zero downtime                      |
| `41-events`          | Events                             |
| `42-tests`           | Tests                              |
| `43-contract`        | Contract                           |

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

`create-admin` creates your admin account with a long random password, shows it just once and keeps only its hash. With `TRUSTED_PROXY`, the API reads the visitor's IP from `X-Forwarded-For` only when the request comes from that address (the gateway of Compose's network: `docker network inspect shop_default`). Only one proxy hop is supported (the last `X-Forwarded-For` entry): with another proxy in front, like Cloudflare's, the limiter would see that proxy's addresses.

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

The first time the image is published, ghcr.io creates it **private**: on its package page (Package settings → Change visibility) make it public, or the server won't be able to download it without credentials. An image the script judged bad isn't retried by itself (every attempt is seconds without an API): if the fault was in the environment and not in the image (a badly written `.env`, say), fix it and delete `.deploy-failed` so it tries again.

Going back changes the code, not the data: that's why the script makes a backup before migrating.

## Phase 9: the queue, the worker, Mailpit and the cache

From `37-queue`, what a request doesn't have to wait for goes to a job queue in Redis (with BullMQ): when an order becomes paid, one notification for each URL of the delivery company (with the `X-Event-Id` header, the same on every retry) and the confirmation email for whoever placed it. Another process does them, the worker (`scripts/worker.ts`): the same code and the same image as the API, with another command. A job that fails is tried again, up to five attempts in all, waiting 1, 2, 4 and 8 seconds between one and the next. Redis now keeps the queue on disk (`--appendonly yes`, in the `redis` volume).

With Docker, `docker compose up --build` also starts the worker and Mailpit, a practice mail server: it receives the shop's emails, sends them to nobody and shows them at `http://localhost:8025`.

```sh
docker compose up --build --wait                  # everything, in the background
npm run gateway -- 21                             # the payment gateway notifies: order 21, paid
curl -s http://localhost:8025/api/v1/messages     # the email, in Mailpit's inbox (or in the browser)
docker compose logs worker                        # what the worker has done
docker compose stop worker                        # without a worker, the jobs wait in the queue...
docker compose start worker                       # ...and go out as soon as it's back
```

`npm run gateway` reads `WEBHOOK_SECRET` from your `.env`, the same one the API uses in Compose, and calls the API on port 3000 (another one, with `PORT=3001 npm run gateway -- 21`).

**Without Docker**, the shop still works without Redis: the jobs are done in the API's own process, as soon as they arrive and without retries, as until Phase 8. With Redis on your computer (`REDIS_URL` in `.env`), start the worker in another terminal with `npm run worker`. Without `SMTP_URL`, no email goes out: the log says which one would have. On a server, `SMTP_URL` is optional (`.env.production.example` explains what an email provider asks for), and `deploy.sh` updates the worker together with the API.

Load tests are done with autocannon (`npm run load`), with the shop running:

```sh
npm run load -- -d 10 http://127.0.0.1:3000/v2/products   # 10 seconds of requests, and the results table
```

The queue's tests (`test/queue.test.ts`) need Redis, like the store's: without `REDIS_URL_TESTS`, the ones that use it are skipped.

From `38-cache`, the catalogue (the list of products and each product) is kept for a minute in a cache, a second Redis (the `cache` service, with `CACHE_URL`): at most 64 MB, it deletes the least-read keys when it fills up and keeps nothing on disk, the opposite of the queue's. Creating, changing (`PATCH /v2/products/{id}`, new in this step: the name or the price, admin only) or deleting a product, and placing an order, changing its quantity and cancelling it (all three change the stock) delete from the cache what has changed; buying still checks the stock in PostgreSQL. Without `CACHE_URL`, or with the cache down or stuck (no command waits for it longer than 200 ms), everything is read from PostgreSQL, as before. To look inside: `docker compose exec cache redis-cli keys '*'`. Its tests (`test/cache.test.ts`) use database 2 of the Redis in `REDIS_URL_TESTS`.

From `39-scaling`, the API can run as several copies (`docker compose up --scale api=2`, each one on its own port, 3000 or 3001: `docker compose port --index 1 api 3000`). The only thing that lived in a copy's memory, the notices of the changes in the orders that `GET /v2/orders/{id}/events` follows, now goes through Redis (pub/sub, on the `shop:orders` channel, `src/order-events.ts`): an order cancelled through one copy reaches whoever follows it on the other. Each copy subscribes to the channel the first time it needs it. If Redis is cut, whoever follows an order gets no changes; when it comes back, the API closes those streams, and the browser (`EventSource`) connects again and gets the current status. Without `REDIS_URL`, they stay in the process's memory, as before. To watch them go by: `docker compose exec redis redis-cli subscribe shop:orders`. Its tests (`test/scaling.test.ts`) use the Redis in `REDIS_URL_TESTS`, with a channel of their own on each run.

From `40-zero-downtime`, the server runs two copies of the API, `api-a` (port 3000) and `api-b` (3001), the two ports nginx already had in its `upstream`, so nginx doesn't need touching (in `nginx/shop.conf` only the `upstream` comment changes). `deploy.sh` changes them one at a time: `api-b` with the new image and, when Docker considers it healthy, 10 seconds of margin for nginx and then `api-a`; at the end, the worker, and `docker image prune` deletes the images with no tag (the new one and the previous one stay). If a new copy never gets healthy (it stops waiting as soon as Docker considers it `unhealthy`), the ones it has already changed go back to the previous image, also one at a time. The first deployment of this step removes the single copy of the earlier steps (the `api` service, which will be on 3000 or on 3001) once the new copy on the other port is already answering: if the old one is on 3001, it starts with `api-a`. On receiving `SIGTERM`, the API shuts down without cutting anyone off (`src/shutdown.ts`): it stops accepting connections, finishes the requests it has half done, closes the event streams and the WebSockets (their clients connect again, to the other copy), and then PostgreSQL and Redis, all within 8 seconds at most; meanwhile, `/health` answers 503. nginx repeats on the other copy what the one shutting down refuses, even if it's a POST, as long as Docker doesn't put its `docker-proxy` in front of the published ports: with it (it comes turned on), the port accepts the connection and cuts it, and nginx doesn't repeat a POST it already sent (502). So on the server, once only, before this step's first deployment, it is turned off in Docker's configuration, `/etc/docker/daemon.json`. If you followed Phase 8, that file already exists, with the log limits from its lesson 3, which must not be lost; look at it first:

```sh
cat /etc/docker/daemon.json
```

If it has those limits and nothing else, or doesn't exist ("No such file or directory"), write the whole file: those limits plus the new key:

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

If it has other settings, open it with `sudo nano /etc/docker/daemon.json` and add `"userland-proxy": false` inside its braces without deleting anything, with a comma after the setting before it. Then:

```sh
sudo systemctl restart docker   # stops and starts every container, once
```

If Docker doesn't start, the JSON has a mistake: `sudo journalctl -u docker -n 20` tells you which.

The `127.0.0.1` ports keep serving on the server itself and stay closed from outside, and the API still sees nginx arriving from `172.18.0.1` (`TRUSTED_PROXY` doesn't change). As long as you haven't done it, `deploy.sh` warns about it on every deployment. Its tests: `test/shutdown.test.ts`, and `test/deployment-files.test.ts`, which runs `deploy.sh` with a fake `docker` (`test/docker-fake.sh`).

From `41-events`, paying an order no longer puts anything in the queue: in a single transaction, it writes down the gateway's event, turns the order into paid and saves its jobs (the notifications and the email) in the `outbox_events` table (migration `011`). If the API goes down right after, or the queue's Redis doesn't answer, the jobs are already in PostgreSQL. The worker relays them (`src/outbox.ts`): on start and every second, it takes the ones that haven't been sent (`FOR UPDATE SKIP LOCKED`: two workers never take the same one), puts them in the queue and writes down when (`sent_at`); if Redis fails or doesn't answer, it writes nothing down, and tries again a second later; if it is slow, it writes down the ones that arrived within 2 seconds and leaves the rest for the next round. A job can reach the queue twice (the worker goes down after enqueuing it and before writing it down), so each one carries its id (`email-<order>`; `notice-<payment id>-<notification>`), and BullMQ doesn't write down the same one twice. Without Redis, the API itself relays them, and each job is done in that process, as before. To look at the table: `docker compose exec db psql -U shop -c 'SELECT id, type, created_at, sent_at FROM outbox_events'`. Its tests: `test/events.test.ts`.

## Phase 10: tests, contract, traces, metrics and alerts

From `42-tests`, there are two more scripts. `npm run e2e` tests the real shop, the Compose one, with nothing but `fetch`: it creates an account, signs in, places an order, pays it with the gateway (`npm run gateway`) and waits for the email to reach Mailpit. It needs the shop running (`docker compose up -d --build --wait`) and reads `BASE_URL` (by default `http://127.0.0.1:3000`; if your API ended up on 3001, `BASE_URL=http://127.0.0.1:3001 npm run e2e`) and `MAILPIT_URL` (by default `http://127.0.0.1:8025`). Its tests are in `test/e2e/`. `npm run coverage` runs `npm test` with Node's coverage option and shows which lines of `src/` no test executes. `npm test` only runs `test/*.test.ts`: without that, Node would also run `test/e2e/`, which fails with no shop running. The new unit tests of the signature are in `test/signature.test.ts`.

From `43-contract`, the API checks that its responses have the shape its contract promises (`/v2/openapi.json`). `src/contract-responses.ts` compiles each response of the document with Ajv and two things use it: the tests (`test/contract.ts`, `matchesContract(res, 'get', '/orders/{id}')`, with one case per route in `test/contract.test.ts`) and a middleware on `/v2`, which `VALIDATE_RESPONSES` controls: `no` (nothing, the default), `log` (a `warn` "response outside the contract" with the `requestId`, the route, the status and the failures, without the body, which may carry personal data) or `fail` (a 500 instead). `test/.env` uses `fail`: every test, besides its own job, is a contract test. `contract.json` is the published contract, kept in Git: if the document changes, `npm test` fails until you regenerate it with `npm run contract` and the change shows in the diff. The middleware is mounted first after the log, so it also sees what the middleware answer before reaching the route (the CSRF check, the session). It doesn't look at what has no JSON body (a 204, the event stream; a `HEAD` is validated as its `GET`), nor at the 405s of a method the route doesn't have, nor at any 5xx: a server failure is already logged by `app.onError`, and it isn't that the response breaks the contract. While writing the contract tests, reading the code, gaps in the contract appeared: it didn't say that the routes with a body answer 400 (badly written JSON) and 415 (without `Content-Type: application/json`), nor that `POST /v2/accounts`, `POST /v2/session`, `DELETE /v2/session` and `POST /v2/webhooks/payments` can answer 403 (the CSRF check, with another site's cookie). The 400s and 415s were found by the validation when running all the tests with `fail`; the 403s weren't: they were seen by reading the code, and there is a test for each one. `npm run load -- -d 10 http://127.0.0.1:3000/v2/products` costs, with `log` or `fail` around, about 12 % of requests per second (from about 14,100 to about 12,400 in a test with 10 connections): measure it on your machine before turning it on in production.
