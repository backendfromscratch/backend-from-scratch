// The configuration comes from the environment variables (Phase 1, lesson 7). It's checked at
// startup: if something is missing, the server doesn't start and says what's missing.
import { z } from 'zod';

// #region config-schema
const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // The secret the payment gateway signs the webhooks with (lesson 7).
  WEBHOOK_SECRET: z
    .string({ error: 'WEBHOOK_SECRET is missing' })
    .min(16, 'WEBHOOK_SECRET is too short'),
  // The identity provider (lesson 4): its address (the issuer), the id and the secret it gave you
  // when you registered the shop, and the shop's URL the browser comes back to.
  OIDC_ISSUER: z.url({ error: 'OIDC_ISSUER is missing, or it is not a URL' }),
  OIDC_CLIENT_ID: z
    .string({ error: 'OIDC_CLIENT_ID is missing' })
    .min(1, 'OIDC_CLIENT_ID is missing'),
  OIDC_CLIENT_SECRET: z
    .string({ error: 'OIDC_CLIENT_SECRET is missing' })
    .min(16, 'OIDC_CLIENT_SECRET is too short'),
  OIDC_REDIRECT_URI: z.url({ error: 'OIDC_REDIRECT_URI is missing, or it is not a URL' }),
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
