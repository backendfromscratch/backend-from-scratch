// The configuration comes from the environment variables (Phase 1, lesson 7). It's checked at
// startup: if something is missing, the server doesn't start and says what's missing.
import { z } from 'zod';

// #region config-schema
const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ADMIN_TOKEN: z.string({ error: 'ADMIN_TOKEN is missing' }).min(16, 'ADMIN_TOKEN is too short'),
  // The secret the payment gateway signs the webhooks with (lesson 7).
  WEBHOOK_SECRET: z
    .string({ error: 'WEBHOOK_SECRET is missing' })
    .min(16, 'WEBHOOK_SECRET is too short'),
});
// #endregion config-schema

const result = configSchema.safeParse(process.env);
if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`Configuration: ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = result.data;
