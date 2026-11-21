// Creates an API key and shows it only once. Run it with: npm run create-key -- <name>
// For example: npm run create-key -- "Fast Delivery"
// Since Phase 11, with a role after it (delivery, if none is given): delivery, admin or catalogue.
// For example: npm run create-key -- "Price Comparison" catalogue
import { createKey, KEY_ROLES, type KeyRole } from '../src/api-keys.ts';
import { pool } from '../src/db.ts';

const [name, role = 'delivery'] = process.argv.slice(2);
const isRole = (text: string): text is KeyRole => (KEY_ROLES as readonly string[]).includes(text);
if (!name || !isRole(role)) {
  console.error(`Usage: npm run create-key -- <name> [${KEY_ROLES.join(' | ')}]`);
  process.exit(1);
}

try {
  const { id, key } = await createKey(name, role);
  console.log(`Key ${id}, for "${name}" (role ${role}):`);
  console.log(key);
  console.log('Copy it now: the shop only keeps its hash and cannot show it to you again.');
} finally {
  await pool.end();
}
