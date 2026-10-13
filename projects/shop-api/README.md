# The API for Ana and Luis's shop

The guided project for Phase 3 of [Backend from Scratch](https://backenddesdecero.com/en/phase-3/), "Your first server". Each folder is the project as it stands at the end of a lesson: if you get stuck, compare your code with the folder for that lesson.

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

You need Node.js 24 or later; the course uses 26 (with nvm, `nvm use` in the folder picks it). On Linux and WSL, Node 26 also needs the `libatomic1` library (`sudo apt install libatomic1`). In each folder:

```sh
npm install   # installs the dependencies (if there are any)
npm test      # checks that everything works
npm start     # starts the server (from folder 04)
```
