# Plan de implementación: laboratorio `tcp-handshake` y lección 5, «TCP frente a UDP»

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** el primer playground de la web, un laboratorio en escalera del handshake de TCP con pérdidas, retransmisiones y modo UDP, y la lección 5 en español que lo usa.

**Arquitectura:**
- **Lógica:** una máquina de estados pura, `reduce(estado, evento) → estado`, en `machine.ts`. No sabe de React ni de idiomas, y tiene tests de cada escenario.
- **Textos:** `strings.ts` (es/en), con funciones puras de texto en `narration.ts` y `labels.ts`, también con tests.
- **Interfaz:** React (`TcpHandshake.tsx` y `Ladder.tsx`), con `useReducer(reduce)` y un CSS propio con los tokens del tema.
- **En la página:** una isla de Astro con `client:visible` dentro de la lección.

**Stack nuevo:** `@astrojs/react` ^7.0.0, `react` y `react-dom` ^19.3.0, y `@types/react` y `@types/react-dom` ^19.3.0.

**Spec:** `docs/specs/2026-10-03-laboratorio-tcp-design.md`. El de la Fase 0 (`docs/specs/2026-10-02-web-fase-0-design.md`, §6.4) manda en lo que este no diga.

## Restricciones globales

- **Git:** sin commits, push ni repositorio remoto salvo que el autor lo pida. Los «Puntos de control» sustituyen a los commits.
- **Rutas:** todo el laboratorio vive en `web/src/playgrounds/tcp-handshake/`. Los nombres de ficheros y del código van en inglés; los comentarios y los textos, en español (y en inglés en `strings.ts`).
- **Imports dentro del laboratorio:** relativos (`./machine`, `../../lib/locales`), no con `~/`, porque Vitest corre sin configuración propia y no conoce ese alias. Desde el MDX sí se usa `~/playgrounds/…`.
- **Colores:** solo tokens `--ide-*` de `web/src/styles/theme.css`. Nada de hexadecimales en el CSS del laboratorio.
- **Datos del laboratorio:** solo ASCII (`strings.ts`), para que bytes = letras. Los ISN por defecto son el 100 (cliente) y el 500 (servidor).
- **Comandos:** desde la raíz del repositorio. Tests de un fichero: `pnpm --filter web exec vitest run <ruta relativa a web/>`. Suite completa: `pnpm test`; tipos: `pnpm check`; build y enlaces: `pnpm build`; formato: `pnpm format:check`, y `pnpm exec prettier --write <ficheros>` para arreglarlo.
- **Ficheros temporales:** en el scratchpad de la sesión, nunca en `/tmp`.
- **Lección:** la guía de estilo (`docs/style-guide.md`) manda: estructura fija, entre 10 y 15 minutos de lectura (lo que muestra la cabecera de la página), salidas reales y datos personales sustituidos.
- **Verificación visual:** servidor de desarrollo y Playwright, en oscuro y claro y a 1280 y 375 px. Reinicia el servidor de desarrollo después de instalar dependencias o de cambiar `astro.config.ts`.

## Puntos de revisión

Casos que el spec implica y que conviene vigilar. Cada uno tiene su prueba en la tarea indicada.

1. **Perder lo mismo una y otra vez:** si el lector pierde el mismo reenvío cinco veces seguidas, el laboratorio sigue bien y termina en cuanto deja de perderlo. → Tarea 1, test «si se pierde el mismo reenvío muchas veces…».
2. **Los datos en inglés:** con «Hi, », «how are » y «you?», los ACK son 105, 113 y 117. → Tarea 1, test «usa los bytes de los datos de cada idioma».
3. **Perderlo todo a la vez:** si se pierden los tres segmentos de datos, se recuperan uno a uno con tres temporizadores. → Tarea 1, test «si se pierden los tres segmentos de datos a la vez».
4. **Estado de React:** `reduce` no puede modificar el estado que recibe, porque React (y el modo estricto, que llama dos veces al reductor) daría resultados raros. → Tarea 1, test «no modifica el estado que recibe».
5. **UDP sin nada que entregar:** si se pierden todos los datagramas, el mensaje final dice «(nada)» y no unas comillas vacías. Y si «Perder» termina el laboratorio, el foco no se pierde: va a «Reiniciar». → Tarea 2, test «en UDP, si se pierde todo, dice (nada)»; el foco se revisa en el navegador en la Tarea 4.

---

### Tarea 1: La máquina de estados

**Ficheros:**
- Crear: `web/src/playgrounds/tcp-handshake/machine.ts`
- Test: `web/src/playgrounds/tcp-handshake/machine.test.ts`

**Interfaces:**
- Consume: nada.
- Produce (lo usan las tareas 2 a 4):
  - tipos `Mode`, `Side`, `TcpState`, `Fate`, `Segment`, `StateChange`, `Row`, `SegmentRow`, `Narration`, `LabConfig`, `LabState` y `LabEvent`;
  - `DEFAULT_ISN: { client: 100; server: 500 }`;
  - `byteLength(text: string): number`;
  - `initialState(mode: Mode, config: LabConfig): LabState`;
  - `reduce(state: LabState, event: LabEvent): LabState`;
  - `canStep(state: LabState): boolean`.

- [ ] **Paso 1: escribe los tests**

`web/src/playgrounds/tcp-handshake/machine.test.ts`:

```ts
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

/** Avanza hasta el final. Falla si no termina en 100 pasos. */
function finish(state: LabState): LabState {
  let s = state;
  for (let i = 0; i < 100 && !s.done; i++) s = reduce(s, { type: 'step' });
  if (!s.done) throw new Error('El laboratorio no termina');
  return s;
}

function inTransit(state: LabState): Segment[] {
  return state.network.map((id) => {
    const row = state.rows.find((r) => r.id === id);
    if (row?.kind !== 'segment') throw new Error(`No hay segmento ${id}`);
    return row.segment;
  });
}

/** Pierde el primer segmento en tránsito que cumpla la condición. */
function lose(state: LabState, match: (segment: Segment) => boolean): LabState {
  const segment = inTransit(state).find(match);
  if (!segment) throw new Error('No hay ningún segmento así en tránsito');
  return reduce(state, { type: 'lose', id: segment.id });
}

/** Un segmento en texto corto: «C SYN seq=100», «S ACK ack=107», «C "todo " seq=107 ack=501 R». */
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

/** La historia de la escalera: segmentos en texto corto y temporizadores como «⏱ client». */
const history = (state: LabState) =>
  state.rows.map((row) => (row.kind === 'segment' ? brief(row.segment) : `⏱ ${row.side}`));

const isData = (payload: string) => (segment: Segment) => segment.payload === payload;
const isClientAck = (segment: Segment) =>
  segment.from === 'client' && !segment.syn && segment.payload === undefined;
const timeouts = (state: LabState) => state.rows.filter((row) => row.kind === 'timeout').length;

describe('modo TCP sin pérdidas', () => {
  it('abre la conexión con SYN, SYN-ACK y ACK', () => {
    const s = steps(start(), 4);
    expect(history(s)).toEqual(['C SYN seq=100', 'S SYN-ACK seq=500 ack=101', 'C ACK ack=501']);
    expect(s.client.state).toBe('ESTABLISHED');
    expect(s.server.state).toBe('ESTABLISHED');
    expect(s.narration).toEqual({ key: 'server-receives-ack' });
  });

  it('envía los datos con el seq de sus bytes y los entrega en orden', () => {
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

  it('cada paso cuenta una sola cosa', () => {
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

  it('marca los cambios de estado en la fila que los provoca', () => {
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

  it('usa los bytes de los datos de cada idioma', () => {
    const en = initialState('tcp', { ...config, payloads: ['Hi, ', 'how are ', 'you?'] });
    const acks = history(finish(en)).filter((line) => line.startsWith('S ACK'));
    expect(acks).toEqual(['S ACK ack=105', 'S ACK ack=113', 'S ACK ack=117']);
  });
});

describe('pérdidas en TCP: siempre se acaba entregando todo, en orden', () => {
  it.each<[string, number, (segment: Segment) => boolean]>([
    ['el SYN', 1, (g) => g.syn && g.ack === undefined],
    ['el SYN-ACK', 2, (g) => g.syn && g.ack !== undefined],
    ['el ACK del handshake', 3, isClientAck],
    ['el 1.er segmento de datos', 5, isData('Hola, ')],
    ['el 2.º segmento de datos', 5, isData('todo ')],
    ['el 3.er segmento de datos', 5, isData('bien')],
    ['un ACK de datos', 6, (g) => g.from === 'server' && g.ack === 107],
  ])('si se pierde %s', (_, at, match) => {
    const s = finish(lose(steps(start(), at), match));
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(s.client.state).toBe('ESTABLISHED');
    expect(s.server.state).toBe('ESTABLISHED');
    expect(s.rows.some((row) => row.kind === 'segment' && row.fate === 'lost')).toBe(true);
  });

  it('si se pierde un reenvío', () => {
    let s = lose(steps(start(), 5), isData('todo '));
    while (!inTransit(s).some((g) => g.retransmission)) s = steps(s, 1);
    s = finish(lose(s, (g) => g.retransmission));
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(timeouts(s)).toBe(2);
  });

  it('si se pierde el mismo reenvío muchas veces, termina en cuanto deja de perderse', () => {
    let s = lose(steps(start(), 5), isData('todo '));
    for (let i = 0; i < 5; i++) {
      while (!inTransit(s).some((g) => g.retransmission)) s = steps(s, 1);
      s = lose(s, (g) => g.retransmission);
    }
    s = finish(s);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(timeouts(s)).toBe(6);
  });

  it('si se pierden los tres segmentos de datos a la vez', () => {
    let s = steps(start(), 5);
    for (const payload of config.payloads) s = lose(s, isData(payload));
    s = finish(s);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(timeouts(s)).toBe(3);
  });
});

describe('casos concretos de TCP', () => {
  it('si se pierde el ACK del handshake, el primer dato completa la conexión', () => {
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

  it('si se pierde el 2.º dato, el servidor guarda el 3.º y el reenvío completa el texto', () => {
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
    expect(s.narration).toEqual({ key: 'client-ignores-duplicate-ack', ack: 107 });
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

  it('si se pierde el SYN-ACK, el cliente reenvía el SYN y el servidor repite el SYN-ACK', () => {
    let s = lose(steps(start(), 2), (g) => g.syn && g.ack !== undefined);
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'client-timeout-syn', seq: 100 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'server-repeats-synack', seq: 500, ack: 101 });
    expect(inTransit(s).map(brief)).toEqual(['S SYN-ACK seq=500 ack=101 R']);
  });

  it('si se pierden el ACK del handshake y los tres datos, el servidor repite el SYN-ACK', () => {
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

  it('si se pierde el último ACK, el servidor descarta el reenvío y repite el ACK', () => {
    let s = lose(steps(start(), 8), (g) => g.from === 'server' && g.ack === 116);
    s = steps(s, 3);
    expect(s.narration).toEqual({ key: 'client-timeout-data', seq: 112 });
    s = steps(s, 1);
    expect(s.narration).toEqual({ key: 'server-discards-duplicate', text: 'bien', ack: 116 });
    expect(finish(s).server.delivered).toBe('Hola, todo bien');
  });
});

describe('modo UDP', () => {
  it('sin pérdidas, la aplicación lo recibe todo, sin handshake ni ACK', () => {
    const s = finish(start('udp'));
    expect(history(s)).toEqual(['C "Hola, "', 'C "todo "', 'C "bien"']);
    expect(s.server.delivered).toBe('Hola, todo bien');
    expect(s.step).toBe(4);
  });

  it('si se pierde un datagrama, no vuelve', () => {
    const s = finish(lose(steps(start('udp'), 1), isData('todo ')));
    expect(s.server.delivered).toBe('Hola, bien');
    expect(timeouts(s)).toBe(0);
    expect(history(s)).toEqual(['C "Hola, "', 'C "todo "', 'C "bien"']);
  });

  it('si se pierde el último datagrama en tránsito, termina al momento', () => {
    const s = lose(steps(start('udp'), 3), isData('bien'));
    expect(s.done).toBe(true);
    expect(s.server.delivered).toBe('Hola, todo ');
  });
});

describe('reglas generales', () => {
  it('perder un segmento que ya no está en tránsito no cambia nada', () => {
    const s = steps(start(), 2);
    const synId = s.rows[0]!.id;
    expect(reduce(s, { type: 'lose', id: synId })).toBe(s);
  });

  it('después del final, «step» no cambia nada', () => {
    const s = finish(start());
    expect(reduce(s, { type: 'step' })).toBe(s);
  });

  it('«reset» vuelve al estado inicial del modo elegido', () => {
    const s = steps(start(), 5);
    expect(reduce(s, { type: 'reset', mode: 'udp' })).toEqual(start('udp'));
  });

  it('no modifica el estado que recibe', () => {
    const s = steps(start(), 5);
    const copy = structuredClone(s);
    reduce(s, { type: 'step' });
    reduce(s, { type: 'lose', id: s.network[0]! });
    reduce(s, { type: 'reset', mode: 'tcp' });
    expect(s).toEqual(copy);
  });

  it('cuenta bytes, no caracteres', () => {
    expect(byteLength('todo ')).toBe(5);
    expect(byteLength('¿qué ')).toBe(7);
  });
});
```

- [ ] **Paso 2: comprueba que fallan**

Run: `pnpm --filter web exec vitest run src/playgrounds/tcp-handshake/machine.test.ts`
Expected: FAIL, porque `./machine` no existe («Failed to resolve import» o «Cannot find module»).

- [ ] **Paso 3: escribe la máquina**

`web/src/playgrounds/tcp-handshake/machine.ts`:

```ts
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
  | { key: 'client-ignores-duplicate-ack'; ack: number }
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

export type LabEvent = { type: 'step' } | { type: 'lose'; id: number } | { type: 'reset'; mode: Mode };

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

function receiveData(
  s: LabState,
  seq: number,
  payload: string,
  completesHandshake: boolean,
): void {
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
    s.narration = { key: 'server-buffers', text: payload, ack: server.expected, completesHandshake };
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
    s.narration = { key: 'client-ignores-duplicate-ack', ack };
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
    throw new Error('Nada en tránsito, nada pendiente y ningún temporizador: debería haber terminado');
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
```

- [ ] **Paso 4: comprueba que pasan**

Run: `pnpm --filter web exec vitest run src/playgrounds/tcp-handshake/machine.test.ts`
Expected: PASS, 28 tests (el `it.each` cuenta como 7).

Si alguno falla, el fallo está en la máquina, no en el test: los tests están calculados a mano siguiendo el §2 del spec. Revisa la regla del spec que toca ese paso antes de cambiar nada.

- [ ] **Paso 5: formato, tipos y suite**

Run: `pnpm exec prettier --write web/src/playgrounds/tcp-handshake && pnpm format:check && pnpm check && pnpm test`
Expected: Prettier sin avisos; `pnpm check` con 0 errores, 0 avisos y 0 sugerencias; la suite entera en verde (106 tests de antes + los nuevos).

- [ ] **Punto de control:** sin commit. Anota en el ledger los tests que pasan.

---

### Tarea 2: Textos, narración y etiquetas

**Ficheros:**
- Crear: `web/src/playgrounds/tcp-handshake/strings.ts`, `narration.ts`, `labels.ts`
- Test: `web/src/playgrounds/tcp-handshake/strings.test.ts`, `narration.test.ts`, `labels.test.ts`

**Interfaces:**
- Consume (Tarea 1): `Narration`, `Side`, `Fate`, `Segment`, `Row`, `LabState`, `byteLength`, `initialState`, `reduce` y `LabConfig` de `./machine`; `Locale` de `../../lib/locales`.
- Produce (lo usa la Tarea 3):
  - `interface Strings` y `strings: Record<Locale, Strings>`;
  - `fill(template: string, values: Record<string, string | number | boolean>): string`;
  - `quote(t: Strings, text: string): string`;
  - `narrate(t: Strings, narration: Narration): string`;
  - `doneMessage(t: Strings, state: LabState): string | null`;
  - `segmentTitle(segment: Segment, t: Strings): string`, `segmentDetail(segment: Segment): string | null`, `segmentSummary(segment: Segment, t: Strings): string` y `rowDescription(row: Row, position: number, t: Strings): string`.

**Decisión respecto al spec** (anótala en el ledger como `Ruling`):
- §3 nombra `timeout`, `done` y `udp-done` como claves de narración. Aquí `timeout` se divide en `client-timeout-syn`, `server-timeout-synack` y `client-timeout-data`, para que cada frase diga qué se reenvía.
- `done` y `udp-done` no son narraciones: son el aviso aparte `doneMessage`. Así no tapan la frase del último paso.
- `client-receives-ack` se divide en dos (`…-ack` y `…-final-ack`).
- «Completa el handshake» es un dato (`completesHandshake`) que añade una frase, en lugar de la clave `server-completes-and-delivers`. Así cubre también el caso en que el dato llega fuera de orden.

- [ ] **Paso 1: escribe los tests**

`web/src/playgrounds/tcp-handshake/strings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { strings } from './strings';

describe('strings', () => {
  it.each(['es', 'en'] as const)('los datos en %s son ASCII, para que bytes = letras', (lang) => {
    for (const payload of strings[lang].payloads) expect(payload).toMatch(/^[\x20-\x7e]+$/);
  });

  it('los dos idiomas tienen las mismas frases', () => {
    expect(Object.keys(strings.en.narration).sort()).toEqual(
      Object.keys(strings.es.narration).sort(),
    );
  });
});
```

`web/src/playgrounds/tcp-handshake/narration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialState, reduce, type LabState, type Narration } from './machine';
import { doneMessage, fill, narrate } from './narration';
import { strings } from './strings';

/** Una narración de ejemplo por clave. El tipo obliga a que estén todas. */
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
  'client-ignores-duplicate-ack': { key: 'client-ignores-duplicate-ack', ack: 107 },
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

describe('fill', () => {
  it('sustituye los huecos y deja los que no conoce', () => {
    expect(fill('ack={ack}, {otro}', { ack: 107 })).toBe('ack=107, {otro}');
  });
});

describe('narrate', () => {
  it.each(['es', 'en'] as const)('rellena todas las frases en %s', (lang) => {
    for (const narration of Object.values(samples)) {
      const text = narrate(strings[lang], narration);
      expect(text, narration.key).not.toMatch(/[{}]/);
      expect(text.length, narration.key).toBeGreaterThan(20);
    }
  });

  it('pone los datos entre las comillas del idioma', () => {
    expect(narrate(strings.es, samples['server-buffers'])).toContain('«bien»');
    expect(narrate(strings.en, samples['server-buffers'])).toContain('“bien”');
  });

  it('añade una frase cuando un dato completa el handshake', () => {
    const text = narrate(strings.es, { ...samples['server-delivers'], completesHandshake: true });
    expect(text).toContain(strings.es.completesHandshake);
    expect(narrate(strings.es, samples['server-delivers'])).not.toContain(
      strings.es.completesHandshake,
    );
  });
});

describe('doneMessage', () => {
  it('no dice nada si no ha terminado', () => {
    expect(doneMessage(strings.es, initialState('tcp', config))).toBeNull();
  });

  it('en TCP, dice el texto entregado', () => {
    const s = finish(initialState('tcp', config));
    expect(doneMessage(strings.es, s)).toBe('Entregado completo y en orden: «Hola, todo bien».');
  });

  it('en UDP, dice cuántos datagramas se perdieron', () => {
    let s = reduce(initialState('udp', config), { type: 'step' });
    s = finish(reduce(s, { type: 'lose', id: s.network[1]! }));
    const message = doneMessage(strings.es, s);
    expect(message).toContain('«Hola, bien»');
    expect(message).toContain('Datagramas perdidos: 1');
  });

  it('en UDP, si se pierde todo, dice (nada)', () => {
    let s = reduce(initialState('udp', config), { type: 'step' });
    for (const id of [...s.network]) s = reduce(s, { type: 'lose', id });
    expect(s.done).toBe(true);
    expect(doneMessage(strings.es, s)).toContain('(nada)');
    expect(doneMessage(strings.es, s)).not.toContain('«»');
  });
});
```

`web/src/playgrounds/tcp-handshake/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rowDescription, segmentDetail, segmentSummary, segmentTitle } from './labels';
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

describe('segmentTitle y segmentDetail', () => {
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

  it('un ACK sin datos no enseña su seq', () => {
    const ack = segment({ seq: 101, ack: 501 });
    expect(segmentTitle(ack, es)).toBe('ACK');
    expect(segmentDetail(ack)).toBe('ack=501');
  });

  it('datos, con sus bytes y las comillas del idioma', () => {
    expect(segmentTitle(segment({ seq: 101, ack: 501, payload: 'Hola, ' }), es)).toBe(
      'seq=101 · «Hola, » (6 bytes)',
    );
    expect(segmentTitle(segment({ seq: 101, ack: 501, payload: 'Hi, ' }), en)).toBe(
      'seq=101 · “Hi, ” (4 bytes)',
    );
  });

  it('un datagrama UDP no tiene seq ni ack', () => {
    const datagram = segment({ payload: 'Hola, ' });
    expect(segmentTitle(datagram, es)).toBe('«Hola, » (6 bytes)');
    expect(segmentDetail(datagram)).toBeNull();
  });
});

describe('segmentSummary', () => {
  it('junta título, ack y reenvío', () => {
    const resent = segment({ seq: 107, ack: 501, payload: 'todo ', retransmission: true });
    expect(segmentSummary(resent, es)).toBe('seq=107 · «todo » (5 bytes), ack=501, reenvío');
  });
});

describe('rowDescription', () => {
  it('lee una fila de segmento entera, con sus cambios de estado', () => {
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

  it('lee una fila de temporizador', () => {
    expect(rowDescription({ kind: 'timeout', id: 9, side: 'server' }, 4, es)).toBe(
      '4. Vence el temporizador del servidor.',
    );
  });
});
```

- [ ] **Paso 2: comprueba que fallan**

Run: `pnpm --filter web exec vitest run src/playgrounds/tcp-handshake/strings.test.ts src/playgrounds/tcp-handshake/narration.test.ts src/playgrounds/tcp-handshake/labels.test.ts`
Expected: FAIL, porque `./strings`, `./narration` y `./labels` no existen.

- [ ] **Paso 3: escribe `strings.ts`**

`web/src/playgrounds/tcp-handshake/strings.ts`:

```ts
/** Textos del laboratorio tcp-handshake en los dos idiomas. Los datos de `payloads` van solo en ASCII. */
import type { Locale } from '../../lib/locales';
import type { Fate, Narration, Side } from './machine';

export interface Strings {
  title: string;
  protocol: string;
  client: string;
  server: string;
  sideName: Record<Side, string>;
  /** Lo que muestran las etiquetas de estado en modo UDP. */
  udpNoState: string;
  next: string;
  reset: string;
  lose: string;
  /** Nombre accesible del botón «Perder»: {n} es la fila y {summary}, el segmento. */
  loseLabel: string;
  ladderLabel: string;
  routeToServer: string;
  routeToClient: string;
  fate: Record<Fate, string>;
  retransmission: string;
  bytes: string;
  timeoutRow: string;
  stateChange: string;
  appTitle: string;
  received: string;
  buffered: string;
  nothing: string;
  quoteOpen: string;
  quoteClose: string;
  /** Se añade a la narración cuando un segmento de datos completa el handshake. */
  completesHandshake: string;
  done: string;
  udpDone: string;
  udpDoneLost: string;
  /** Los datos que envía el cliente. Solo ASCII: así cada letra es un byte. */
  payloads: string[];
  narration: Record<Narration['key'], string>;
}

const es: Strings = {
  title: 'laboratorio · handshake TCP',
  protocol: 'Protocolo',
  client: 'Cliente',
  server: 'Servidor',
  sideName: { client: 'cliente', server: 'servidor' },
  udpNoState: 'sin conexión',
  next: 'Siguiente paso',
  reset: 'Reiniciar',
  lose: 'Perder',
  loseLabel: 'Perder el segmento {n}: {summary}',
  ladderLabel: 'Segmentos enviados, en orden',
  routeToServer: 'Cliente → servidor',
  routeToClient: 'Servidor → cliente',
  fate: { 'in-transit': 'En tránsito', delivered: 'Entregado', lost: 'Perdido' },
  retransmission: 'reenvío',
  bytes: '{n} bytes',
  timeoutRow: 'Vence el temporizador del {side}',
  stateChange: 'El {side} pasa a {state}.',
  appTitle: 'Aplicación del servidor',
  received: 'Recibido',
  buffered: 'Guardado sin entregar',
  nothing: '(nada)',
  quoteOpen: '«',
  quoteClose: '»',
  completesHandshake:
    'Además, este segmento confirma el SYN-ACK (lleva el ACK que se perdió), así que completa el handshake: el servidor pasa a ESTABLISHED.',
  done: 'Entregado completo y en orden: {text}.',
  udpDone:
    'Fin. La aplicación ha recibido {text}. Esta vez no se ha perdido nada, pero si se hubiera perdido, nadie lo habría reenviado.',
  udpDoneLost:
    'Fin. La aplicación ha recibido {text}. Datagramas perdidos: {lost}. Nadie los ha reenviado: el cliente ni siquiera se ha enterado.',
  payloads: ['Hola, ', 'todo ', 'bien'],
  narration: {
    intro:
      'El servidor ya está escuchando (LISTEN), como nc -l. Pulsa «Siguiente paso» para que el cliente abra la conexión.',
    'udp-intro':
      'Con UDP no hay conexión que abrir: el cliente envía sus datos directamente. Pulsa «Siguiente paso».',
    'client-sends-syn':
      'El cliente envía un SYN («quiero conectarme») con su número de secuencia inicial, seq={seq}, y pasa a SYN_SENT. En la realidad, este número es aleatorio.',
    'server-receives-syn':
      'El servidor recibe el SYN, pasa a SYN_RECEIVED y responde con un SYN-ACK: su propio número inicial, seq={seq}, y ack={ack}, «el siguiente byte que espero de ti». El SYN cuenta como un byte.',
    'server-repeats-synack':
      'Al servidor le llega otra vez el SYN: su SYN-ACK no ha llegado. Lo repite (seq={seq}, ack={ack}).',
    'client-receives-synack':
      'El cliente recibe el SYN-ACK y pasa a ESTABLISHED. Responde con un ACK, ack={ack}, para confirmar el número del servidor.',
    'client-repeats-ack':
      'Al cliente le llega otra vez el SYN-ACK: su ACK no ha llegado. Lo repite (ack={ack}).',
    'server-receives-ack':
      'El servidor recibe el ACK y pasa a ESTABLISHED. Handshake completo: cada uno conoce el número de secuencia del otro y sabe que el otro conoce el suyo.',
    'client-sends-data':
      'El cliente envía sus {count} segmentos de datos sin esperar respuesta. El primero empieza en el byte {first}, y el seq de cada uno es el del anterior más los bytes que lleva.',
    'server-delivers':
      'El servidor recibe los bytes que esperaba y entrega {text} a la aplicación. Responde ack={ack}: el siguiente byte que espera.',
    'server-buffers':
      'El servidor guarda {text}, pero no puede entregarlo todavía: le falta lo que empieza en el byte {ack}. Repite ack={ack} para avisar de que sigue esperando ese byte.',
    'server-discards-duplicate':
      'El servidor ya tenía {text}: es un reenvío. Lo descarta y repite ack={ack}.',
    'client-receives-ack':
      'El cliente recibe ack={ack}: el servidor tiene todo lo anterior a ese byte. Quedan {pending} bytes sin confirmar, así que vuelve a armar el temporizador.',
    'client-receives-final-ack':
      'El cliente recibe ack={ack}: el servidor lo tiene todo. Para el temporizador.',
    'client-ignores-duplicate-ack':
      'El cliente recibe otra vez ack={ack}. No confirma nada nuevo, así que no hace nada. (TCP real, tras tres ACK repetidos, reenviaría sin esperar al temporizador.)',
    'segment-lost':
      'El segmento {position} se pierde por el camino. Nadie avisa: quien lo envió solo lo notará cuando venza su temporizador.',
    'client-timeout-syn':
      'Vence el temporizador del cliente: su SYN no ha tenido respuesta, así que lo reenvía (seq={seq}). En la realidad, cada reintento espera el doble que el anterior, y al final se rinde.',
    'server-timeout-synack':
      'Vence el temporizador del servidor: nadie ha confirmado su SYN-ACK, así que lo reenvía (seq={seq}).',
    'client-timeout-data':
      'Vence el temporizador del cliente: nadie ha confirmado el byte {seq}. Reenvía solo ese segmento, el más antiguo sin confirmar. En la realidad, el temporizador empieza en torno a un segundo.',
    'udp-client-sends':
      'El cliente envía sus {count} datagramas de golpe: sin handshake, sin números de secuencia y sin esperar confirmación.',
    'udp-server-receives':
      'Llega un datagrama y la aplicación recibe {text} tal cual. Nadie confirma nada.',
    'udp-lost':
      'El datagrama {position} se pierde. Con UDP nadie lo reenviará: el cliente ni siquiera sabe que se ha perdido.',
  },
};

const en: Strings = {
  title: 'lab · TCP handshake',
  protocol: 'Protocol',
  client: 'Client',
  server: 'Server',
  sideName: { client: 'client', server: 'server' },
  udpNoState: 'no connection',
  next: 'Next step',
  reset: 'Reset',
  lose: 'Lose',
  loseLabel: 'Lose segment {n}: {summary}',
  ladderLabel: 'Segments sent, in order',
  routeToServer: 'Client → server',
  routeToClient: 'Server → client',
  fate: { 'in-transit': 'In transit', delivered: 'Delivered', lost: 'Lost' },
  retransmission: 'retransmission',
  bytes: '{n} bytes',
  timeoutRow: 'The {side} timer expires',
  stateChange: 'The {side} moves to {state}.',
  appTitle: 'Server application',
  received: 'Received',
  buffered: 'Held, not delivered',
  nothing: '(nothing)',
  quoteOpen: '“',
  quoteClose: '”',
  completesHandshake:
    'This segment also acknowledges the SYN-ACK (it carries the ACK that was lost), so it completes the handshake: the server moves to ESTABLISHED.',
  done: 'Delivered in full and in order: {text}.',
  udpDone:
    'Done. The application received {text}. Nothing was lost this time, but if it had been, nobody would have resent it.',
  udpDoneLost:
    'Done. The application received {text}. Datagrams lost: {lost}. Nobody resent them: the client never even noticed.',
  payloads: ['Hi, ', 'how are ', 'you?'],
  narration: {
    intro:
      'The server is already listening (LISTEN), like nc -l. Press “Next step” so the client opens the connection.',
    'udp-intro':
      'With UDP there is no connection to open: the client sends its data straight away. Press “Next step”.',
    'client-sends-syn':
      'The client sends a SYN (“I want to connect”) with its initial sequence number, seq={seq}, and moves to SYN_SENT. In reality this number is random.',
    'server-receives-syn':
      'The server receives the SYN, moves to SYN_RECEIVED and replies with a SYN-ACK: its own initial number, seq={seq}, and ack={ack}, “the next byte I expect from you”. The SYN counts as one byte.',
    'server-repeats-synack':
      'The SYN reaches the server again: its SYN-ACK never arrived. It sends it again (seq={seq}, ack={ack}).',
    'client-receives-synack':
      'The client receives the SYN-ACK and moves to ESTABLISHED. It replies with an ACK, ack={ack}, to confirm the server’s number.',
    'client-repeats-ack':
      'The SYN-ACK reaches the client again: its ACK never arrived. It sends it again (ack={ack}).',
    'server-receives-ack':
      'The server receives the ACK and moves to ESTABLISHED. Handshake complete: each side knows the other’s sequence number and knows the other knows its own.',
    'client-sends-data':
      'The client sends its {count} data segments without waiting for a reply. The first one starts at byte {first}, and each seq is the previous one plus the bytes it carries.',
    'server-delivers':
      'The server receives the bytes it was expecting and delivers {text} to the application. It replies ack={ack}: the next byte it expects.',
    'server-buffers':
      'The server keeps {text} but can’t deliver it yet: it is missing what starts at byte {ack}. It repeats ack={ack} to say it is still waiting for that byte.',
    'server-discards-duplicate':
      'The server already had {text}: this is a retransmission. It discards it and repeats ack={ack}.',
    'client-receives-ack':
      'The client receives ack={ack}: the server has everything before that byte. {pending} bytes are still unacknowledged, so it restarts the timer.',
    'client-receives-final-ack':
      'The client receives ack={ack}: the server has everything. It stops the timer.',
    'client-ignores-duplicate-ack':
      'The client receives ack={ack} again. It acknowledges nothing new, so the client does nothing. (Real TCP, after three repeated ACKs, would resend without waiting for the timer.)',
    'segment-lost':
      'Segment {position} is lost on the way. Nobody says so: the sender will only notice when its timer expires.',
    'client-timeout-syn':
      'The client timer expires: its SYN got no reply, so it sends it again (seq={seq}). In reality each retry waits twice as long as the last, and eventually it gives up.',
    'server-timeout-synack':
      'The server timer expires: nobody has acknowledged its SYN-ACK, so it sends it again (seq={seq}).',
    'client-timeout-data':
      'The client timer expires: nobody has acknowledged byte {seq}. It resends only that segment, the oldest unacknowledged one. In reality the timer starts at around one second.',
    'udp-client-sends':
      'The client sends its {count} datagrams at once: no handshake, no sequence numbers and no waiting for confirmation.',
    'udp-server-receives':
      'A datagram arrives and the application receives {text} as is. Nobody acknowledges anything.',
    'udp-lost':
      'Datagram {position} is lost. With UDP nobody will resend it: the client doesn’t even know it was lost.',
  },
};

export const strings: Record<Locale, Strings> = { es, en };
```

- [ ] **Paso 4: escribe `narration.ts`**

`web/src/playgrounds/tcp-handshake/narration.ts`:

```ts
/** Convierte el estado del laboratorio en frases: la narración de cada paso y el aviso del final. */
import type { LabState, Narration } from './machine';
import type { Strings } from './strings';

/** Sustituye cada {nombre} por su valor. Los huecos sin valor se quedan como están. */
export function fill(template: string, values: Record<string, string | number | boolean>): string {
  return template.replace(/\{(\w+)\}/g, (hole, name: string) =>
    name in values ? String(values[name]) : hole,
  );
}

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
```

- [ ] **Paso 5: escribe `labels.ts`**

`web/src/playgrounds/tcp-handshake/labels.ts`:

```ts
/** Textos de cada fila de la escalera: lo que se ve junto a la flecha y lo que lee un lector de pantalla. */
import { byteLength, type Row, type Segment } from './machine';
import { fill, quote } from './narration';
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
```

- [ ] **Paso 6: comprueba que pasan**

Run: `pnpm --filter web exec vitest run src/playgrounds/tcp-handshake`
Expected: PASS en los cuatro ficheros de test (los de la Tarea 1 siguen en verde).

- [ ] **Paso 7: formato, tipos y suite**

Run: `pnpm exec prettier --write web/src/playgrounds/tcp-handshake && pnpm format:check && pnpm check && pnpm test`
Expected: todo en verde, sin avisos.

- [ ] **Punto de control:** sin commit. Anota en el ledger la decisión de nombres de claves y los tests que pasan.

---

### Tarea 3: React en la web, la interfaz del laboratorio y el patrón de playgrounds

**Ficheros:**
- Modificar: `web/package.json` (con `pnpm`, no a mano), `pnpm-lock.yaml`, `web/astro.config.ts` y `web/tsconfig.json`
- Crear: `web/src/playgrounds/tcp-handshake/TcpHandshake.tsx`, `Ladder.tsx` y `tcp-handshake.css`
- Test: `web/src/playgrounds/tcp-handshake/TcpHandshake.test.tsx`
- Modificar: `docs/style-guide.md` (sección «Playgrounds») y `docs/specs/2026-10-02-web-fase-0-design.md` (enlace en §6.4)

**Interfaces:**
- Consume:
  - de la Tarea 1: `DEFAULT_ISN`, `canStep`, `initialState`, `reduce`, `LabConfig`, `LabState` y `Mode`;
  - de la Tarea 2: `strings`, `Strings`, `narrate`, `doneMessage`, `quote`, `fill`, `segmentTitle`, `segmentDetail`, `segmentSummary` y `rowDescription`.
- Produce (lo usa la Tarea 4): `export default function TcpHandshake({ lang }: { lang: Locale })`, que se usa en MDX como `<TcpHandshake client:visible lang="es" />`.

- [ ] **Paso 1: instala React y su integración**

Run: `pnpm --filter web add @astrojs/react@^7.0.0 react@^19.3.0 react-dom@^19.3.0 && pnpm --filter web add -D @types/react@^19.3.0 @types/react-dom@^19.3.0`
Expected: se instalan sin errores de dependencias (`peer`). `@astrojs/react` 7 pide Vite ^8.3 (hay 8.3.2) y Node ≥22.12 (hay 22.21). Si pnpm pide aprobar scripts de compilación, no hace falta ninguno nuevo: no añadas nada a `onlyBuiltDependencies` sin anotarlo en el ledger.

- [ ] **Paso 2: activa la integración y el JSX de React**

En `web/astro.config.ts`, importa la integración y añádela al final de `integrations`, después de `starlight(...)`:

```ts
import react from '@astrojs/react';
```

```ts
    // Los playgrounds (src/playgrounds/) son islas de React.
    react(),
```

En `web/tsconfig.json`, añade el JSX de React a `compilerOptions`. Es lo que pide la integración. Vite lo lee al transformar `.tsx`, y con el `"jsx": "preserve"` heredado de Astro no podría compilar los tests:

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"],
  "compilerOptions": {
    "paths": { "~/*": ["./src/*"] },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

- [ ] **Paso 3: escribe el test de pintado**

`web/src/playgrounds/tcp-handshake/TcpHandshake.test.tsx`:

```tsx
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TcpHandshake from './TcpHandshake';

describe('TcpHandshake', () => {
  it('se pinta en español con el estado inicial', () => {
    const html = renderToString(<TcpHandshake lang="es" />);
    expect(html).toContain('laboratorio · handshake TCP');
    expect(html).toContain('Siguiente paso');
    expect(html).toContain('LISTEN');
    expect(html).toContain('El servidor ya está escuchando');
    expect(html).toContain('aria-live="polite"');
  });

  it('se pinta en inglés', () => {
    const html = renderToString(<TcpHandshake lang="en" />);
    expect(html).toContain('lab · TCP handshake');
    expect(html).toContain('Next step');
    expect(html).not.toContain('Siguiente paso');
  });
});
```

- [ ] **Paso 4: comprueba que falla**

Run: `pnpm --filter web exec vitest run src/playgrounds/tcp-handshake/TcpHandshake.test.tsx`
Expected: FAIL, porque `./TcpHandshake` no existe. Si el error es de sintaxis JSX («make sure to not set jsx to preserve»), el Paso 2 no ha surtido efecto: revisa `web/tsconfig.json`.

- [ ] **Paso 5: escribe `Ladder.tsx`**

`web/src/playgrounds/tcp-handshake/Ladder.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { rowDescription, segmentDetail, segmentSummary, segmentTitle } from './labels';
import type { LabState } from './machine';
import { fill } from './narration';
import type { Strings } from './strings';

interface Props {
  state: LabState;
  t: Strings;
  onLose: (id: number) => void;
}

/** La escalera: una fila por segmento o temporizador, entre la línea del cliente (izquierda) y la del servidor (derecha). */
export default function Ladder({ state, t, onLose }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cada fila nueva se lleva a la vista; sin animación si el lector prefiere movimiento reducido.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ top: element.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [state.rows.length]);

  return (
    <div
      ref={scrollRef}
      className="tcp-lab__ladder"
      tabIndex={0}
      role="region"
      aria-label={t.ladderLabel}
    >
      <ol className="tcp-lab__rows" role="list">
        {state.rows.map((row, index) => {
          const position = index + 1;
          if (row.kind === 'timeout') {
            return (
              <li
                key={row.id}
                className={`tcp-lab__row tcp-lab__row--timeout tcp-lab__row--${row.side}`}
              >
                <span className="sr-only">{rowDescription(row, position, t)}</span>
                <span aria-hidden="true">
                  <span className="tcp-lab__index">{position}</span> ⏱{' '}
                  {fill(t.timeoutRow, { side: t.sideName[row.side] })}
                </span>
              </li>
            );
          }
          const { segment, fate } = row;
          const detail = segmentDetail(segment);
          return (
            <li
              key={row.id}
              className={`tcp-lab__row tcp-lab__row--${segment.from} tcp-lab__row--${fate}`}
            >
              <span className="sr-only">{rowDescription(row, position, t)}</span>
              <div className="tcp-lab__arrow" aria-hidden="true">
                <span className="tcp-lab__label">
                  <span className="tcp-lab__index">{position}</span> {segmentTitle(segment, t)}
                  {segment.retransmission && (
                    <span className="tcp-lab__tag"> ({t.retransmission})</span>
                  )}
                </span>
                <span className="tcp-lab__line" />
                {detail && <span className="tcp-lab__detail">{detail}</span>}
                {fate !== 'delivered' && <span className="tcp-lab__fate">{t.fate[fate]}</span>}
              </div>
              {row.changes.map((change) => (
                <span
                  key={`${change.side}-${change.to}`}
                  className={`tcp-lab__change tcp-lab__change--${change.side}`}
                  aria-hidden="true"
                >
                  → {change.to}
                </span>
              ))}
              {fate === 'in-transit' && (
                <button
                  type="button"
                  className="tcp-lab__lose"
                  aria-label={fill(t.loseLabel, { n: position, summary: segmentSummary(segment, t) })}
                  onClick={() => onLose(segment.id)}
                >
                  {t.lose}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Paso 6: escribe `TcpHandshake.tsx`**

`web/src/playgrounds/tcp-handshake/TcpHandshake.tsx`:

```tsx
import { useEffect, useId, useReducer, useRef } from 'react';
import type { Locale } from '../../lib/locales';
import Ladder from './Ladder';
import { DEFAULT_ISN, canStep, initialState, reduce, type LabConfig, type Mode } from './machine';
import { doneMessage, narrate, quote } from './narration';
import { strings } from './strings';
import './tcp-handshake.css';

interface Props {
  /** Idioma de la lección donde se usa. */
  lang: Locale;
}

const modes: Mode[] = ['tcp', 'udp'];

/** Laboratorio: el handshake de TCP, sus ACK y reenvíos, y el contraste con UDP. Spec: docs/specs/2026-10-03-laboratorio-tcp-design.md */
export default function TcpHandshake({ lang }: Props) {
  const t = strings[lang];
  const config: LabConfig = {
    payloads: t.payloads,
    clientIsn: DEFAULT_ISN.client,
    serverIsn: DEFAULT_ISN.server,
  };
  const [state, dispatch] = useReducer(reduce, config, (c) => initialState('tcp', c));
  const radioName = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  const focusAfterLose = useRef(false);

  // «Perder» desaparece al pulsarlo: el foco pasa a «Siguiente paso», o a «Reiniciar» si ya ha terminado.
  useEffect(() => {
    if (!focusAfterLose.current) return;
    focusAfterLose.current = false;
    (canStep(state) ? nextRef : resetRef).current?.focus();
  }, [state]);

  const lose = (id: number) => {
    focusAfterLose.current = true;
    dispatch({ type: 'lose', id });
  };
  const stateLabel = (side: 'client' | 'server') =>
    state.mode === 'udp' ? t.udpNoState : state[side].state;
  const done = doneMessage(t, state);

  return (
    <section className="tcp-lab not-content" aria-label={t.title} data-pagefind-ignore>
      <header className="tcp-lab__header">
        <p className="tcp-lab__title">
          <span aria-hidden="true">{'// '}</span>
          {t.title}
        </p>
        <fieldset className="tcp-lab__modes">
          <legend>{t.protocol}</legend>
          {modes.map((mode) => (
            <label key={mode} className="tcp-lab__mode">
              <input
                type="radio"
                name={radioName}
                value={mode}
                checked={state.mode === mode}
                onChange={() => dispatch({ type: 'reset', mode })}
              />
              {mode.toUpperCase()}
            </label>
          ))}
        </fieldset>
      </header>

      <div className="tcp-lab__lanes">
        <p>
          <span className="tcp-lab__side">{t.client}</span> <code>{stateLabel('client')}</code>
        </p>
        <p>
          <span className="tcp-lab__side">{t.server}</span> <code>{stateLabel('server')}</code>
        </p>
      </div>

      <Ladder state={state} t={t} onLose={lose} />

      <div className="tcp-lab__app">
        <p className="tcp-lab__app-title">{t.appTitle}</p>
        <dl>
          <div>
            <dt>{t.received}</dt>
            <dd>{state.server.delivered === '' ? t.nothing : quote(t, state.server.delivered)}</dd>
          </div>
          {state.mode === 'tcp' && (
            <div>
              <dt>{t.buffered}</dt>
              <dd>
                {state.server.buffered.length === 0
                  ? t.nothing
                  : state.server.buffered.map((piece) => quote(t, piece.payload)).join(' ')}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="tcp-lab__narration" aria-live="polite">
        <p>{narrate(t, state.narration)}</p>
        {done && <p className="tcp-lab__done">{done}</p>}
      </div>

      <div className="tcp-lab__controls">
        <button
          ref={nextRef}
          type="button"
          className="tcp-lab__next"
          aria-disabled={!canStep(state)}
          onClick={() => dispatch({ type: 'step' })}
        >
          <span aria-hidden="true">▶ </span>
          {t.next}
        </button>
        <button
          ref={resetRef}
          type="button"
          className="tcp-lab__reset"
          onClick={() => dispatch({ type: 'reset', mode: state.mode })}
        >
          <span aria-hidden="true">↺ </span>
          {t.reset}
        </button>
      </div>
    </section>
  );
}
```

`aria-disabled` en lugar de `disabled`: un botón desactivado pierde el foco si lo tenía, y el lector se quedaría sin saber dónde está. El reductor ya ignora «step» al final.

- [ ] **Paso 7: escribe `tcp-handshake.css`**

`web/src/playgrounds/tcp-handshake/tcp-handshake.css`:

```css
/*
 * Laboratorio tcp-handshake. Solo tokens del tema (--ide-*).
 * Spec: docs/specs/2026-10-03-laboratorio-tcp-design.md (§4).
 */

/* El panel, como el terminal integrado de <TryIt>. */
.tcp-lab {
  margin-block: 1.5rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.375rem;
  background: var(--ide-chrome);
  font-family: var(--__sl-font-mono);
  font-size: var(--sl-text-sm);
  color: var(--ide-text);
}
.tcp-lab__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid var(--ide-border);
}
.tcp-lab__title {
  margin: 0;
  color: var(--ide-comment);
}

/* Selector TCP | UDP: radios nativos, con aspecto de pestañas. */
.tcp-lab__modes {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  border: 0;
}
.tcp-lab__modes legend {
  float: left;
  margin-inline-end: 0.5rem;
  padding: 0;
  font-size: var(--sl-text-xs);
  color: var(--ide-muted);
}
.tcp-lab__mode {
  position: relative;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.25rem;
  color: var(--ide-muted);
  cursor: pointer;
}
.tcp-lab__mode input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.tcp-lab__mode:has(input:checked) {
  border-color: var(--ide-accent);
  background: var(--ide-accent-low);
  color: var(--ide-strong);
}
.tcp-lab__mode:has(input:focus-visible) {
  outline: 2px solid var(--ide-accent);
  outline-offset: 2px;
}

/* Cliente y servidor, con su estado. */
.tcp-lab__lanes {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem 0;
}
.tcp-lab__lanes p {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  margin: 0;
}
.tcp-lab__lanes p:last-child {
  align-items: flex-end;
  text-align: end;
}
.tcp-lab__side {
  font-weight: 600;
  color: var(--ide-strong);
}
.tcp-lab__lanes code {
  padding: 0;
  background: none;
  color: var(--ide-keyword);
}

/* La escalera: altura máxima con scroll propio, y las dos líneas de vida en los bordes. */
.tcp-lab__ladder {
  max-height: 26rem;
  margin: 0.5rem 1rem 0;
  overflow-y: auto;
}
.tcp-lab__rows {
  position: relative;
  min-height: 5rem;
  margin: 0;
  padding: 0.25rem 0;
  list-style: none;
}
.tcp-lab__rows::before,
.tcp-lab__rows::after {
  content: '';
  position: absolute;
  inset-block: 0;
  width: 2px;
  background: var(--ide-gutter);
}
.tcp-lab__rows::before {
  inset-inline-start: 0.25rem;
}
.tcp-lab__rows::after {
  inset-inline-end: 0.25rem;
}
.tcp-lab__row {
  padding: 0.5rem 0.75rem;
}
.tcp-lab__arrow {
  display: grid;
  justify-items: center;
  gap: 0.125rem;
}
.tcp-lab__label {
  text-align: center;
  color: var(--ide-strong);
}
.tcp-lab__index {
  color: var(--ide-muted);
}
.tcp-lab__tag,
.tcp-lab__detail,
.tcp-lab__fate {
  font-size: var(--sl-text-xs);
  color: var(--ide-muted);
}

/* La flecha: una línea con punta, del color de quien envía. */
.tcp-lab__line {
  position: relative;
  justify-self: stretch;
  height: 0;
  margin-block: 0.25rem;
  border-top: 2px solid currentColor;
}
.tcp-lab__row--client .tcp-lab__line {
  color: var(--ide-info);
}
.tcp-lab__row--server .tcp-lab__line {
  color: var(--ide-string);
}
.tcp-lab__line::after {
  content: '';
  position: absolute;
  top: -6px;
  border-block: 5px solid transparent;
}
.tcp-lab__row--client .tcp-lab__line::after {
  inset-inline-end: -2px;
  border-inline-start: 8px solid currentColor;
}
.tcp-lab__row--server .tcp-lab__line::after {
  inset-inline-start: -2px;
  border-inline-end: 8px solid currentColor;
}

/* En tránsito: discontinua y sin llegar al otro lado. */
.tcp-lab__row--in-transit .tcp-lab__line {
  border-top-style: dashed;
}
.tcp-lab__row--client.tcp-lab__row--in-transit .tcp-lab__line {
  margin-inline-end: 30%;
}
.tcp-lab__row--server.tcp-lab__row--in-transit .tcp-lab__line {
  margin-inline-start: 30%;
}

/* Perdido: se corta a mitad con ✕ (con texto, nunca solo color). */
.tcp-lab__row--lost .tcp-lab__line {
  border-top-style: dashed;
  color: var(--ide-accent);
}
.tcp-lab__row--client.tcp-lab__row--lost .tcp-lab__line {
  margin-inline-end: 50%;
}
.tcp-lab__row--server.tcp-lab__row--lost .tcp-lab__line {
  margin-inline-start: 50%;
}
.tcp-lab__row--lost .tcp-lab__line::after {
  content: '✕' / '';
  top: -0.65em;
  border: 0;
  line-height: 1;
  font-size: var(--sl-text-sm);
}
.tcp-lab__row--client.tcp-lab__row--lost .tcp-lab__line::after {
  inset-inline-end: -0.6em;
}
.tcp-lab__row--server.tcp-lab__row--lost .tcp-lab__line::after {
  inset-inline-start: -0.6em;
}
.tcp-lab__row--lost .tcp-lab__fate {
  color: var(--ide-accent);
}

/* Cambios de estado, junto a la línea de vida de quien cambia. */
.tcp-lab__change {
  display: block;
  margin-top: 0.25rem;
  font-size: var(--sl-text-xs);
  color: var(--ide-keyword);
}
.tcp-lab__change--server {
  text-align: end;
}

.tcp-lab__lose {
  display: block;
  margin: 0.375rem auto 0;
  padding: 0.125rem 0.625rem;
  border: 1px solid var(--ide-accent);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--ide-accent);
  font: inherit;
  font-size: var(--sl-text-xs);
  cursor: pointer;
}
.tcp-lab__lose:hover {
  background: var(--ide-accent-low);
}

.tcp-lab__row--timeout {
  font-size: var(--sl-text-xs);
  color: var(--ide-comment);
}
.tcp-lab__row--timeout.tcp-lab__row--server {
  text-align: end;
}

@media (prefers-reduced-motion: no-preference) {
  .tcp-lab__row {
    animation: tcp-lab-in 150ms ease-out;
  }
}
@keyframes tcp-lab-in {
  from {
    opacity: 0;
  }
}

/* Lo que ha recibido la aplicación del servidor: la clave de la lección. */
.tcp-lab__app {
  margin: 0.75rem 1rem 0;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.25rem;
  background: var(--ide-bg);
}
.tcp-lab__app-title {
  margin: 0 0 0.25rem;
  font-size: var(--sl-text-xs);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ide-muted);
}
.tcp-lab__app dl {
  display: grid;
  gap: 0.25rem;
  margin: 0;
}
.tcp-lab__app dl div {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.75rem;
}
.tcp-lab__app dt {
  color: var(--ide-muted);
}
.tcp-lab__app dd {
  margin: 0;
  white-space: pre-wrap;
  color: var(--ide-strong);
}

/* La frase del último paso, en la letra de la prosa. */
.tcp-lab__narration {
  margin: 0.75rem 1rem 0;
  font-family: var(--sl-font);
  font-size: var(--sl-text-base);
  line-height: 1.55;
}
.tcp-lab__narration p {
  margin: 0;
}
.tcp-lab__narration .tcp-lab__done {
  margin-top: 0.5rem;
  font-weight: 600;
  color: var(--ide-string);
}

.tcp-lab__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}
.tcp-lab__controls button {
  padding: 0.375rem 0.875rem;
  border: 1px solid var(--ide-border);
  border-radius: 0.25rem;
  background: var(--ide-bg);
  color: var(--ide-strong);
  font: inherit;
  cursor: pointer;
}
.tcp-lab__controls .tcp-lab__next {
  border-color: var(--ide-accent);
  background: var(--ide-accent);
  color: var(--ide-on-accent);
}
.tcp-lab__controls .tcp-lab__next[aria-disabled='true'] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Paso 8: comprueba que pasa**

Run: `pnpm --filter web exec vitest run src/playgrounds/tcp-handshake`
Expected: PASS en los cinco ficheros de test.

- [ ] **Paso 9: documenta el patrón**

En `docs/style-guide.md`, añade al final esta sección:

```markdown
## Playgrounds

Un playground es un componente React dentro de una lección (spec de la Fase 0, §6.4). El primero, y el modelo para los demás, es `tcp-handshake` (`docs/specs/2026-10-03-laboratorio-tcp-design.md`).

- **Dónde:** una carpeta por playground en `web/src/playgrounds/<nombre>/`.
- **Lógica e interfaz separadas:**
  - la lógica es TypeScript puro, sin React ni textos (en `tcp-handshake`, `machine.ts` con `reduce(estado, evento)`), y tiene tests de cada escenario;
  - la interfaz solo la pinta.
- **Textos:** en `strings.ts`, con una entrada `es` y otra `en` del mismo tipo, así que TypeScript exige las mismas claves en los dos idiomas. La lógica devuelve claves y datos (`{ key: 'server-buffers', ack: 107 }`), no frases.
- **Imports:** relativos dentro de la carpeta, porque Vitest no conoce el alias `~/`.
- **Estilos:** un CSS propio con prefijo (`tcp-lab__…`) y solo tokens `--ide-*`. La raíz lleva `not-content`, para que no le afecten los estilos de la prosa de Starlight, y `data-pagefind-ignore`, para que el buscador no indexe los botones.
- **Accesibilidad:**
  - todo funciona con el teclado;
  - lo que cambia se anuncia en una región `aria-live="polite"`;
  - un botón que desaparece al pulsarlo deja el foco en otro control;
  - con `prefers-reduced-motion`, nada se anima.
- **En la lección:** `import X from '~/playgrounds/<nombre>/X';` y `<X client:visible lang="es" />`. `client:visible` hace que el JavaScript de React solo se descargue cuando el playground entra en pantalla.
- **Tests:** además de los de la lógica, uno que pinta el componente con `react-dom/server` en los dos idiomas.
```

En `docs/specs/2026-10-02-web-fase-0-design.md`, §6.4, añade justo debajo del encabezado `#### \`tcp-handshake\` (nivel 3)`:

```markdown
- **Diseño detallado:** `docs/specs/2026-10-03-laboratorio-tcp-design.md`.
```

- [ ] **Paso 10: formato, tipos, suite y build**

Run: `pnpm exec prettier --write web/src/playgrounds/tcp-handshake web/astro.config.ts && pnpm format:check && pnpm check && pnpm test && pnpm build`
Expected: todo en verde. El build no pinta todavía el laboratorio (ninguna página lo usa), pero confirma que la integración de React no rompe nada: las mismas páginas que antes y los enlaces válidos.

- [ ] **Punto de control:** sin commit. Anota en el ledger las versiones instaladas.

---

### Tarea 4: La lección 5, «TCP frente a UDP», con el laboratorio

Como en las lecciones anteriores, el texto lo escribe quien ejecuta el plan siguiendo la guía de estilo. Este plan fija la estructura, lo que hay que comprobar y la verificación (el mismo formato que `docs/plans/2026-10-02-leccion-ip-ports-sockets.md`).

**Ficheros:**
- Crear:
  - `web/src/content/docs/es/phase-0/tcp-vs-udp.mdx`
  - `web/src/content/glossary/es/{udp,handshake,datagram,sequence-number,ack,retransmission}.yaml`
- Modificar:
  - `web/src/content/docs/es/phase-0/index.mdx`, para enlazar la lección 5;
  - `web/src/content/glossary/es/tcp.yaml`, con los términos relacionados nuevos;
  - `docs/pendientes.md`, con la revisión de la lección 5 y del laboratorio.

**Interfaces:**
- Consume (Tarea 3): `<TcpHandshake client:visible lang="es" />`, importado con `import TcpHandshake from '~/playgrounds/tcp-handshake/TcpHandshake';`.
- Produce: la página `/es/phase-0/tcp-vs-udp/`.

- [ ] **Paso 1: comprueba de verdad los comandos (macOS) y anota las salidas en el ledger**

Usa el scratchpad. Para los procesos en segundo plano, el truco de la lección 4: `(sleep N | nc -l 8080 > fichero &)`. Al acabar, comprueba con `pgrep -x nc` que no queda ningún `nc` vivo, y para los que queden con `kill <pid>`.

1. **Chat TCP:** `nc -l 8080` en una terminal y `nc localhost 8080` en otra. Lo que se escribe en una sale en la otra.
2. **Chat UDP:** `nc -u -l 8080` y `nc -u localhost 8080`. Anota:
   - si lo que escribe el cliente llega sin que haya ninguna conexión;
   - qué pasa si el cliente escribe **antes** de arrancar el servidor (¿se pierde en silencio? ¿hay un error en el segundo envío, por un ICMP «port unreachable»?);
   - si macOS `nc -u -l` solo atiende al primer cliente.
3. **Conexión aceptada, rechazada o sin respuesta:**
   - `nc -vz example.com 443`: debería decir `succeeded` (el handshake se completa);
   - `nc -vz localhost 9` (nadie escucha): `Connection refused`, porque el sistema operativo responde con un RST;
   - `nc -vz -G 5 example.com 81`: probablemente `Operation timed out`, porque nadie responde al SYN. Confirma el tiempo y el mensaje reales; si example.com respondiera en el 81, busca otro puerto filtrado y anótalo.
4. Si alguna salida no sale como esperas, la lección cuenta lo que pasa de verdad, no lo esperado.

- [ ] **Paso 2: comprueba los enlaces de «Para profundizar»**

Con `curl -sI -L` (y en Playwright los de Cloudflare, que bloquean a `curl`), deben dar 200:
- RFC 9293 (TCP): `https://www.rfc-editor.org/rfc/rfc9293.html`
- RFC 768 (UDP): `https://www.rfc-editor.org/rfc/rfc768.html`
- un artículo en español de Cloudflare Learning o MDN sobre TCP y UDP (búscalo y anota su URL; si no lo hay en español, en inglés y marcado como tal).

- [ ] **Paso 3: escribe el glosario**

Seis ficheros nuevos en `web/src/content/glossary/es/`, con el formato de la guía de estilo (`term`, `short`, `related`):
- `udp`;
- `handshake`;
- `datagram` (datagrama);
- `sequence-number` (número de secuencia);
- `ack`;
- `retransmission` (retransmisión).

Los `related` solo pueden apuntar a términos que existan en `es`. Añade `udp` y `handshake` a los `related` de `tcp.yaml`.

- [ ] **Paso 4: escribe la lección**

`web/src/content/docs/es/phase-0/tcp-vs-udp.mdx`:

- **Frontmatter:** `title: TCP frente a UDP`, `sidebar.order: 5` y `prerequisites: [phase-0/ip-ports-sockets]`. Entre 2 y 4 objetivos: explicar el handshake, leer `seq` y `ack`, explicar cómo recupera TCP un paquete perdido y elegir entre TCP y UDP.
- **El problema:** IP no promete nada; los routers tiran paquetes cuando se llenan, y no avisan. Alguien tiene que decidir qué hacer con eso: TCP lo arregla todo (y lo paga en tiempo) y UDP no arregla nada (y gana en rapidez).
- **La analogía:** una llamada de teléfono («¿me oyes?», «sí, ¿y tú a mí?», «sí») frente a enviar postales. El slot `limits` dice dónde falla: en una llamada no se numera nada, y TCP numera cada byte; TCP no «oye» en directo, confirma por escrito lo recibido; etcétera.
- **Cómo funciona de verdad:**
  - qué es una conexión (estado en los dos extremos);
  - el handshake y por qué son tres mensajes (dos números iniciales, dos confirmaciones, y el SYN-ACK junta dos en uno);
  - `seq` y `ack`, con el ejemplo del laboratorio (100/500, «Hola, » en 101…);
  - qué pasa cuando se pierde un segmento: temporizador, reenvío, el receptor guarda lo que llega fuera de orden y entrega en orden;
  - el control de flujo y de congestión, en una frase cada uno, como lo que queda fuera;
  - UDP: datagramas sin conexión, con una cabecera mínima (puertos, longitud y checksum);
  - una tabla de cuándo se usa cada uno: HTTP/1.1 y HTTP/2, SSH y bases de datos sobre TCP; DNS (casi siempre), videollamadas y juegos sobre UDP; HTTP/3 sobre QUIC, que va sobre UDP y rehace la fiabilidad por su cuenta.
- **Pruébalo:**
  1. **El laboratorio:** `<TcpHandshake client:visible lang="es" />`, con una guía corta antes: «recórrelo una vez sin perder nada; luego pierde el segundo segmento de datos y mira la aplicación del servidor; luego cambia a UDP y haz lo mismo».
  2. **El chat con `nc` y `nc -u`** (comandos y salidas reales del Paso 1).
  3. **Aceptada, rechazada o sin respuesta,** con `nc -vz` (Paso 1).
- **Ya lo has visto:**
  - *Initial connection* en la pestaña *Timing* de DevTools es el handshake: un viaje de ida y vuelta antes de enviar nada, y por eso un servidor lejano tarda más;
  - `h3` en la columna *Protocol* de DevTools: HTTP/3 sobre UDP;
  - `ERR_CONNECTION_REFUSED` (RST) frente a `ERR_CONNECTION_TIMED_OUT` (SYN sin respuesta).
- **Errores comunes:**
  - «UDP no es fiable, así que no sirve»;
  - «un ACK significa que la aplicación ya ha procesado los datos» (solo que el sistema operativo los ha recibido; importa en el backend);
  - «cada `fetch` hace un handshake» (`keep-alive` reutiliza la conexión, como viste en la lección 2).
- **Cierre:** resumen de 3 a 5 puntos, 3 `<SelfCheck>` (una sobre por qué hacen falta tres mensajes y otra sobre qué ve la aplicación con UDP si se pierde un datagrama), y los enlaces del Paso 2.
- **Términos:** marca con `<Term>` la primera aparición en el cuerpo de `tcp`, `udp`, `handshake`, `segmento`/`paquete`, `datagram`, `sequence-number`, `ack` y `retransmission`.

Enlaza la lección en `web/src/content/docs/es/phase-0/index.mdx`: `5. [TCP frente a UDP](/es/phase-0/tcp-vs-udp/)`.

En `docs/pendientes.md`, en «Revisión de contenido», añade la lección 5 y el laboratorio. Señala lo que el autor debe probar con sus propias manos: una partida sin pérdidas, otra perdiendo el 2.º segmento y otra en UDP.

- [ ] **Paso 5: verificación automática**

Run: `pnpm format:check && pnpm check && pnpm test && pnpm build`
Expected: todo en verde y `All internal links are valid`.

Además:
- `grep -o '· [0-9]* min' web/dist/es/phase-0/tcp-vs-udp/index.html` da entre 10 y 15 minutos;
- ninguna palabra prohibida: `grep -niE "simplemente|obviamente|es fácil|como todo el mundo sabe"` sobre la lección y el glosario nuevo no encuentra nada;
- la portada dice «5 de 8 lecciones».

- [ ] **Paso 6: revisión en el navegador del laboratorio**

Reinicia el servidor de desarrollo (hay dependencias nuevas). En `http://localhost:4321/es/phase-0/tcp-vs-udp/`, con Playwright:

1. **Partida sin pérdidas (TCP):** «Siguiente paso» hasta el final; 9 segmentos con los números del spec y el aviso final «Entregado completo y en orden: «Hola, todo bien».».
2. **Partida perdiendo el 2.º dato:** se ve «Guardado sin entregar: «bien»», el temporizador y el reenvío; al final, el texto completo.
3. **UDP perdiendo el 2.º:** «Recibido: «Hola, bien»» y el aviso de un datagrama perdido.
4. **Teclado:** se llega con Tab a TCP/UDP, a la escalera, a cada «Perder», a «Siguiente paso» y a «Reiniciar»; los radios cambian con las flechas.
5. **Foco:** después de «Perder», el foco está en «Siguiente paso». En UDP, perder el último datagrama en tránsito lleva el foco a «Reiniciar».
6. **Árbol de accesibilidad** (`browser_snapshot` del laboratorio): la escalera es una lista con filas que se leen enteras, los «Perder» tienen el nombre completo y la narración está en una región `aria-live`.
7. **Claro y oscuro, a 1280 y 375 px:** sin scroll horizontal en la página (`document.documentElement.scrollWidth === clientWidth`); las flechas, el ✕ y las etiquetas se leen; las líneas de vida quedan en los bordes.
8. **Movimiento reducido:** con `prefers-reduced-motion: reduce` emulado, las filas aparecen sin animación.
9. **Antes de hidratarse:** el HTML del build (`web/dist/es/phase-0/tcp-vs-udp/index.html`) ya contiene el panel con «Siguiente paso» y la frase de introducción.
10. **Número de línea del margen (a partir de 50rem):** Astro envuelve la isla en `<astro-island>`, que no genera caja propia (`display: contents`), así que el número que `theme.css` pone a cada bloque de primer nivel puede salir descolocado. Si pasa, exclúyelo como las tablas: añade `astro-island` a los dos selectores `:is(table, pre.mermaid)` de `web/src/styles/theme.css` y anótalo en el ledger.

Cada problema que encuentres se arregla en la tarea que corresponda (lógica en la 1, textos en la 2, interfaz en la 3), y se anota en el ledger.

- [ ] **Paso 7: revisión técnica independiente de la lección**

Un subagente revisa la lección, el glosario nuevo y los textos de `strings.ts`, igual que en la lección 4: errores técnicos, simplificaciones engañosas, pedagogía y la guía de estilo. Aplica sus hallazgos importantes y vuelve a pasar el Paso 5.

- [ ] **Punto de control:** sin commit. Anota en el ledger el resultado del Paso 5 y los hallazgos aplicados.
