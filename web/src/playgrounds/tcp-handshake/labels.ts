/** Textos de cada fila de la escalera: lo que se ve junto a la flecha y lo que lee un lector de pantalla. */
import { byteLength, type Mode, type Row, type Segment } from './machine';
import { fill } from '../../lib/fill';
import { quote } from './narration';
import type { Strings } from './strings';

/** SYN, SYN-ACK, ACK sin datos, o null si lleva datos. */
function kind(segment: Segment): 'SYN' | 'SYN-ACK' | 'ACK' | null {
  if (segment.syn) return segment.ack === undefined ? 'SYN' : 'SYN-ACK';
  return segment.payload === undefined ? 'ACK' : null;
}

/** Encima de la flecha: «SYN seq=100», «ACK» o «seq=101 · «Hola, » (6 bytes)». Un ACK sin datos no enseña su seq. */
export function segmentTitle(segment: Segment, t: Strings): string {
  const name = kind(segment);
  if (name === 'ACK') return name;
  if (name) return `${name} seq=${segment.seq}`;
  const payload = segment.payload ?? '';
  const data = `${quote(t, payload)} (${fill(t.bytes, { n: byteLength(payload) })})`;
  return segment.seq === undefined ? data : `seq=${segment.seq} · ${data}`;
}

/** Debajo de la flecha: «ack=101», o null si el segmento no lleva ACK. */
export function segmentDetail(segment: Segment): string | null {
  return segment.ack === undefined ? null : `ack=${segment.ack}`;
}

/** El segmento en una frase, para el lector de pantalla y el botón «Perder». */
export function segmentSummary(segment: Segment, t: Strings): string {
  const detail = segmentDetail(segment);
  return [
    segmentTitle(segment, t),
    ...(detail ? [detail] : []),
    ...(segment.retransmission ? [t.retransmission] : []),
  ].join(', ');
}

/** Una fila leída entera: «3. Cliente → servidor: ACK, ack=501. En tránsito.» */
export function rowDescription(row: Row, position: number, t: Strings): string {
  if (row.kind === 'timeout') {
    return `${position}. ${fill(t.timeoutRow, { side: t.sideName[row.side] })}.`;
  }
  const route = row.segment.from === 'client' ? t.routeToServer : t.routeToClient;
  const changes = row.changes.map((change) =>
    fill(t.stateChange, { side: t.sideName[change.side], state: change.to }),
  );
  return [
    `${position}. ${route}: ${segmentSummary(row.segment, t)}.`,
    `${t.fate[row.fate]}.`,
    ...changes,
  ].join(' ');
}

/** Nombre accesible del botón «Perder». En UDP no hay segmentos, sino datagramas. */
export function loseLabel(segment: Segment, position: number, mode: Mode, t: Strings): string {
  return fill(mode === 'udp' ? t.loseLabelUdp : t.loseLabel, {
    n: position,
    summary: segmentSummary(segment, t),
  });
}
