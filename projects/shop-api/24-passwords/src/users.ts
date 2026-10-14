// The shop's accounts, in the users table (migration 005).
import { DatabaseError } from 'pg';
import { db } from './db.ts';
import { hashPassword } from './passwords.ts';
import { users } from './schema.ts';

// What the API shows of an account: never the hash.
export interface User {
  id: number;
  email: string;
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
      .returning({ id: users.id, email: users.email });
    return { user: user! };
  } catch (error) {
    if (error instanceof Error && error.cause instanceof DatabaseError) {
      if (error.cause.code === '23505') return { error: 'email-taken' };
    }
    throw error;
  }
}
// #endregion create-user
