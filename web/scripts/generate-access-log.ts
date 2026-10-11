// Writes the practice log for Phase 1 (lessons 2 and 3) to public/practicas/access.log.
// Run it with `pnpm --filter web practice:log` after changing src/lib/practice/access-log.ts:
// a test fails while the served file and the generator do not match.
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateAccessLog } from '../src/lib/practice/access-log.ts';

const file = new URL('../public/practicas/access.log', import.meta.url);
mkdirSync(new URL('.', file), { recursive: true });
writeFileSync(file, generateAccessLog());
console.log(`Written ${file.pathname}`);
