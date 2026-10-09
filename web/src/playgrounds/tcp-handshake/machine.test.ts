import { describe, expect, it } from 'vitest';
import {
  byteLength,
  initialState,
  reduce,
  type LabConfig,
  type LabState,
  type Mode,
  type Segment,
} from './machine';

const config: LabConfig = { payloads: ['Hola, ', 'todo ', 'bien'], clientIsn: 100, serverIsn: 500 };
const start = (mode: Mode = 'tcp') => initialState(mode, config);

function steps(state: LabState, n: number): LabState {
  let s = state;
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'step' });
  return s;
}

/** Advances to the end. Fails if it does not finish within 100 steps. */
function finish(state: LabState): LabState {
  let s = state;
  for (let i = 0; i < 100 && !s.done; i++) s = reduce(s, { type: 'step' });
  if (!s.done) throw new Error('The lab does not finish');
  return s;
}

function inTransit(state: LabState): Segment[] {
  return state.network.map((id) => {
    const row = state.rows.find((r) => r.id === id);
    if (row?.kind !== 'segment') throw new Error(`There is no segment ${id}`);
    return row.segment;
  });
}

/** Loses the first segment in transit that meets the condition. */
function lose(state: LabState, match: (segment: Segment) => boolean): LabState {
  const segment = inTransit(state).find(match);
  if (!segment) throw new Error('There is no such segment in transit');
  return reduce(state, { type: 'lose', id: segment.id });
}

/** A segment in short text: «C SYN seq=100», «S ACK ack=107», «C "todo " seq=107 ack=501 R». */
function brief(segment: Segment): string {
  const who = segment.from === 'client' ? 'C' : 'S';
  const pureAck = !segment.syn && segment.payload === undefined;
  const what = segment.syn
    ? segment.ack === undefined
      ? 'SYN'
      : 'SYN-ACK'
    : pureAck
      ? 'ACK'
      : `"${segment.payload}"`;
  const seq = segment.seq !== undefined && !pureAck ? ` seq=${segment.seq}` : '';
  const ack = segment.ack !== undefined ? ` ack=${segment.ack}` : '';
  return `${who} ${what}${seq}${ack}${segment.retransmission ? ' R' : ''}`;
}

/** The ladder history: segments in short text and timers like «⏱ client». */
const history = (state: LabState) =>
  state.rows.map((row) => (row.kind === 'segment' ? brief(row.segment) : `⏱ ${row.side}`));

const isData = (payload: string) => (segment: Segment) => segment.payload === payload;
const isClientAck = (segment: Segment) =>
  segment.from === 'client' && !segment.syn && segment.payload === undefined;
const timeouts = (state: LabState) => state.rows.filter((row) => row.kind === 'timeout').length;

describe('TCP mode without losses', () => {
  it('opens the connection with SYN, SYN-ACK and ACK', () => {
    const s = steps(start(), 4);
    expect(history(s)).toEqual(['C SYN seq=100', 'S SYN-ACK seq=500 ack=101', 'C ACK ack=501']);
    expect(s.client.state).toBe('ESTABLISHED');
    expect(s.server.state).toBe('ESTABLISHED');
    expect(s.narration).toEqual({ key: 'server-receives-ack' });
  });

  it('sends the data with the seq of its bytes and delivers it in order', () => {
    const s = finish(start());
    expect(history(s)).toEqual([
      'C SYN seq=100',
      'S SYN-ACK seq=500 ack=101',
      'C ACK ack=501',
      'C "Hola, " seq=101 ack=501',
      'C "todo " seq=107 ack=501',
      'C "bien" seq=112 ack=501',
      'S ACK ack=107',
      'S ACK ack=112',
      'S ACK ack=116',
    ]);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(s.step).toBe(11);
    expect(s.client.timerArmedAt).toBeNull();
    expect(s.server.timerArmedAt).toBeNull();
    expect(s.server.buffered).toEqual([]);
  });

  it('each step tells only one thing', () => {
    let s = start();
    const keys: string[] = [];
    while (!s.done) {
      s = reduce(s, { type: 'step' });
      keys.push(s.narration.key);
    }
    expect(keys).toEqual([
      'client-sends-syn',
      'server-receives-syn',
      'client-receives-synack',
      'server-receives-ack',
      'client-sends-data',
      'server-delivers',
      'server-delivers',
      'server-delivers',
      'client-receives-ack',
      'client-receives-ack',
      'client-receives-final-ack',
    ]);
  });

  it('marks the state changes on the row that causes them', () => {
    const s = steps(start(), 4);
    const changes = s.rows.map((row) => (row.kind === 'segment' ? row.changes : []));
    expect(changes).toEqual([
      [
        { side: 'client', to: 'SYN_SENT' },
        { side: 'server', to: 'SYN_RECEIVED' },
      ],
      [{ side: 'client', to: 'ESTABLISHED' }],
      [{ side: 'server', to: 'ESTABLISHED' }],
    ]);
  });

  it('uses the bytes of the data of each language', () => {
    const en = initialState('tcp', { ...config, payloads: ['Hi, ', 'how are ', 'you?'] });
    const acks = history(finish(en)).filter((line) => line.startsWith('S ACK'));
    expect(acks).toEqual(['S ACK ack=105', 'S ACK ack=113', 'S ACK ack=117']);
  });
});

/** What is lost, at which step and how to recognise it in transit. */
const losses: [string, number, (segment: Segment) => boolean][] = [
  ['el SYN', 1, (g) => g.syn && g.ack === undefined],
  ['el SYN-ACK', 2, (g) => g.syn && g.ack !== undefined],
  ['el ACK del handshake', 3, isClientAck],
  ['el 1.er segmento de datos', 5, isData('Hola, ')],
  ['el 2.º segmento de datos', 5, isData('todo ')],
  ['el 3.er segmento de datos', 5, isData('bien')],
  ['un ACK de datos', 6, (g) => g.from === 'server' && g.ack === 107],
];

describe('losses in TCP: everything always ends up delivered, in order', () => {
  it.each(losses)('si se pierde %s', (_, at, match) => {
    const s = finish(lose(steps(start(), at), match));
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(s.client.state).toBe('ESTABLISHED');
    expect(s.server.state).toBe('ESTABLISHED');
    expect(s.rows.some((row) => row.kind === 'segment' && row.fate === 'lost')).toBe(true);
  });

  it('if a retransmission is lost', () => {
    let s = lose(steps(start(), 5), isData('todo '));
    while (!inTransit(s).some((g) => g.retransmission)) s = steps(s, 1);
    s = finish(lose(s, (g) => g.retransmission));
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(timeouts(s)).toBe(2);
  });

  it('if the same retransmission is lost many times, it finishes as soon as it stops being lost', () => {
    let s = lose(steps(start(), 5), isData('todo '));
    for (let i = 0; i < 5; i++) {
      while (!inTransit(s).some((g) => g.retransmission)) s = steps(s, 1);
      s = lose(s, (g) => g.retransmission);
    }
    s = finish(s);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(timeouts(s)).toBe(6);
  });

  it('if the three data segments are lost at once', () => {
    let s = steps(start(), 5);
    for (const payload of config.payloads) s = lose(s, isData(payload));
    s = finish(s);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(timeouts(s)).toBe(3);
  });
});

describe('narration', () => {
  // If two consecutive steps said the same thing, «Siguiente paso» would seem to do nothing,
  // and the aria-live region would not announce the second.
  it.each(losses)(
    'si se pierde %s, dos pasos seguidos nunca cuentan exactamente lo mismo',
    (_, at, match) => {
      let s = lose(steps(start(), at), match);
      let previous = JSON.stringify(s.narration);
      while (!s.done) {
        s = reduce(s, { type: 'step' });
        const current = JSON.stringify(s.narration);
        expect(current).not.toBe(previous);
        previous = current;
      }
    },
  );
});

describe('specific TCP cases', () => {
  it('if the handshake ACK is lost, the first data completes the connection', () => {
    let s = lose(steps(start(), 3), isClientAck);
    expect(s.server.state).toBe('SYN_RECEIVED');
    s = steps(s, 1);
    expect(s.narration.key).toBe('client-sends-data');
    s = steps(s, 1);
    expect(s.server.state).toBe('ESTABLISHED');
    expect(s.server.timerArmedAt).toBeNull();
    expect(s.narration).toEqual({
      key: 'server-delivers',
      text: 'Hola, ',
      ack: 107,
      completesHandshake: true,
    });
    const row = s.rows.find((r) => r.kind === 'segment' && r.segment.payload === 'Hola, ');
    expect(row?.kind === 'segment' && row.changes).toEqual([{ side: 'server', to: 'ESTABLISHED' }]);
  });

  it('if the 2nd data is lost, the server stores the 3rd and the retransmission completes the text', () => {
    let s = lose(steps(start(), 5), isData('todo '));
    s = steps(s, 1);
    expect(s.server.delivered).toBe('Hola, ');
    s = steps(s, 1);
    expect(s.narration).toEqual({
      key: 'server-buffers',
      text: 'bien',
      ack: 107,
      completesHandshake: false,
    });
    expect(s.server.buffered).toEqual([{ seq: 112, payload: 'bien' }]);
    expect(s.server.delivered).toBe('Hola, ');
    s = steps(s, 2);
    expect(s.narration).toEqual({ key: 'client-ignores-duplicate-ack', ack: 107, position: 8 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'client-timeout-data', seq: 107 });
    expect(inTransit(s).map(brief)).toEqual(['C "todo " seq=107 ack=501 R']);
    s = steps(s, 1);
    expect(s.narration).toEqual({
      key: 'server-delivers',
      text: 'todo bien',
      ack: 116,
      completesHandshake: false,
    });
    expect(s.server.buffered).toEqual([]);
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'client-receives-final-ack', ack: 116 });
    expect(s.done).toBe(true);
    expect(s.server.delivered).toBe('Hola, todo bien');
  });

  it('if the SYN-ACK is lost, the client resends the SYN and the server repeats the SYN-ACK', () => {
    let s = lose(steps(start(), 2), (g) => g.syn && g.ack !== undefined);
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'client-timeout-syn', seq: 100 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'server-repeats-synack', seq: 500, ack: 101 });
    expect(inTransit(s).map(brief)).toEqual(['S SYN-ACK seq=500 ack=101 R']);
  });

  it('if the handshake ACK and the three data are lost, the server repeats the SYN-ACK', () => {
    let s = steps(lose(steps(start(), 3), isClientAck), 1);
    for (const payload of config.payloads) s = lose(s, isData(payload));
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'server-timeout-synack', seq: 500 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'client-repeats-ack', ack: 501 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'server-receives-ack' });
    expect(s.server.state).toBe('ESTABLISHED');
    expect(finish(s).server.delivered).toBe('Hola, todo bien');
  });

  it('if the last ACK is lost, the server discards the retransmission and repeats the ACK', () => {
    let s = lose(steps(start(), 8), (g) => g.from === 'server' && g.ack === 116);
    s = steps(s, 3);
    expect(s.narration).toEqual({ key: 'client-timeout-data', seq: 112 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'server-discards-duplicate', text: 'bien', ack: 116 });
    expect(finish(s).server.delivered).toBe('Hola, todo bien');
  });
});

describe('UDP mode', () => {
  it('without losses, the application receives everything, with no handshake or ACK', () => {
    const s = finish(start('udp'));
    expect(history(s)).toEqual(['C "Hola, "', 'C "todo "', 'C "bien"']);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(s.step).toBe(4);
  });

  it('if a datagram is lost, it does not come back', () => {
    const s = finish(lose(steps(start('udp'), 1), isData('todo ')));
    expect(s.server.delivered).toBe('Hola, bien');
    expect(timeouts(s)).toBe(0);
    expect(history(s)).toEqual(['C "Hola, "', 'C "todo "', 'C "bien"']);
  });

  it('if the last datagram in transit is lost, it finishes immediately', () => {
    const s = lose(steps(start('udp'), 3), isData('bien'));
    expect(s.done).toBe(true);
    expect(s.server.delivered).toBe('Hola, todo ');
  });
});

describe('general rules', () => {
  it('losing a segment that is no longer in transit changes nothing', () => {
    const s = steps(start(), 2);
    const synId = s.rows[0]!.id;
    expect(reduce(s, { type: 'lose', id: synId })).toBe(s);
  });

  it('after the end, «step» changes nothing', () => {
    const s = finish(start());
    expect(reduce(s, { type: 'step' })).toBe(s);
  });

  it('«reset» returns to the initial state of the chosen mode', () => {
    const s = steps(start(), 5);
    expect(reduce(s, { type: 'reset', mode: 'udp' })).toEqual(start('udp'));
  });

  it('does not modify the state it receives', () => {
    const s = steps(start(), 5);
    const copy = structuredClone(s);
    reduce(s, { type: 'step' });
    reduce(s, { type: 'lose', id: s.network[0]! });
    reduce(s, { type: 'reset', mode: 'tcp' });
    expect(s).toEqual(copy);
  });

  it('counts bytes, not characters', () => {
    expect(byteLength('todo ')).toBe(5);
    expect(byteLength('¿qué ')).toBe(7);
  });
});
