import { describe, expect, it } from 'vitest';
import { loseLabel, rowDescription, segmentDetail, segmentSummary, segmentTitle } from './labels';
import type { Segment } from './machine';
import { strings } from './strings';

const { es, en } = strings;
const segment = (fields: Partial<Segment>): Segment => ({
  id: 1,
  from: 'client',
  syn: false,
  retransmission: false,
  ...fields,
});

describe('segmentTitle and segmentDetail', () => {
  it('SYN', () => {
    const syn = segment({ syn: true, seq: 100 });
    expect(segmentTitle(syn, es)).toBe('SYN seq=100');
    expect(segmentDetail(syn)).toBeNull();
  });

  it('SYN-ACK', () => {
    const synAck = segment({ from: 'server', syn: true, seq: 500, ack: 101 });
    expect(segmentTitle(synAck, es)).toBe('SYN-ACK seq=500');
    expect(segmentDetail(synAck)).toBe('ack=101');
  });

  it('an ACK without data does not show its seq', () => {
    const ack = segment({ seq: 101, ack: 501 });
    expect(segmentTitle(ack, es)).toBe('ACK');
    expect(segmentDetail(ack)).toBe('ack=501');
  });

  it('data, with its bytes and the quotes of the language', () => {
    expect(segmentTitle(segment({ seq: 101, ack: 501, payload: 'Hola, ' }), es)).toBe(
      'seq=101 · «Hola, » (6 bytes)',
    );
    expect(segmentTitle(segment({ seq: 101, ack: 501, payload: 'Hi, ' }), en)).toBe(
      'seq=101 · “Hi, ” (4 bytes)',
    );
  });

  it('a UDP datagram has no seq or ack', () => {
    const datagram = segment({ payload: 'Hola, ' });
    expect(segmentTitle(datagram, es)).toBe('«Hola, » (6 bytes)');
    expect(segmentDetail(datagram)).toBeNull();
  });
});

describe('segmentSummary', () => {
  it('joins title, ack and retransmission', () => {
    const resent = segment({ seq: 107, ack: 501, payload: 'todo ', retransmission: true });
    expect(segmentSummary(resent, es)).toBe('seq=107 · «todo » (5 bytes), ack=501, reenvío');
  });
});

describe('rowDescription', () => {
  it('reads a whole segment row, with its state changes', () => {
    const row = {
      kind: 'segment' as const,
      id: 1,
      segment: segment({ syn: true, seq: 100 }),
      fate: 'delivered' as const,
      changes: [
        { side: 'client' as const, to: 'SYN_SENT' as const },
        { side: 'server' as const, to: 'SYN_RECEIVED' as const },
      ],
    };
    expect(rowDescription(row, 1, es)).toBe(
      '1. Cliente → servidor: SYN seq=100. Entregado. El cliente pasa a SYN_SENT. El servidor pasa a SYN_RECEIVED.',
    );
  });

  it('reads a timer row', () => {
    expect(rowDescription({ kind: 'timeout', id: 9, side: 'server' }, 4, es)).toBe(
      '4. Vence el temporizador del servidor.',
    );
  });
});

describe('loseLabel', () => {
  it('in TCP it talks about segments', () => {
    expect(loseLabel(segment({ syn: true, seq: 100 }), 1, 'tcp', es)).toBe(
      'Perder el segmento 1: SYN seq=100',
    );
  });

  it('in UDP it talks about datagrams', () => {
    expect(loseLabel(segment({ payload: 'bien' }), 3, 'udp', es)).toBe(
      'Perder el datagrama 3: «bien» (4 bytes)',
    );
    expect(loseLabel(segment({ payload: 'you?' }), 3, 'udp', en)).toBe(
      'Lose datagram 3: “you?” (4 bytes)',
    );
  });
});
