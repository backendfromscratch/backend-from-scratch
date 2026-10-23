// The configuration comes from the environment variables (Phase 1, lesson 7). It's checked at
// startup: if something is missing, the server doesn't start and says what's missing.
import { isIP } from 'node:net';
import { z } from 'zod';

// A comma-separated list, as text: "a, b" becomes ['a', 'b'].
const list = (name: string) =>
  z.string({ error: `${name} is missing` }).transform((text) =>
    text
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== ''),
  );

// An IPv4 can arrive written as IPv6 (::ffff:172.18.0.1): it's left as IPv4, so the same text is
// always compared.
export const normalizeIp = (ip: string) =>
  ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;

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
const configSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    // The address it listens on: 127.0.0.1, only your computer (Phase 3). Inside a container that's
    // not enough: what comes in through the published port enters through the container's network,
    // not through its 127.0.0.1. There it needs 0.0.0.0 (all its addresses), and the Dockerfile sets
    // it. Who reaches the container is decided by the published port: -p 127.0.0.1:3000:3000, only
    // your computer.
    HOST: z.string().min(1).default('127.0.0.1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // The secret the payment gateway signs the webhooks with (lesson 7).
    WEBHOOK_SECRET: secret('WEBHOOK_SECRET'),
    // The identity provider (lesson 4): its address (the issuer), the id and the secret it gave you
    // when you registered the shop, and the shop's URL the browser comes back to. They're optional,
    // but as a group: either all four are there or none is (below). Without them, the shop doesn't
    // offer signing in with a provider, and email and password keep working.
    OIDC_ISSUER: z.url({ error: 'OIDC_ISSUER is not a URL' }).optional(),
    OIDC_CLIENT_ID: z.string().min(1, 'OIDC_CLIENT_ID is empty').optional(),
    OIDC_CLIENT_SECRET: secret('OIDC_CLIENT_SECRET').optional(),
    OIDC_REDIRECT_URI: z.url({ error: 'OIDC_REDIRECT_URI is not a URL' }).optional(),
    // The sites (origin: scheme, name and port) requests that use the session cookie are accepted
    // from (lesson 7), separated by commas: http://localhost:3000,https://shop.example
    ALLOWED_ORIGINS: list('ALLOWED_ORIGINS').pipe(
      z.array(z.url({ error: 'Each origin, a URL: http://localhost:3000' })).min(1),
    ),
    // Redis, for the attempt limits (rate-limits.ts): redis://server:6379. Without it, the attempts
    // are kept in the server's memory. In Docker Compose, compose.yaml sets it.
    // Since Phase 9, also for the job queue (queue.ts): without it, the jobs are done in the same
    // process, as soon as they arrive, and without retries.
    REDIS_URL: z.url({ error: 'REDIS_URL is not a URL: redis://server:6379' }).optional(),
    // And for the notices of the changes in the orders between the API's copies (order-events.ts,
    // Phase 9, lesson 3), through this channel. Redis channels don't belong to a database (the /1 in
    // redis://server:6379/1): they belong to the whole server. If two shops use the same Redis (the
    // practice one and the real one, or the tests), each needs its own.
    ORDERS_CHANNEL: z.string().min(1).default('shop:orders'),
    // The cache (Phase 9, lesson 2): another Redis, set up to lose data without it mattering
    // (cache.ts). Without it, there is no cache: the catalogue is always read from PostgreSQL. In
    // Docker Compose, compose.yaml sets it.
    CACHE_URL: z.url({ error: 'CACHE_URL is not a URL: redis://server:6379' }).optional(),
    // The mail server (Phase 9, lesson 1): smtp://server:port, or smtps:// if the connection is
    // encrypted from the start; with a user and a password, smtps://user:password@server:465. On
    // your computer, Mailpit (compose.yaml). Without it, the shop sends no emails: the log says which
    // one it would have sent.
    SMTP_URL: z
      .url({ protocol: /^smtps?$/, error: 'SMTP_URL is not an smtp:// or smtps:// URL' })
      .optional(),
    // Who signs the emails. With a real provider, an address on your domain.
    SMTP_FROM: z.string().min(1).default('The shop <orders@shop.example>'),
    // The IPs of your proxy (Nginx), separated by commas: X-Forwarded-For is only read from them, to
    // know the IP of whoever makes the request (rate-limits.ts). Without a proxy, empty: that header
    // is ignored. Only ONE proxy hop is supported (the last X-Forwarded-For entry is read): with
    // another proxy in front (Cloudflare's, say), the limiter would see that proxy's addresses, not
    // the visitors'.
    TRUSTED_PROXY: list('TRUSTED_PROXY')
      .pipe(
        z.array(
          z.string().refine((ip) => isIP(ip) !== 0, 'Each proxy, an IP: 172.18.0.1 (not a name)'),
        ),
      )
      .transform((ips) => ips.map(normalizeIp))
      .default([]),
    // Only for development: names the shop can send notifications to over http, even if they're on
    // your computer (safe-url.ts). Separated by commas. In production, empty.
    NOTIFICATION_DEV_HOSTS: list('NOTIFICATION_DEV_HOSTS').default([]),
  })
  .superRefine((data, context) => {
    const settings = [
      'OIDC_ISSUER',
      'OIDC_CLIENT_ID',
      'OIDC_CLIENT_SECRET',
      'OIDC_REDIRECT_URI',
    ] as const;
    const missing = settings.filter((name) => data[name] === undefined);
    // With one, two or three, the shop would start with half a provider: better to say which are
    // missing.
    if (missing.length === 0 || missing.length === settings.length) return;
    for (const name of missing) {
      context.addIssue({
        code: 'custom',
        path: [name],
        message: `${name} is missing: the identity provider needs all four OIDC_*, or none`,
      });
    }
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
