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
    // Whether the API checks its own responses against the contract (contract-responses.ts, Phase
    // 10, lesson 3): no, it checks nothing; log, it warns in the log about the ones that don't meet
    // it; fail, it answers a 500 instead. For the tests and development, fail; in production, the
    // decision is yours (it costs time on every response).
    VALIDATE_RESPONSES: z.enum(['no', 'log', 'fail']).default('no'),
    // Only for development: names the shop can send notifications to over http, even if they're on
    // your computer (safe-url.ts). Separated by commas. In production, empty.
    NOTIFICATION_DEV_HOSTS: list('NOTIFICATION_DEV_HOSTS').default([]),
    // #region assistant
    // The shop's assistant (Phase 11, lesson 1): the Claude API key. It's a secret: it goes in .env,
    // never in the code or in the frontend (whoever has it spends on the shop's account). It's
    // optional: without it, the shop works the same and POST /v2/assistant answers 503. Empty
    // (ANTHROPIC_API_KEY=, as in .env.example) counts as not there.
    // The API's address (ANTHROPIC_BASE_URL) isn't here: the SDK reads it on its own, and without it
    // uses Anthropic's. The tests change it to their fake model's (test/fake-model.ts).
    ANTHROPIC_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((key) => key || undefined),
    // The model that answers and how much effort it puts in (output_config.effort): with more
    // effort it thinks more before answering, and takes longer and costs more.
    MODEL: z.string().min(1, 'MODEL is empty').default('claude-haiku-5-5'),
    EFFORT: z
      .enum(['low', 'medium', 'high', 'xhigh', 'max'], {
        error: 'EFFORT must be low, medium, high, xhigh or max',
      })
      .default('low'),
    // How many times the SDK repeats a request that fails for something passing (a 429, a 529, a
    // network cut), and how many milliseconds it waits for each attempt at most (the SDK, if not
    // told, waits 10 minutes). The tests set 0 retries and 2 seconds (test/.env).
    MODEL_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    MODEL_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    // The longest the shop waits for the assistant's whole answer, with everything inside: the
    // attempts, the waits between them and, from lesson 3, the rounds with tools. After that time,
    // the call to the model is cancelled and the customer gets a 503. It has to stay under the 60
    // seconds nginx waits for the API (proxy_read_timeout, which nginx/shop.conf leaves at its
    // default): otherwise the customer would get a 504 from nginx, with no Retry-After, instead of
    // the shop's 503. The numbers, with the defaults: three attempts of 15 s and, between them, the
    // SDK's waits (half a second and one, at most), 46.5 s. But if the API answers with retry-after
    // (in a 429, in a 529…), the SDK waits whatever it says before trying again, however long: its
    // only limit is the longest a Node timer can wait, about 24 days (if it asks for more, or zero,
    // or something it can't read, the SDK goes back to its own short waits). A retry-after: 120 is
    // two minutes of waiting, and only this time cuts that: 50 s, with 10 to spare for the database
    // and the network. Lesson 2 uses it when streaming too: it's the longest an answer lasts. The
    // tests set 3 seconds.
    ASSISTANT_TIMEOUT_MS: z.coerce.number().int().positive().default(50_000),
    // #endregion assistant
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
