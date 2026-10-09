/** Convierte el estado del laboratorio en frases: la narración de cada paso y el aviso del final. */
import { fill } from '../../lib/fill';
import type { LabState, Narration } from './machine';
import type { Strings } from './strings';

/** Un texto entre las comillas del idioma: «Hola, » o “Hi, ”. */
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

/** El aviso del final, o null si aún no ha terminado. */
export function doneMessage(t: Strings, state: LabState): string | null {
  if (!state.done) return null;
  const text = state.server.delivered === '' ? t.nothing : quote(t, state.server.delivered);
  if (state.mode === 'tcp') return fill(t.done, { text });
  const lost = state.rows.filter((row) => row.kind === 'segment' && row.fate === 'lost').length;
  return fill(lost === 0 ? t.udpDone : t.udpDoneLost, { text, lost });
}
