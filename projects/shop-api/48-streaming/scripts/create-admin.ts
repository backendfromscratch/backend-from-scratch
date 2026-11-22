// Creates an admin account with a random password and shows it just once. In production there are
// no practice accounts (db:seed:production): the first account is this one.
// Run it with: npm run create-admin -- <email>
import { randomBytes } from 'node:crypto';
import { pool } from '../src/db.ts';
import { newAccountSchema } from '../src/schemas.ts';
import { createUser } from '../src/users.ts';

// The same schema as the API's sign-up: the email is validated here the same way as there.
const checked = newAccountSchema.shape.email.safeParse(process.argv[2]);
if (!checked.success) {
  console.error('Usage: npm run create-admin -- <email>');
  console.error(`The email is not valid: ${checked.error.issues[0]?.message}`);
  process.exit(1);
}

try {
  // 18 random bytes, in base64url: 24 characters, about 144 bits. Nobody has to remember it.
  const password = randomBytes(18).toString('base64url');
  const result = await createUser(checked.data, password, 'admin');
  if ('error' in result) {
    console.error(
      `There is already an account with the email ${checked.data}: nothing was changed`,
    );
    process.exitCode = 1;
  } else {
    console.log(`Admin account created: ${result.user.email}`);
    console.log(`Password (save it now, it is not shown again): ${password}`);
  }
} finally {
  await pool.end();
}
