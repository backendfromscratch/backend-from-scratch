// API keys (migration 007): how a program identifies itself, like the delivery company's. A key is
// like a session that doesn't expire and that doesn't travel in a cookie, but in
// Authorization: Bearer <key>.
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from './db.ts';
import type { Role } from './permissions.ts';
import { apiKeys } from './schema.ts';

export interface ApiKey {
  id: number;
  name: string;
  role: Role;
}

// #region create-key
// They all start with shop_: whoever finds one in a log or in a repository knows where it's from
// (and GitHub can recognize them and warn, as it does with other companies' keys). After it, 32
// random bytes.
export const KEY_PREFIX = 'shop_';

// The roles a key can have (the table's CHECK constraint): never customer, because a program has
// no orders of its own. catalogue, since Phase 11 (migration 013).
export const KEY_ROLES = ['delivery', 'admin', 'catalogue'] as const;
export type KeyRole = (typeof KEY_ROLES)[number];

// Returns the key only once: the table only keeps its hash. If it's lost, another one is created.
// Without a role, the delivery company's, as since Phase 6.
export async function createKey(
  name: string,
  role: KeyRole = 'delivery',
): Promise<{ id: number; key: string }> {
  const key = KEY_PREFIX + randomBytes(32).toString('base64url');
  const [row] = await db
    .insert(apiKeys)
    .values({ name, hash: hashOfKey(key), role })
    .returning({ id: apiKeys.id });
  return { id: row!.id, key };
}

// SHA-256, like the sessions' id: the key is random and long, a slow hash isn't needed.
const hashOfKey = (key: string) => createHash('sha256').update(key).digest();
// #endregion create-key

// #region find-key
// The key that matches that text, or undefined. A single query finds it by its hash and records
// that it has been used now (UPDATE … RETURNING).
export async function findKey(key: string): Promise<ApiKey | undefined> {
  const [row] = await db
    .update(apiKeys)
    .set({ usedAt: sql`now()` })
    .where(eq(apiKeys.hash, hashOfKey(key)))
    .returning({ id: apiKeys.id, name: apiKeys.name, role: apiKeys.role });
  return row;
}
// #endregion find-key
