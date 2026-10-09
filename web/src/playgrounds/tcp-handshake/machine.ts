/**
 * Laboratorio tcp-handshake: la lógica, sin interfaz. (estado, evento) → estado.
 *
 * Simula el handshake de TCP, el envío de tres segmentos de datos con sus ACK y el modo UDP.
 * El lector avanza paso a paso y puede perder cualquier segmento en tránsito.
 * No sabe nada de React ni de idiomas: la interfaz lo pinta y strings.ts pone las frases.
 * Spec: docs/specs/2026-10-03-laboratorio-tcp-design.md
 */

export type Mode = 'tcp' | 'udp';
export type Side = 'client' | 'server';
export type TcpState = 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RECEIVED' | 'ESTABLISHED';
export type Fate = 'in-transit' | 'delivered' | 'lost';

export interface Segment {
  /** Identificador de su fila en la escalera. */
  id: number;
  from: Side;
  syn: boolean;
  /** Número del primer byte (en el SYN, el número inicial). En UDP no hay. */
  seq?: number;
  /** El siguiente byte que espera quien envía. Solo si lleva el flag ACK. */
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

/** Lo que ha pasado en el último paso. strings.ts lo convierte en una frase. */
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
  /** Los datos que envía el cliente, un segmento por texto. */
  payloads: string[];
  /** Números de secuencia iniciales. En la realidad son aleatorios. */
  clientIsn: number;
  serverIsn: number;
}

export const DEFAULT_ISN = { client: 100, server: 500 } as const;

export interface LabState {
  mode: Mode;
  config: LabConfig;
  /** Pasos dados. Sirve para saber qué temporizador se armó antes. */
  step: number;
  nextId: number;
  client: {
    state: TcpState;
    /** Paso en que se armó el temporizador, o null si está parado. */
    timerArmedAt: number | null;
    dataSent: boolean;
    /** Primer byte sin confirmar. */
    unacked: number;
  };
  server: {
    state: TcpState;
    timerArmedAt: number | null;
    /** Siguiente byte que espera. */
    expected: number;
    /** Lo que la aplicación ya ha recibido. */
    delivered: string;
    /** Segmentos que llegaron fuera de orden, guardados sin entregar, ordenados por seq. */
    buffered: { seq: number; payload: string }[];
  };
  /** Ids de los segmentos en tránsito, del más antiguo al más nuevo: la red es una cola. */
  network: number[];
  rows: Row[];
  narration: Narration;
  done: boolean;
}

export type LabEvent =
  { type: 'step' } | { type: 'lose'; id: number } | { type: 'reset'; mode: Mode };

/** TCP cuenta bytes, no caracteres: «¿» y «é» ocupan dos bytes en UTF-8. */
export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/** Los segmentos de datos del cliente con su seq: el primero va tras el SYN, y cada uno tras los bytes del anterior. */
function dataPieces(config: LabConfig): { seq: number; payload: string }[] {
  let seq = config.clientIsn + 1;
  return config.payloads.map((payload) => {
    const piece = { seq, payload };
    seq += byteLength(payload);
    return piece;
  });
}

/** El byte siguiente al último dato: cuando el ACK llega aquí, está todo confirmado. */
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
  if (row?.kind !== 'segment') throw new Error(`No hay ningún segmento con id ${id}`);
  return row;
}

/** Pone un segmento en la red y su fila en la escalera. Devuelve la fila, que sigue siendo la de `s.rows`. */
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

/** Un paso: llega el segmento más antiguo; si no hay, alguien envía lo pendiente; si no, vence un temporizador. */
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

/** Un ACK sin datos del cliente. Su seq no se muestra; es el siguiente byte que enviaría. */
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

  // Todo lo que no es SYN lleva ack=ISN del servidor + 1: completa el handshake si faltaba.
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

  // Llega lo que esperaba: se entrega, y detrás todo lo guardado que ahora encaja.
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
    // La fila va en la frase: si llegan dos ACK repetidos seguidos, cada paso dice algo distinto.
    s.narration = { key: 'client-ignores-duplicate-ack', ack, position: s.rows.indexOf(row) + 1 };
    return;
  }
  // El ACK es acumulativo: confirma todos los bytes anteriores.
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

/** Vence el temporizador armado antes (si empatan, el del cliente) y se reenvía lo más antiguo sin confirmar. */
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
    throw new Error(
      'Nada en tránsito, nada pendiente y ningún temporizador: debería haber terminado',
    );
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
  if (!piece) throw new Error(`Ningún segmento empieza en el byte ${client.unacked}`);
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

/** Un paso: el primero envía todos los datagramas; cada siguiente entrega el más antiguo, tal cual. */
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
  if (id === undefined) throw new Error('UDP: nada en tránsito; debería haber terminado');
  const row = segmentRow(s, id);
  row.fate = 'delivered';
  const text = row.segment.payload ?? '';
  s.server.delivered += text;
  s.narration = { key: 'udp-server-receives', text };
}
