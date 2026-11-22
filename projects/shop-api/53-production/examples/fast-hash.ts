// Why SHA-256 is no good for storing passwords, even though it's a good hash: it's fast, and here
// fast works in favor of whoever attacks. Run it with: node examples/fast-hash.ts
// It doesn't need the database.
import { createHash } from 'node:crypto';
import { hashPassword } from '../src/passwords.ts';

// #region sha256
// A million passwords tried with SHA-256, on a single thread of your computer. Whoever steals a
// database of hashes does this same thing with each password on a list, and with a graphics card,
// thousands of times faster.
const TIMES = 1_000_000;
let start = performance.now();
for (let i = 0; i < TIMES; i++) {
  createHash('sha256').update(`password-${i}`).digest();
}
const sha256 = performance.now() - start;
console.log(`A million SHA-256 hashes: ${Math.round(sha256)} ms`);
// #endregion sha256

// #region argon2
// A single hash with argon2id, with the shop's parameters.
start = performance.now();
await hashPassword('password-0');
const argon2 = performance.now() - start;
console.log(`One argon2id hash: ${Math.round(argon2)} ms`);

const howMany = Math.round(argon2 / (sha256 / TIMES));
console.log(
  `In the time one argon2id takes, SHA-256 computes about ${howMany.toLocaleString('en')}.`,
);
// #endregion argon2

// #region salt
// The same password, twice: two different texts, because each one carries its own salt.
console.log('\nThe same password, twice:');
console.log(await hashPassword('a long sentence only I know'));
console.log(await hashPassword('a long sentence only I know'));
// #endregion salt
