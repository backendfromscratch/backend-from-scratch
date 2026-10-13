// #region config
// The configuration comes from the environment variables (Phase 1, lesson 7). It's checked at
// startup: if something is missing, the server doesn't start and says what's missing.
import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ADMIN_TOKEN: z.string({ error: 'ADMIN_TOKEN is missing' }).min(16, 'ADMIN_TOKEN is too short'),
});

const result = configSchema.safeParse(process.env);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`Configuration: ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = result.data;
// #endregion config
