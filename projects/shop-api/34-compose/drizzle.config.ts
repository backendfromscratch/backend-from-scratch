// The configuration of drizzle-kit, Drizzle's tool for the schema. Here it only generates
// migrations: npm run db:generate -- --name=what-changes
// drizzle-kit compares src/schema.ts with the last snapshot of the schema it saved (drizzle/meta/)
// and writes into drizzle/ the SQL for what has changed. It doesn't apply it: that file is copied to
// db/migrations/ with the next number, and our runner applies it (npm run db:migrate), like the
// others. drizzle/0000_base.sql is the starting snapshot: the tables from migrations 001 to 003,
// which already existed. It's never applied.
// From 005 on, the migration in db/migrations/ is written by hand, with comments that explain it,
// and it says the same as the SQL drizzle-kit generated (drizzle/0002_users.sql…). drizzle/ keeps
// that snapshot so that next time drizzle-kit knows what has changed.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});
