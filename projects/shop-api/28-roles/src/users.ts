// The shop's accounts, in the users table (migration 005).
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { db } from './db.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import type { Role } from './permissions.ts';
import type { Identity } from './provider.ts';
import { users } from './schema.ts';

// What the API shows of an account: never the hash.
export interface User {
  id: number;
  email: string;
  role: Role;
}

// #region create-user
// Creates the account with the password's hash. PostgreSQL detects the repeated email, with
// migration 005's unique index (23505): checking it first with a SELECT wouldn't be enough,
// because two sign-ups at once could both pass the check. Drizzle wraps the error: it goes in cause.
export async function createUser(
  email: string,
  password: string,
): Promise<{ user: User } | { error: 'email-taken' }> {
  const passwordHash = await hashPassword(password);
  try {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email, role: users.role });
    return { user: user! };
  } catch (error) {
    if (error instanceof Error && error.cause instanceof DatabaseError) {
      if (error.cause.code === '23505') return { error: 'email-taken' };
    }
    throw error;
  }
}
// #endregion create-user

// #region check-credentials
// The hash of a random password nobody knows. It makes an email that doesn't exist take the same
// time as one that does: without it, the response would arrive 20 ms earlier, and by measuring the
// time you'd know which emails have an account.
const DUMMY_HASH = await hashPassword(randomBytes(32).toString('hex'));

// Returns the account if the email and the password are its own; if not, undefined, without saying
// which of the two fails. An account without a password (it comes in with a provider, lesson 4)
// doesn't get in this way either.
export async function checkCredentials(email: string, password: string): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  // A password is always verified, whether the account exists or not: the same work, the same time.
  const correct = await verifyPassword(password, row?.passwordHash ?? DUMMY_HASH);
  if (row === undefined || row.passwordHash === null || !correct) return undefined;
  return { id: row.id, email: row.email, role: row.role };
}
// #endregion check-credentials

// #region user-from-provider
// The account of whoever comes back from the identity provider:
// 1. If their sub is already in an account, it's that one: the sub doesn't change even if the email
//    changes.
// 2. If not, and there's already an account with their email, it's linked to it (the sub is
//    recorded in it), but only if the provider says it has checked that the email is theirs. If
//    not, anyone could create an account at the provider with Ana's email and get into Ana's.
// 3. If there's none, it's created, without a password.
export async function userFromProvider(
  identity: Identity,
): Promise<{ user: User } | { error: 'no-email' | 'email-not-verified' }> {
  const columns = { id: users.id, email: users.email, role: users.role };
  // #region find-or-link
  const [withSub] = await db.select(columns).from(users).where(eq(users.providerSub, identity.sub));
  if (withSub) return { user: withSub };
  if (identity.email === undefined) return { error: 'no-email' };

  const [withEmail] = await db
    .select(columns)
    .from(users)
    .where(sql`lower(${users.email}) = lower(${identity.email})`);
  if (withEmail) {
    if (!identity.emailVerified) return { error: 'email-not-verified' };
    await db.update(users).set({ providerSub: identity.sub }).where(eq(users.id, withEmail.id));
    return { user: withEmail };
  }
  // #endregion find-or-link

  const [created] = await db
    .insert(users)
    .values({ email: identity.email, providerSub: identity.sub })
    .returning(columns);
  return { user: created! };
}
// #endregion user-from-provider
