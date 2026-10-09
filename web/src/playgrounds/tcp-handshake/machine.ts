/**
 * tcp-handshake lab: the logic, without interface. (state, event) → state.
 *
 * Simulates the TCP handshake, the sending of three data segments with their ACKs, and UDP mode.
 * The reader advances step by step and can lose any segment in transit.
 * It knows nothing about React or languages: the interface draws it and strings.ts supplies the sentences.
 * Spec: docs/specs/2026-10-03-tcp-lab-design.md
 */

export type Mode = 'tcp' | 'udp';
export type Side = 'client' | 'server';
export type TcpState = 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RECEIVED' | 'ESTABLISHED';
export type Fate = 'in-transit' | 'delivered' | 'lost';

export interface Segment {
  /** Identifier of its row in the ladder. */
  id: number;
  from: Side;
  syn: boolean;
  /** Number of the first byte (in the SYN, the initial number). UDP has none. */
  seq?: number;
  /** The next byte the sender expects. Only if it has the ACK flag. */
  ack?: number;
  payload?: string;
  retransmission: boolean;
}

export interface StateChange {
  side: Side;
  to: TcpState;
}

export type Row =
  | { kind: 'segment'; id: number; segment: Segment; fate: Fate; changes: StateChange[] }
  | { kind: 'timeout'; id: number; side: Side };

export type SegmentRow = Extract<Row, { kind: 'segment' }>;

/** What happened in the last step. strings.ts turns it into a sentence. */
export type Narration =
  | { key: 'intro' }
  | { key: 'udp-intro' }
  | { key: 'client-sends-syn'; seq: number }
  | { key: 'server-receives-syn'; seq: number; ack: number }
  | { key: 'server-repeats-synack'; seq: number; ack: number }
  | { key: 'client-receives-synack'; ack: number }
  | { key: 'client-repeats-ack'; ack: number }
  | { key: 'server-receives-ack' }
  | { key: 'client-sends-data'; count: number; first: number }
  | { key: 'server-delivers'; text: string; ack: number; completesHandshake: boolean }
  | { key: 'server-buffers'; text: string; ack: number; completesHandshake: boolean }
  | { key: 'server-discards-duplicate'; text: string; ack: number }
  | { key: 'client-receives-ack'; ack: number; pending: number }
  | { key: 'client-receives-final-ack'; ack: number }
  | { key: 'client-ignores-duplicate-ack'; ack: number; position: number }
  | { key: 'segment-lost'; position: number }
  | { key: 'client-timeout-syn'; seq: number }
  | { key: 'server-timeout-synack'; seq: number }
  | { key: 'client-timeout-data'; seq: number }
  | { key: 'udp-client-sends'; count: number }
  | { key: 'udp-server-receives'; text: string }
  | { key: 'udp-lost'; position: number };

export interface LabConfig {
  /** The data the client sends, one segment per text. */
  payloads: string[];
  /** Initial sequence numbers. In reality they are random. */
  clientIsn: number;
  serverIsn: number;
}

export const DEFAULT_ISN = { client: 100, server: 500 } as const;

export interface LabState {
  mode: Mode;
  config: LabConfig;
  /** Steps taken. Used to know which timer was armed first. */
  step: number;
  nextId: number;
  client: {
    state: TcpState;
    /** Step at which the timer was armed, or null if it is stopped. */
    timerArmedAt: number | null;
    dataSent: boolean;
    /** First unacknowledged byte. */
    unacked: number;
  };
  server: {
    state: TcpState;
    timerArmedAt: number | null;
    /** Next byte it expects. */
    expected: number;
    /** What the application has already received. */
    delivered: string;
    /** Segments that arrived out of order, stored undelivered, sorted by seq. */
    buffered: { seq: number; payload: string }[];
  };
  /** Ids of the segments in transit, oldest to newest: the network is a queue. */
  network: number[];
  rows: Row[];
  narration: Narration;
  done: boolean;
}

export type LabEvent =
  { type: 'step' } | { type: 'lose'; id: number } | { type: 'reset'; mode: Mode };

/** TCP counts bytes, not characters: «¿» and «é» take two bytes in UTF-8. */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/** The client's data segments with their seq: the first goes after the SYN, and each one after the bytes of the previous one. */
function dataPieces(config: LabConfig): { seq: number; payload: string }[] {
  let seq = config.clientIsn + 1;
  return config.payloads.map((payload) => {
    const piece = { seq, payload };
    seq += byteLength(payload);
    return piece;
  });
}

/** The byte after the last data: when the ACK reaches here, everything is acknowledged. */
function dataEnd(config: LabConfig): number {
  return config.payloads.reduce((end, payload) => end + byteLength(payload), config.clientIsn + 1);
}

export function initialState(mode: Mode, config: LabConfig): LabState {
  return {
    mode,
    config,
    step: 0,
    nextId: 1,
    client: { state: 'CLOSED', timerArmedAt: null, dataSent: false, unacked: config.clientIsn },
    server: {
      state: mode === 'tcp' ? 'LISTEN' : 'CLOSED',
      timerArmedAt: null,
      expected: config.clientIsn + 1,
      delivered: '',
      buffered: [],
    },
    network: [],
    rows: [],
    narration: { key: mode === 'tcp' ? 'intro' : 'udp-intro' },
    done: false,
  };
}

export function canStep(state: LabState): boolean {
  return !state.done;
}

export function reduce(state: LabState, event: LabEvent): LabState {
  switch (event.type) {
    case 'reset':
      return initialState(event.mode, state.config);
    case 'lose':
      return lose(state, event.id);
    case 'step':
      return step(state);
  }
}

function lose(state: LabState, id: number): LabState {
  if (!state.network.includes(id)) return state;
  const s = structuredClone(state);
  s.network = s.network.filter((other) => other !== id);
  segmentRow(s, id).fate = 'lost';
  const position = s.rows.findIndex((row) => row.id === id) + 1;
  s.narration =
    s.mode === 'tcp' ? { key: 'segment-lost', position } : { key: 'udp-lost', position };
  s.done = isDone(s);
  return s;
}

function step(state: LabState): LabState {
  if (state.done) return state;
  const s = structuredClone(state);
  s.step += 1;
  if (s.mode === 'tcp') tcpStep(s);
  else udpStep(s);
  s.done = isDone(s);
  return s;
}

function isDone(s: LabState): boolean {
  if (!s.client.dataSent || s.network.length > 0) return false;
  return s.mode === 'udp' || s.client.unacked === dataEnd(s.config);
}

function segmentRow(s: LabState, id: number): SegmentRow {
  const row = s.rows.find((r) => r.id === id);
  if (row?.kind !== 'segment') throw new Error(`There is no segment with id ${id}`);
  return row;
}

/** Puts a segment on the network and its row in the ladder. Returns the row, which is still the one in `s.rows`. */
function send(s: LabState, segment: Omit<Segment, 'id'>): SegmentRow {
  const id = s.nextId++;
  const row: SegmentRow = {
    kind: 'segment',
    id,
    segment: { ...segment, id },
    fate: 'in-transit',
    changes: [],
  };
  s.rows.push(row);
  s.network.push(id);
  return row;
}

// --- TCP ---

/** One step: the oldest segment arrives; if none, someone sends what is pending; otherwise, a timer expires. */
function tcpStep(s: LabState): void {
  const oldest = s.network.shift();
  if (oldest !== undefined) return deliver(s, oldest);
  if (s.client.state === 'CLOSED') return sendSyn(s, false);
  if (s.client.state === 'ESTABLISHED' && !s.client.dataSent) return sendData(s);
  fireTimer(s);
}

function sendSyn(s: LabState, retransmission: boolean): void {
  const row = send(s, { from: 'client', syn: true, seq: s.config.clientIsn, retransmission });
  s.client.timerArmedAt = s.step;
  if (retransmission) return;
  s.client.state = 'SYN_SENT';
  row.changes.push({ side: 'client', to: 'SYN_SENT' });
  s.narration = { key: 'client-sends-syn', seq: s.config.clientIsn };
}

function sendSynAck(s: LabState, retransmission: boolean): void {
  send(s, {
    from: 'server',
    syn: true,
    seq: s.config.serverIsn,
    ack: s.config.clientIsn + 1,
    retransmission,
  });
}

function sendData(s: LabState): void {
  for (const piece of dataPieces(s.config)) {
    send(s, {
      from: 'client',
      syn: false,
      seq: piece.seq,
      ack: s.config.serverIsn + 1,
      payload: piece.payload,
      retransmission: false,
    });
  }
  s.client.dataSent = true;
  s.client.timerArmedAt ??= s.step;
  s.narration = {
    key: 'client-sends-data',
    count: s.config.payloads.length,
    first: s.config.clientIsn + 1,
  };
}

/** An ACK without data from the client. Its seq is not shown; it is the next byte it would send. */
function sendClientAck(s: LabState): void {
  send(s, {
    from: 'client',
    syn: false,
    seq: s.client.dataSent ? dataEnd(s.config) : s.config.clientIsn + 1,
    ack: s.config.serverIsn + 1,
    retransmission: false,
  });
}

function sendServerAck(s: LabState): void {
  send(s, {
    from: 'server',
    syn: false,
    seq: s.config.serverIsn + 1,
    ack: s.server.expected,
    retransmission: false,
  });
}

function deliver(s: LabState, id: number): void {
  const row = segmentRow(s, id);
  row.fate = 'delivered';
  if (row.segment.from === 'client') serverReceives(s, row);
  else clientReceives(s, row);
}

function serverReceives(s: LabState, row: SegmentRow): void {
  const { segment } = row;
  const { server } = s;
  const { clientIsn, serverIsn } = s.config;

  if (segment.syn) {
    if (server.state === 'LISTEN') {
      server.state = 'SYN_RECEIVED';
      row.changes.push({ side: 'server', to: 'SYN_RECEIVED' });
      sendSynAck(s, false);
      server.timerArmedAt = s.step;
      s.narration = { key: 'server-receives-syn', seq: serverIsn, ack: clientIsn + 1 };
    } else {
      sendSynAck(s, true);
      s.narration = { key: 'server-repeats-synack', seq: serverIsn, ack: clientIsn + 1 };
    }
    return;
  }

  // Everything that is not a SYN carries ack=server ISN + 1: it completes the handshake if it was missing.
  let completesHandshake = false;
  if (server.state === 'SYN_RECEIVED' && segment.ack === serverIsn + 1) {
    server.state = 'ESTABLISHED';
    server.timerArmedAt = null;
    row.changes.push({ side: 'server', to: 'ESTABLISHED' });
    completesHandshake = true;
  }

  if (segment.payload === undefined || segment.seq === undefined) {
    s.narration = { key: 'server-receives-ack' };
    return;
  }
  receiveData(s, segment.seq, segment.payload, completesHandshake);
}

function receiveData(s: LabState, seq: number, payload: string, completesHandshake: boolean): void {
  const { server } = s;

  if (seq < server.expected) {
    sendServerAck(s);
    s.narration = { key: 'server-discards-duplicate', text: payload, ack: server.expected };
    return;
  }

  if (seq > server.expected) {
    if (!server.buffered.some((piece) => piece.seq === seq)) {
      server.buffered.push({ seq, payload });
      server.buffered.sort((a, b) => a.seq - b.seq);
    }
    sendServerAck(s);
    s.narration = {
      key: 'server-buffers',
      text: payload,
      ack: server.expected,
      completesHandshake,
    };
    return;
  }

  // What it expected arrives: it is delivered, and after it everything stored that now fits.
  let text = payload;
  server.expected += byteLength(payload);
  for (
    let i = server.buffered.findIndex((piece) => piece.seq === server.expected);
    i !== -1;
    i = server.buffered.findIndex((piece) => piece.seq === server.expected)
  ) {
    const [piece] = server.buffered.splice(i, 1);
    text += piece.payload;
    server.expected += byteLength(piece.payload);
  }
  server.delivered += text;
  sendServerAck(s);
  s.narration = { key: 'server-delivers', text, ack: server.expected, completesHandshake };
}

function clientReceives(s: LabState, row: SegmentRow): void {
  const { segment } = row;
  const { client } = s;
  const { clientIsn, serverIsn } = s.config;

  if (segment.syn) {
    if (client.state === 'SYN_SENT') {
      client.state = 'ESTABLISHED';
      client.timerArmedAt = null;
      client.unacked = clientIsn + 1;
      row.changes.push({ side: 'client', to: 'ESTABLISHED' });
      sendClientAck(s);
      s.narration = { key: 'client-receives-synack', ack: serverIsn + 1 };
    } else {
      sendClientAck(s);
      s.narration = { key: 'client-repeats-ack', ack: serverIsn + 1 };
    }
    return;
  }

  const ack = segment.ack ?? client.unacked;
  if (ack <= client.unacked) {
    // The row goes in the sentence: if two duplicate ACKs arrive in a row, each step says something different.
    s.narration = { key: 'client-ignores-duplicate-ack', ack, position: s.rows.indexOf(row) + 1 };
    return;
  }
  // The ACK is cumulative: it acknowledges all previous bytes.
  client.unacked = ack;
  const pending = dataEnd(s.config) - ack;
  if (pending > 0) {
    client.timerArmedAt = s.step;
    s.narration = { key: 'client-receives-ack', ack, pending };
  } else {
    client.timerArmedAt = null;
    s.narration = { key: 'client-receives-final-ack', ack };
  }
}

/** The timer armed earliest expires (on a tie, the client's) and the oldest unacknowledged data is resent. */
function fireTimer(s: LabState): void {
  const { client, server } = s;
  const side: Side | null =
    client.timerArmedAt !== null &&
    (server.timerArmedAt === null || client.timerArmedAt <= server.timerArmedAt)
      ? 'client'
      : server.timerArmedAt !== null
        ? 'server'
        : null;
  if (side === null) {
    throw new Error('Nothing in transit, nothing pending and no timer: it should have finished');
  }
  s.rows.push({ kind: 'timeout', id: s.nextId++, side });

  if (side === 'server') {
    sendSynAck(s, true);
    server.timerArmedAt = s.step;
    s.narration = { key: 'server-timeout-synack', seq: s.config.serverIsn };
    return;
  }
  if (client.state === 'SYN_SENT') {
    sendSyn(s, true);
    s.narration = { key: 'client-timeout-syn', seq: s.config.clientIsn };
    return;
  }
  const piece = dataPieces(s.config).find((p) => p.seq === client.unacked);
  if (!piece) throw new Error(`No segment starts at byte ${client.unacked}`);
  send(s, {
    from: 'client',
    syn: false,
    seq: piece.seq,
    ack: s.config.serverIsn + 1,
    payload: piece.payload,
    retransmission: true,
  });
  client.timerArmedAt = s.step;
  s.narration = { key: 'client-timeout-data', seq: piece.seq };
}

// --- UDP ---

/** One step: the first sends all the datagrams; each next one delivers the oldest, as is. */
function udpStep(s: LabState): void {
  if (!s.client.dataSent) {
    for (const payload of s.config.payloads) {
      send(s, { from: 'client', syn: false, payload, retransmission: false });
    }
    s.client.dataSent = true;
    s.narration = { key: 'udp-client-sends', count: s.config.payloads.length };
    return;
  }
  const id = s.network.shift();
  if (id === undefined) throw new Error('UDP: nothing in transit; it should have finished');
  const row = segmentRow(s, id);
  row.fate = 'delivered';
  const text = row.segment.payload ?? '';
  s.server.delivered += text;
  s.narration = { key: 'udp-server-receives', text };
}
