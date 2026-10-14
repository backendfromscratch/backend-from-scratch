# The API for Ana and Luis's shop

The guided project for [Backend from Scratch](https://backenddesdecero.com/en/): it starts in Phase 3, "Your first server", carries on in Phase 4, "API design", in Phase 5, "Databases", and in Phase 6, "Authentication, authorization and security". Each folder is the project as it stands at the end of a lesson: if you get stuck, compare your code with the folder for that lesson.

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
