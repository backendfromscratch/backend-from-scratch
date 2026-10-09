import { describe, expect, it } from 'vitest';
import { initialState, reduce, type LabState, type Narration } from './machine';
import { doneMessage, narrate } from './narration';
import { strings } from './strings';

/** One sample narration per key. The type forces all of them to be present. */
const samples: { [K in Narration['key']]: Extract<Narration, { key: K }> } = {
  intro: { key: 'intro' },
  'udp-intro': { key: 'udp-intro' },
  'client-sends-syn': { key: 'client-sends-syn', seq: 100 },
  'server-receives-syn': { key: 'server-receives-syn', seq: 500, ack: 101 },
  'server-repeats-synack': { key: 'server-repeats-synack', seq: 500, ack: 101 },
  'client-receives-synack': { key: 'client-receives-synack', ack: 501 },
  'client-repeats-ack': { key: 'client-repeats-ack', ack: 501 },
  'server-receives-ack': { key: 'server-receives-ack' },
  'client-sends-data': { key: 'client-sends-data', count: 3, first: 101 },
  'server-delivers': {
    key: 'server-delivers',
    text: 'Hola, ',
    ack: 107,
    completesHandshake: false,
  },
  'server-buffers': { key: 'server-buffers', text: 'bien', ack: 107, completesHandshake: false },
  'server-discards-duplicate': { key: 'server-discards-duplicate', text: 'bien', ack: 116 },
  'client-receives-ack': { key: 'client-receives-ack', ack: 107, pending: 9 },
  'client-receives-final-ack': { key: 'client-receives-final-ack', ack: 116 },
  'client-ignores-duplicate-ack': { key: 'client-ignores-duplicate-ack', ack: 107, position: 8 },
  'segment-lost': { key: 'segment-lost', position: 3 },
  'client-timeout-syn': { key: 'client-timeout-syn', seq: 100 },
  'server-timeout-synack': { key: 'server-timeout-synack', seq: 500 },
  'client-timeout-data': { key: 'client-timeout-data', seq: 107 },
  'udp-client-sends': { key: 'udp-client-sends', count: 3 },
  'udp-server-receives': { key: 'udp-server-receives', text: 'Hola, ' },
  'udp-lost': { key: 'udp-lost', position: 2 },
};

const config = { payloads: ['Hola, ', 'todo ', 'bien'], clientIsn: 100, serverIsn: 500 };

function finish(state: LabState): LabState {
  let s = state;
  while (!s.done) s = reduce(s, { type: 'step' });
  return s;
}

describe('narrate', () => {
  it.each(['es', 'en'] as const)('fills in every sentence in %s', (lang) => {
    for (const narration of Object.values(samples)) {
      const text = narrate(strings[lang], narration);
      expect(text, narration.key).not.toMatch(/[{}]/);
      expect(text.length, narration.key).toBeGreaterThan(20);
    }
  });

  it('puts the data between the quotes of the language', () => {
    expect(narrate(strings.es, samples['server-buffers'])).toContain('«bien»');
    expect(narrate(strings.en, samples['server-buffers'])).toContain('“bien”');
  });

  it('adds a sentence when a piece of data completes the handshake', () => {
    const text = narrate(strings.es, { ...samples['server-delivers'], completesHandshake: true });
    expect(text).toContain(strings.es.completesHandshake);
    expect(narrate(strings.es, samples['server-delivers'])).not.toContain(
      strings.es.completesHandshake,
    );
  });
});

describe('doneMessage', () => {
  it('says nothing if it has not finished', () => {
    expect(doneMessage(strings.es, initialState('tcp', config))).toBeNull();
  });

  it('in TCP, says the delivered text', () => {
    const s = finish(initialState('tcp', config));
    expect(doneMessage(strings.es, s)).toBe('Entregado completo y en orden: «Hola, todo bien».');
  });

  it('in UDP, says how many datagrams were lost', () => {
    let s = reduce(initialState('udp', config), { type: 'step' });
    s = finish(reduce(s, { type: 'lose', id: s.network[1]! }));
    const message = doneMessage(strings.es, s);
    expect(message).toContain('«Hola, bien»');
    expect(message).toContain('Datagramas perdidos: 1');
  });

  it('in UDP, if everything is lost, says (nada)', () => {
    let s = reduce(initialState('udp', config), { type: 'step' });
    for (const id of [...s.network]) s = reduce(s, { type: 'lose', id });
    expect(s.done).toBe(true);
    expect(doneMessage(strings.es, s)).toContain('(nada)');
    expect(doneMessage(strings.es, s)).not.toContain('«»');
  });
});
