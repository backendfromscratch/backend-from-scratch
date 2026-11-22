// npm run evals (Phase 11, lesson 7): the evals in evals/cases.ts, against the real model. Every
// run costs money: 12 cases, each one with two or three calls to the model, and the judge. The
// table at the end says how much, case by case.
// It needs what the shop needs: its configuration (.env, with your ANTHROPIC_API_KEY) and its
// database with the practice data and the help loaded. With Docker Compose, inside the API's
// container, which already has both (Compose's database can't be seen from outside):
//   docker compose exec api npm run evals
// Without Docker, with the shop configured on your computer: npm run evals.

// #region no-key
// Before importing anything from the shop: without a key there's nothing to do, and it's better to
// say why than to let every case fail with a 401.
if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error(
    'npm run evals asks the real model, and that costs money (a few cents each time): ' +
      'put your ANTHROPIC_API_KEY in .env. Nothing has been called.',
  );
  process.exit(1);
}
// #endregion no-key

// Without the shop's log lines (every tool writes one): only the warnings and the table.
process.env.LOG_LEVEL = 'warn';
const { client } = await import('../src/assistant/client.ts');
const { pool } = await import('../src/db.ts');
const { cases } = await import('./cases.ts');
const { evaluate, table } = await import('./evaluate.ts');

// #region carmen
// The tools work for a customer: Carmen, from the practice data, looked up by her email (her id
// depends on the accounts there were before). And the help has to be loaded.
const { rows } = await pool.query<{ id: number }>(
  `SELECT id FROM users WHERE lower(email) = 'carmen@example.com'`,
);
const [{ n: chunks }] = (
  await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM help_chunks')
).rows as [{ n: number }];
if (rows.length === 0 || chunks === 0) {
  console.error(
    rows.length === 0
      ? "Carmen's account isn't there: load the practice data (npm run db:seed)."
      : "The help isn't loaded: npm run help (with Docker Compose, the worker loads it when it starts).",
  );
  await pool.end();
  process.exit(1);
}
// #endregion carmen

const results = await evaluate(cases, { client: client!, runAs: { customerId: rows[0]!.id } });
console.log(table(results));
await pool.end();
// With any case that doesn't pass, it ends with an error (1): a script that uses it notices.
// process.exit, and not waiting for it to end on its own: the cache's connection (CACHE_URL, in
// Compose) would keep it open.
process.exit(results.every((result) => result.passed) ? 0 : 1);
