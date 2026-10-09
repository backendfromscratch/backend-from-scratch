/** Texts of each ladder row: what shows next to the arrow and what a screen reader reads. */
import { byteLength, type Mode, type Row, type Segment } from './machine';
import { fill } from '../../lib/fill';
import { quote } from './narration';
import type { Strings } from './strings';

/** SYN, SYN-ACK, ACK without data, or null if it carries data. */
function kind(segment: Segment): 'SYN' | 'SYN-ACK' | 'ACK' | null {
  if (segment.syn) return segment.ack === undefined ? 'SYN' : 'SYN-ACK';
  return segment.payload === undefined ? 'ACK' : null;
}

/** Above the arrow: «SYN seq=100», «ACK» or «seq=101 · «Hola, » (6 bytes)». An ACK without data does not show its seq. */
export function segmentTitle(segment: Segment, t: Strings): string {
  const name = kind(segment);
  if (name === 'ACK') return name;
  if (name) return `${name} seq=${segment.seq}`;
  const payload = segment.payload ?? '';
  const data = `${quote(t, payload)} (${fill(t.bytes, { n: byteLength(payload) })})`;
  return segment.seq === undefined ? data : `seq=${segment.seq} · ${data}`;
}

/** Below the arrow: «ack=101», or null if the segment has no ACK. */
export function segmentDetail(segment: Segment): string | null {
  return segment.ack === undefined ? null : `ack=${segment.ack}`;
}

/** The segment in one sentence, for the screen reader and the «Perder» button. */
export function segmentSummary(segment: Segment, t: Strings): string {
  const detail = segmentDetail(segment);
  return [
    segmentTitle(segment, t),
    ...(detail ? [detail] : []),
    ...(segment.retransmission ? [t.retransmission] : []),
  ].join(', ');
}

/** A whole row read out: «3. Cliente → servidor: ACK, ack=501. En tránsito.» */
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

/** Accessible name of the «Perder» button. UDP has no segments, only datagrams. */
export function loseLabel(segment: Segment, position: number, mode: Mode, t: Strings): string {
  return fill(mode === 'udp' ? t.loseLabelUdp : t.loseLabel, {
    n: position,
    summary: segmentSummary(segment, t),
  });
}
