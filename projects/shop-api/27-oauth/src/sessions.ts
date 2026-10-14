// Sessions, in the sessions table (migration 006). A session is a long random id: whoever has it
// has signed in. That's why the id only travels in the cookie, and the table keeps its hash.
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from './db.ts';
import { sessions, users } from './schema.ts';
import type { User } from './users.ts';

// #region create-session
// A week: after that, you have to sign in again.
export const SESSION_DURATION = 7 * 24 * 60 * 60; // in seconds

// 32 random bytes (256 bits): nobody can guess it or try them all. base64url writes it with
// letters, digits, - and _, which fit in a cookie without escaping anything.
// PostgreSQL sets the expiry time: now() plus the duration, the same time as created_at.
export async function createSession(userId: number): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({
    idHash: hashOfId(id),
    userId,
    expiresAt: sql`now() + make_interval(secs => ${SESSION_DURATION})`,
  });
  return id;
}

// SHA-256, a fast hash, and here it's fine: the id is random and very long, so there's no list of
// likely ids to try, as there is for passwords (lesson 1).
const hashOfId = (id: string) => createHash('sha256').update(id).digest();
// #endregion create-session

// #region find-session
// A session's account, or undefined if it doesn't exist or has expired. An expired session is
// deleted right then: that way the table doesn't fill up with old sessions (in a big shop, a
// process would also delete them every night).
export async function sessionUser(id: string): Promise<User | undefined> {
  const [row] = await db
    .select({ id: users.id, email: users.email, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, hashOfId(id)));
  if (row === undefined) return undefined;
  if (row.expiresAt <= new Date()) {
    await deleteSession(id);
    return undefined;
  }
  return { id: row.id, email: row.email };
}
// #endregion find-session

// #region delete-session
// Signing out for real is deleting it here. Deleting the cookie isn't enough: whoever had a copy of
// the id could keep using it.
export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.idHash, hashOfId(id)));
}
// #endregion delete-session
