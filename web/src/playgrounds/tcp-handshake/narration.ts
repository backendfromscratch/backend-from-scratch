/** Turns the lab state into sentences: the narration of each step and the notice at the end. */
import { fill } from '../../lib/fill';
import type { LabState, Narration } from './machine';
import type { Strings } from './strings';

/** A text between the quotes of the language: «Hola, » or “Hi, ”. */
export function quote(t: Strings, text: string): string {
  return `${t.quoteOpen}${text}${t.quoteClose}`;
}

export function narrate(t: Strings, narration: Narration): string {
  const { key, ...data } = narration;
  const values: Record<string, string | number | boolean> = { ...data };
  if ('text' in data) values.text = quote(t, data.text);
  const sentence = fill(t.narration[key], values);
  return 'completesHandshake' in data && data.completesHandshake
    ? `${sentence} ${t.completesHandshake}`
    : sentence;
}

/** The notice at the end, or null if it has not finished yet. */
export function doneMessage(t: Strings, state: LabState): string | null {
  if (!state.done) return null;
  const text = state.server.delivered === '' ? t.nothing : quote(t, state.server.delivered);
  if (state.mode === 'tcp') return fill(t.done, { text });
  const lost = state.rows.filter((row) => row.kind === 'segment' && row.fate === 'lost').length;
  return fill(lost === 0 ? t.udpDone : t.udpDoneLost, { text, lost });
}
