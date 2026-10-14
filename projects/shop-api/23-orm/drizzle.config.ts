// The configuration of drizzle-kit, Drizzle's tool for the schema. Here it only generates
// migrations: npm run db:generate -- --name=what-changes
// drizzle-kit compares src/schema.ts with the last snapshot of the schema it saved (drizzle/meta/)
// and writes into drizzle/ the SQL for what has changed. It doesn't apply it: that file is copied to
// db/migrations/ with the next number, and our runner applies it (npm run db:migrate), like the
// others. drizzle/0000_base.sql is the starting snapshot: the tables from migrations 001 to 003,
// which already existed. It's never applied.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});
