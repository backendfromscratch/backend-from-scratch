// Writes contract.json: the contract of /v2 as the API publishes it now (Phase 10, lesson 3).
// It goes into Git: a change to the contract shows in the review's diff, and test/contract.test.ts
// fails while contract.json doesn't match. If the change is the one you wanted: npm run contract.
import { writeFile } from 'node:fs/promises';
import { contractDocument } from '../src/contract-responses.ts';

await writeFile('contract.json', `${JSON.stringify(contractDocument(), null, 2)}\n`);
console.log('contract.json written');
process.exit(0);
