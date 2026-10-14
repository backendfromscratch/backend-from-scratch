/**
 * Turns the lab's data into text in the page's language: sizes, seconds, file lists and the
 * sentence of the last action.
 */
import { fill } from '../../lib/fill';
import type { Locale } from '../../lib/locales';
import { displayText, fileGroups, type FileGroup, type Instruction } from './dockerfile';
import type { Narration } from './lab-state';
import { humanBytes } from './measure';
import type { Strings } from './strings';

const number = (lang: Locale, value: number) =>
  new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(value);

export function formatBytes(t: Strings, lang: Locale, bytes: number): string {
  const { amount, unit } = humanBytes(bytes);
  return fill(t.bytes[unit], { n: number(lang, amount) });
}

export function formatSeconds(t: Strings, lang: Locale, seconds: number): string {
  return fill(t.seconds, {
    n: new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      seconds,
    ),
  });
}

/** What a COPY takes, in words: «package.json y package-lock.json», «todo lo que no está en .dockerignore». */
export function describeFiles(t: Strings, lang: Locale, files: readonly FileGroup[]): string {
  if (files.length === fileGroups.length) return t.everything;
  return new Intl.ListFormat(lang, { type: 'conjunction' }).format(files.map((f) => t.files[f]));
}

/** An instruction inside a sentence, with its stage when the Dockerfile has several. */
export function quote(t: Strings, instruction: Instruction): string {
  const text = displayText(instruction.text);
  return instruction.stage === ''
    ? fill(t.quoted, { text })
    : fill(t.quotedInStage, { text, stage: instruction.stage });
}

/** The sentence of the last action. `building` is the label of the build button now. */
export function narrate(
  t: Strings,
  lang: Locale,
  narration: Narration,
  instructions: readonly Instruction[],
  building: string,
): string {
  switch (narration.key) {
    case 'intro':
    case 'all-cached':
      return t.narration[narration.key];
    case 'variant':
      return t.narration.variant[narration.variant];
    case 'changed':
      return fill(t.narration.changed[narration.change], { button: building });
    case 'first-build':
      return fill(t.narration['first-build'], {
        seconds: formatSeconds(t, lang, narration.seconds),
      });
    case 'rebuilt-one':
      return fill(t.narration['rebuilt-one'], {
        cached: narration.cached,
        step: quote(t, instructions[narration.step]!),
        seconds: formatSeconds(t, lang, narration.seconds),
      });
    case 'rebuilt':
      return fill(t.narration.rebuilt, {
        cached: narration.cached,
        rebuilt: narration.rebuilt,
        first: quote(t, instructions[narration.first]!),
        slowest: quote(t, instructions[narration.slowest]!),
        slowestSeconds: formatSeconds(t, lang, narration.slowestSeconds),
        seconds: formatSeconds(t, lang, narration.seconds),
      });
  }
}
