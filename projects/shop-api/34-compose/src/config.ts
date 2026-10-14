// The configuration comes from the environment variables (Phase 1, lesson 7). It's checked at
// startup: if something is missing, the server doesn't start and says what's missing.
import { z } from 'zod';

// A comma-separated list, as text: "a, b" becomes ['a', 'b'].
const list = (name: string) =>
  z.string({ error: `${name} is missing` }).transform((text) =>
    text
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== ''),
  );

// #region secret
// A secret (lesson 8): it has to be there, be long (32 characters, like the ones
// openssl rand -base64 32 gives) and not be the example one from .env.example, which is in Git and
// anyone can read. If not, the server doesn't start: better not to start than to start with a
// secret that can be guessed.
const secret = (name: string) =>
  z
    .string({ error: `${name} is missing` })
    .min(32, `${name} is too short: at least 32 characters`)
    .refine(
      (value) => !value.startsWith('change-this'),
      `${name} is the example one: generate one with openssl rand -base64 32`,
    );
// #endregion secret

// #region config-schema
const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  // The address it listens on: 127.0.0.1, only your computer (Phase 3). Inside a container that's
  // not enough: what comes in through the published port enters through the container's network,
  // not through its 127.0.0.1. There it needs 0.0.0.0 (all its addresses), and the Dockerfile sets
  // it. Who reaches the container is decided by the published port: -p 127.0.0.1:3000:3000, only
  // your computer.
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // The secret the payment gateway signs the webhooks with (lesson 7).
  WEBHOOK_SECRET: secret('WEBHOOK_SECRET'),
  // The identity provider (lesson 4): its address (the issuer), the id and the secret it gave you
  // when you registered the shop, and the shop's URL the browser comes back to.
  OIDC_ISSUER: z.url({ error: 'OIDC_ISSUER is missing, or it is not a URL' }),
  OIDC_CLIENT_ID: z
    .string({ error: 'OIDC_CLIENT_ID is missing' })
    .min(1, 'OIDC_CLIENT_ID is missing'),
  OIDC_CLIENT_SECRET: secret('OIDC_CLIENT_SECRET'),
  OIDC_REDIRECT_URI: z.url({ error: 'OIDC_REDIRECT_URI is missing, or it is not a URL' }),
  // The sites (origin: scheme, name and port) requests that use the session cookie are accepted
  // from (lesson 7), separated by commas: http://localhost:3000,https://shop.example
  ALLOWED_ORIGINS: list('ALLOWED_ORIGINS').pipe(
    z.array(z.url({ error: 'Each origin, a URL: http://localhost:3000' })).min(1),
  ),
  // Redis, for the attempt limits (rate-limits.ts): redis://server:6379. Without it, the attempts
  // are kept in the server's memory. In Docker Compose, compose.yaml sets it.
  REDIS_URL: z.url({ error: 'REDIS_URL is not a URL: redis://server:6379' }).optional(),
  // Only for development: names the shop can send notifications to over http, even if they're on
  // your computer (safe-url.ts). Separated by commas. In production, empty.
  NOTIFICATION_DEV_HOSTS: list('NOTIFICATION_DEV_HOSTS').default([]),
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
