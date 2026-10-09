# Design: `tcp-handshake` lab (Phase 0, lesson 5)

- **Date:** 2026-10-03
- **Status:** approved (2026-10-03)
- **Origin:** the site and Phase 0 spec, §6.4 (`docs/specs/2026-10-02-site-and-phase-0-design.md`), which already fixes the essentials: it is React with `client:visible`, has pure logic with tests, advances step by step, any segment can be lost, has a UDP mode and leaves out the connection close. This document makes it concrete.
- **Author's decisions:**
  - the view is a ladder diagram, not two boxes with a packet travelling between them;
  - the client sends its three data segments at once, without waiting for each ACK.

## 1. Intent

This is the first playground on the site and the one that sets the pattern for the following ones (DNS, Docker…). With it, the reader has to understand three things:

1. Why three messages are needed to open a TCP connection.
2. What `seq` and `ack` are: `seq` numbers the first byte of each segment, and `ack` says "the next byte I expect".
3. Why TCP is reliable and delivers in order, and UDP does not.

Every step carries a sentence that explains what happened and why. That makes it lesson material and not a toy.

## 2. Behaviour

### 2.1 Starting point

- **The server** starts in `LISTEN`, like `nc -l`. **The client** starts in `CLOSED`.
- **Initial sequence numbers (ISN):** the client uses 100 and the server 500. They are fixed so the lesson can quote them. A sentence warns that in reality they are random and 32 bits long. They can be changed through configuration, for the tests.
- **Data** that the client sends after the handshake (it comes from `strings.ts`):

  | Language | Segments | Bytes | `seq` | Server ACK |
  |---|---|---|---|---|
  | es | «Hola, », «todo », «bien» | 6, 5, 4 | 101, 107, 112 | 107, 112, 116 |
  | en | «Hi, », «how are », «you?» | 4, 8, 4 | 101, 105, 113 | 105, 113, 117 |

- **TCP counts bytes, not characters.** The length is computed with `TextEncoder`. The texts are ASCII only, so the reader can check `ack = seq + length` by counting letters. A test enforces it.
- **The SYN takes up one sequence number.** That is why the first data byte is 101.

### 2.2 What happens in each step

The lab advances with «Siguiente paso» ("Next step"). In each step **only one thing** happens, the first one on this list that can be done:

1. **If there are segments in transit, the oldest one arrives.** The network is a queue: what leaves first arrives first, and nothing gets reordered on the way. The receiver reacts according to §2.3, and its replies go to the end of the queue.
2. **Otherwise, whoever has something pending sends it.** The client in `CLOSED` sends the SYN. The client in `ESTABLISHED` that has not yet sent its data sends the three segments at once.
3. **Otherwise, the oldest timer expires** (in a tie, the client's). Its owner resends **only the oldest unacknowledged segment**, marked as a retransmission, and arms the timer again.

**«Perder»** ("Lose") removes a segment in transit from the queue. It works with any of them, retransmissions included. The segment stays in the history as lost.

**Timers:**
- Each end has at most one.
- **The client's** is armed when it sends the SYN or the data, if it was not already armed. When an ACK arrives that confirms new bytes, it is re-armed if there are still unacknowledged bytes, and otherwise it stops.
- **The server's** is armed when it sends the SYN-ACK and stops when the handshake completes.
- ACKs without data have no timer and are not resent.

### 2.3 TCP rules

| Who | Receives | What it does |
|---|---|---|
| Server in `LISTEN` | SYN `seq=100` | Moves to `SYN_RECEIVED`, replies SYN-ACK `seq=500 ack=101` and arms its timer |
| Server in `SYN_RECEIVED` | The repeated SYN | Repeats the SYN-ACK |
| Client in `SYN_SENT` | SYN-ACK `ack=101` | Moves to `ESTABLISHED`, stops its timer and sends ACK `ack=501`. In the next step with nothing in transit, it will send the data |
| Client in `ESTABLISHED` | The repeated SYN-ACK | Repeats the ACK `ack=501` |
| Server in `SYN_RECEIVED` | ACK `ack=501` | Moves to `ESTABLISHED` and stops its timer |
| Server in `SYN_RECEIVED` | A data segment (all of them carry `ack=501`) | Moves to `ESTABLISHED`, stops its timer and processes the data as in the following rows. This is what happens in reality if the handshake ACK is lost |
| Server | Data with the `seq` it expected | Delivers it to the application, together with the stored segments that now fit behind it. Replies ACK with the next byte it expects |
| Server | Data with a higher `seq` (an earlier one is missing) | Stores it without delivering it and repeats its last ACK |
| Server | Data it had already received (a retransmission) | Discards it and repeats its last ACK |
| Client | An ACK that confirms new bytes | Considers everything before it confirmed (the ACK is cumulative) and re-arms or stops its timer |
| Client | A repeated ACK that confirms nothing new | Does nothing |

**End.** The lab finishes when the client has all its bytes acknowledged and nothing is left in transit. Then «Siguiente paso» is disabled and the panel says «Entregado completo y en orden» ("Delivered complete and in order"). The connection stays in `ESTABLISHED`: closing with FIN is out of scope (§7).

### 2.4 UDP mode

- There are no states, handshake, `seq`, `ack` or timers. The state labels say «UDP: sin conexión» ("UDP: connectionless").
- The first step sends the three datagrams at once. Each following step delivers the oldest one, and the application receives it as is.
- A lost datagram does not come back, and the client does not find out. With «todo » lost, the application ends up with «Hola, bien».
- It finishes when nothing is left in transit. The panel says what the application received and how many datagrams were lost.

### 2.5 Simplifications, explained in the lab itself or in the lesson

- In reality, the timer counts time: it starts at around 1 second, doubles the wait on each retry and eventually gives up. Here it expires when the reader presses the button.
- Real TCP sometimes sends ACKs with a delay, and resends without waiting for the timer when it sees three repeated ACKs (*fast retransmit*). Neither is done here.
- The real network can reorder packets. Here it only loses them.
- On ACKs without data the `seq` is not shown, to avoid adding noise (in reality they carry it).

## 3. Narration

Each step produces a narration, `{ key, ...data }`, which `strings.ts` turns into a sentence in the page's language. Keys:

| Key | When |
|---|---|
| `intro` / `udp-intro` | Initial state |
| `client-sends-syn` | The client opens the connection |
| `server-receives-syn` | The server receives the SYN and replies SYN-ACK |
| `server-repeats-synack` | The server receives a repeated SYN |
| `client-receives-synack` | The client receives the SYN-ACK and moves to `ESTABLISHED` |
| `client-repeats-ack` | The client receives a repeated SYN-ACK |
| `server-receives-ack` | The server receives the handshake ACK |
| `client-sends-data` | The client sends its three segments |
| `server-delivers` | The data arrives in order (with the stored segments that fit, if any) |
| `server-completes-and-delivers` | The data completes the handshake in `SYN_RECEIVED` and is delivered |
| `server-buffers` | A segment arrives out of order |
| `server-discards-duplicate` | An already received segment arrives |
| `client-receives-ack` | An ACK confirms new bytes (some still pending or none) |
| `client-ignores-duplicate-ack` | A repeated ACK arrives |
| `segment-lost` / `udp-lost` | The reader loses a segment |
| `timeout` | A timer expires and a segment is resent |
| `done` / `udp-done` | End |
| `udp-client-sends` / `udp-server-receives` | Sending and delivery in UDP mode |

Example (es, `server-buffers`): «El servidor guarda "bien", pero no puede entregarlo: le falta "todo ". Repite ack=107 para avisar de que sigue esperando el byte 107.»

## 4. Interface

### 4.1 Layout

- **Panel** in the theme's style, like `<TryIt>`. It has a header `// laboratorio · handshake TCP` (or `// lab · TCP handshake`) and a **TCP | UDP** selector. Changing mode resets the lab.
- **Ladder header:** «Cliente» and «Servidor» (Client and Server), each with its current state as a label (`SYN_SENT`, `ESTABLISHED`…).
- **Ladder:** two vertical lines, the client's on the left and the server's on the right. Each segment is a row:
  - An arrow to the right (client → server) or to the left.
  - The label above: `SYN seq=100`, `SYN-ACK seq=500`, `ACK` or `seq=101 · «Hola, » (6 bytes)`.
  - The second line below: `ack=101`, `ack=501`…
  - A status, never indicated by colour alone:
    - **in transit:** dashed line, the label «en tránsito» ("in transit") and a **Perder** ("Lose") button;
    - **delivered:** solid line;
    - **lost:** the arrow is cut halfway with ✕ and the label «perdido» ("lost").
  - Retransmissions carry «(reenvío)» ("(retransmission)").
- **Timers:** a row of their own on their owner's side, «⏱ vence el temporizador del cliente» ("the client's timer expires").
- **State changes:** a mark on the vertical line, in the row where they happen («→ `ESTABLISHED`»).
- **Ladder height:** it has a maximum height, with its own scroll, and scrolls by itself to the new row. That way the controls always stay close, even if many packets are lost.
- **Server application**, below the ladder. It is the key to the lesson. It shows «Recibido: Hola, » ("Received: Hola, ") and, separately, «Guardado sin entregar: bien» ("Stored, not delivered: bien"). In UDP only «Recibido» exists.
- **Narration:** the sentence of the last step.
- **Controls:** **[▶ Siguiente paso]**, in the accent colour, and **[↺ Reiniciar]** ("Reset").
- **At 375 px:** the lines go at the edges and the labels in the middle, with no horizontal scroll on the page.

### 4.2 Accessibility

- **Mode selector:** a radio group (`fieldset` and `legend` «Protocolo»).
- **Ladder:** an ordered list. Each row reads out in full, for example «3. Cliente → servidor: ACK, ack=501. En tránsito». The arrows and lines are decorative (`aria-hidden`).
- **«Perder» button:** its accessible name is complete («Perder el segmento 3: ACK, ack=501»). When pressed, focus moves to «Siguiente paso», because the button disappears.
- **Narration:** in an `aria-live="polite"` region.
- **Keyboard:** everything is operated with Tab, Enter and Space, with no shortcuts of its own. When the ladder has a scroll, it can be focused and scrolled with the keyboard.
- **Motion:** with `prefers-reduced-motion`, nothing is animated and the scroll is instant. Without that preference, the new row appears with a short fade.
- **Colour:**
  - Only theme tokens (`--ide-*`): client arrows in `info`, server arrows in `string`, and what is lost in `accent`, always with ✕ and text.
  - Lines meet 3:1 as a graphic (WCAG 1.4.11), and texts 4.5:1 (`tokens.test.ts` already checks it).
- **Without JavaScript:** Astro renders the initial state on the server. The panel is visible with its introduction text, and the buttons do nothing until it hydrates.

## 5. Technical integration

### 5.1 Dependencies and files

- **Dependencies:** `@astrojs/react`, `react` and `react-dom`, plus `@types/react` and `@types/react-dom`. The `react()` integration is added in `web/astro.config.ts`.
- **Cost:** React weighs about 60 KB compressed. It is only downloaded on the lesson 5 page, when the lab enters the viewport (`client:visible`). The rest of the site stays free of React's JavaScript.
- **Files** in `web/src/playgrounds/tcp-handshake/`:

  | File | Responsibility |
  |---|---|
  | `machine.ts` | Pure logic: types, `initialState(config)`, `reduce(state, event)` and `canStep(state)`. Events: `{ type: 'step' }`, `{ type: 'lose', id }` and `{ type: 'reset', mode }`. It knows nothing about React or languages |
  | `machine.test.ts` | Logic tests (§6) |
  | `strings.ts` | UI strings, narration templates and data for each language (`es` and `en`). The type of `en` comes from `es`, so TypeScript requires the same keys |
  | `narration.ts` | Fills a template with the data of a narration |
  | `TcpHandshake.tsx` | Root component: `useReducer(reduce, …)`, receives `lang` |
  | `Ladder.tsx` | The ladder |
  | `tcp-handshake.css` | Styles, with the `tcp-lab` prefix and only theme tokens |

- **Use in the lesson:** `<TcpHandshake client:visible lang="es" />`, imported with the `~/playgrounds/…` alias.

### 5.2 Documentation

- In `docs/style-guide.md`, a "Playgrounds" section with the pattern: where each playground goes, how logic and interface are separated, how the per-language texts work and how it is used in MDX.
- In the Phase 0 spec (§6.4), a link to this document.

## 6. Tests and verification

| What | How |
|---|---|
| TCP happy path | Walked through with `step` until the end. The states, the `seq` and `ack` of each segment, the application's final text are checked, and that nothing is left in transit |
| TCP losses | One test for each type of lost segment: SYN, SYN-ACK, handshake ACK, the 1st, 2nd and 3rd data segments, a data ACK and a retransmission. In all of them, it ends with everything delivered in order |
| Specific cases | The handshake ACK is lost and the data completes the handshake. The 2nd data segment is lost: the server stores the 3rd, repeats the ACK, the timer resends only the 2nd and the ACK jumps to the end. A repeated SYN and SYN-ACK arrive |
| UDP | With no losses, the application receives everything. If the 2nd is lost, it receives «Hola, bien» and there is no retransmission |
| General rules | `lose` with an id that is not in transit changes nothing. `step` after the end changes nothing. `reset` returns to the initial state of the chosen mode |
| Texts | The data of both languages is ASCII. Each narration key has a template in `es` and in `en`, and `narration.ts` fills in all its data (no unreplaced `{…}`) |
| Rendering | `react-dom/server` renders the component in `es` and in `en` without errors and with the language's texts |
| Build | `pnpm test`, `pnpm check` and `pnpm build` green, with valid links |
| Browser | Keyboard and focus, accessibility tree, light and dark, 375 and 1280 px with no horizontal scroll, `prefers-reduced-motion` emulated, and a full run with losses in each mode |

## 7. Out of scope

- Closing the connection (FIN and its states), flow control and congestion control.
- Real time and the wait that doubles on each retry (only mentioned), *fast retransmit* and delayed ACKs.
- The network reordering packets.
- Choosing other texts, other ISNs or another number of segments from the interface.
- Keyboard shortcuts of its own.
