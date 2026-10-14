// Creates an API key and shows it only once. Run it with: npm run create-key -- <name>
// For example: npm run create-key -- "Fast Delivery"
import { createKey } from '../src/api-keys.ts';
import { pool } from '../src/db.ts';

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run create-key -- <name>');
  process.exit(1);
}

try {
  const { id, key } = await createKey(name);
  console.log(`Key ${id}, for "${name}":`);
  console.log(key);
  console.log('Copy it now: the shop only keeps its hash and cannot show it to you again.');
} finally {
  await pool.end();
}
