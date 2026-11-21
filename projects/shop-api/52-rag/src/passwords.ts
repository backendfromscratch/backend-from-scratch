// Passwords: how they're stored (a slow hash, with salt) and what rules they have to meet.
// The shop never stores a password: it stores its hash, and to check a password it computes the
// hash again and compares the two.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

// #region parameters
// argon2id with the minimum OWASP recommends (Password Storage Cheat Sheet): 19 MiB of memory,
// 2 passes and 1 thread. It's slow on purpose: about 20 or 40 ms per hash. Whoever signs in doesn't
// notice; for whoever tries a billion passwords, it's years. And it needs memory, which is what
// costs the most for a graphics card that tries thousands at once.
// crypto.argon2 has shipped with Node since version 24.7, and Node 26's documentation no longer
// marks it experimental. On an older Node, the alternative is the @node-rs/argon2 package.
const PARAMETERS = {
  memory: 19_456, // in KiB: 19 MiB
  passes: 2,
  parallelism: 1,
  tagLength: 32, // the hash: 32 bytes
};
const SALT_BYTES = 16;

// argon2 reports back with a callback, like Node's old functions. promisify turns it into one
// that returns a promise, to use it with await.
const compute = promisify(argon2);
// #endregion parameters

// #region hash
// Before anything else, normalize('NFKC'): é can be written as a single letter or as an e plus an
// accent, depending on the keyboard. Normalized, the same password always gives the same bytes.
// The salt: 16 random bytes, different in each hash. With it, two people with the same password
// have different hashes, and a table of precomputed hashes (a rainbow table) is no use at all.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await compute('argon2id', {
    ...PARAMETERS,
    message: password.normalize('NFKC'),
    nonce: salt,
  });
  // The PHC format: the algorithm, its version, the parameters, the salt and the hash, separated by
  // $. With all that in the same text, verifyPassword() knows how to repeat the computation, even if
  // tomorrow the parameters go up for new passwords.
  const { memory: m, passes: t, parallelism: p } = PARAMETERS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${toBase64(salt)}$${toBase64(hash)}`;
}

// PHC uses base64 without the padding (=) at the end.
const toBase64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
// #endregion hash

// #region verify
// Repeats the computation with the stored salt and parameters, and compares. timingSafeEqual takes
// the same time whether it matches or not (Phase 4, the webhooks' signature).
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, algorithm, version, parameters, salt, hash] = stored.split('$');
  const numbers = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(parameters ?? '');
  if (algorithm !== 'argon2id' || version !== 'v=19' || !numbers || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const computed = await compute('argon2id', {
    memory: Number(numbers[1]),
    passes: Number(numbers[2]),
    parallelism: Number(numbers[3]),
    tagLength: expected.length,
    message: password.normalize('NFKC'),
    nonce: Buffer.from(salt, 'base64'),
  });
  return timingSafeEqual(computed, expected);
}
// #endregion verify

// #region rules
// NIST's rules (SP 800-63B-4): a minimum length and a list of known passwords. None of "one
// capital, one number and one symbol", nor changing it every three months: with those rules people
// end up with Password1! and Password2!, easy to guess.
const MIN_LENGTH = 15; // NIST: 15 for a password used on its own, without a second factor
const MAX_LENGTH = 128; // a generous cap: NIST asks to accept at least 64

// The common passwords, in lowercase, in a Set: looking something up in it is instant. Lines that
// start with # are the file's comments.
const COMMON = new Set(
  readFileSync(new URL('common-passwords.txt', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.toLowerCase()),
);

// Returns what's wrong with the password, or undefined if it's fine. The length is counted in
// characters: [...text] separates emojis and unusual letters, which in JavaScript take up two
// "letters" of length.
export function passwordProblem(password: string): string | undefined {
  const characters = [...password.normalize('NFKC')].length;
  if (characters < MIN_LENGTH) return `At least ${MIN_LENGTH} characters: a sentence will do`;
  if (characters > MAX_LENGTH) return `At most ${MAX_LENGTH} characters`;
  if (COMMON.has(password.toLowerCase())) {
    return "It's one of the most used passwords: it's the first thing anyone tries";
  }
  return undefined;
}
// #endregion rules
