# Diseño: laboratorio `tcp-handshake` (Fase 0, lección 5)

- **Fecha:** 2026-10-03
- **Estado:** aprobado (2026-10-03)
- **Origen:** el spec de la web y la Fase 0, §6.4 (`docs/specs/2026-10-02-web-fase-0-design.md`), que ya fija lo esencial: es React con `client:visible`, tiene lógica pura con tests, se avanza paso a paso, se puede perder cualquier segmento, tiene modo UDP y deja fuera el cierre. Este documento lo concreta.
- **Decisiones del autor:**
  - la vista es un diagrama en escalera, no dos cajas con un paquete viajando;
  - el cliente envía sus tres segmentos de datos a la vez, sin esperar cada ACK.

## 1. Intención

Es el primer playground de la web y el que fija el patrón para los siguientes (DNS, Docker…). Con él, el lector tiene que entender tres cosas:

1. Por qué hacen falta tres mensajes para abrir una conexión TCP.
2. Qué son `seq` y `ack`: el `seq` numera el primer byte de cada segmento, y el `ack` dice «el siguiente byte que espero».
3. Por qué TCP es fiable y entrega en orden, y UDP no.

Cada paso lleva una frase que explica qué ha pasado y por qué. Eso lo convierte en material de lección y no en un juguete.

## 2. Comportamiento

### 2.1 Punto de partida

- **El servidor** empieza en `LISTEN`, como `nc -l`. **El cliente** empieza en `CLOSED`.
- **Números de secuencia iniciales (ISN):** el cliente usa el 100 y el servidor el 500. Son fijos para que la lección pueda citarlos. Una frase avisa de que en la realidad son aleatorios y de 32 bits. Se pueden cambiar por configuración, para los tests.
- **Datos** que el cliente envía tras el handshake (vienen de `strings.ts`):

  | Idioma | Segmentos | Bytes | `seq` | ACK del servidor |
  |---|---|---|---|---|
  | es | «Hola, », «todo », «bien» | 6, 5, 4 | 101, 107, 112 | 107, 112, 116 |
  | en | «Hi, », «how are », «you?» | 4, 8, 4 | 101, 105, 113 | 105, 113, 117 |

- **TCP cuenta bytes, no caracteres.** La longitud se calcula con `TextEncoder`. Los textos son solo ASCII, para que el lector pueda comprobar `ack = seq + longitud` contando letras. Un test lo exige.
- **El SYN ocupa un número de secuencia.** Por eso el primer byte de datos es el 101.

### 2.2 Qué pasa en cada paso

El laboratorio avanza con «Siguiente paso». En cada paso pasa **una sola cosa**, la primera de esta lista que se pueda hacer:

1. **Si hay segmentos en tránsito, llega el más antiguo.** La red es una cola: lo que sale antes llega antes, y nada se desordena por el camino. El receptor reacciona según §2.3, y sus respuestas entran al final de la cola.
2. **Si no, quien tenga algo pendiente lo envía.** El cliente en `CLOSED` envía el SYN. El cliente en `ESTABLISHED` que aún no ha enviado sus datos envía los tres segmentos de golpe.
3. **Si no, vence el temporizador más antiguo** (si empataran, el del cliente). Su dueño reenvía **solo el segmento más antiguo sin confirmar**, marcado como reenvío, y vuelve a armar el temporizador.

**«Perder»** quita de la cola un segmento en tránsito. Funciona con cualquiera, también con un reenvío. El segmento queda en la historia como perdido.

**Temporizadores:**
- Cada extremo tiene como mucho uno.
- **El del cliente** se arma al enviar el SYN o los datos, si no estaba armado. Cuando llega un ACK que confirma bytes nuevos, se rearma si quedan bytes sin confirmar, y si no, se para.
- **El del servidor** se arma al enviar el SYN-ACK y se para cuando el handshake se completa.
- Los ACK sin datos no tienen temporizador y no se reenvían.

### 2.3 Reglas de TCP

| Quién | Recibe | Qué hace |
|---|---|---|
| Servidor en `LISTEN` | SYN `seq=100` | Pasa a `SYN_RECEIVED`, responde SYN-ACK `seq=500 ack=101` y arma su temporizador |
| Servidor en `SYN_RECEIVED` | El SYN repetido | Repite el SYN-ACK |
| Cliente en `SYN_SENT` | SYN-ACK `ack=101` | Pasa a `ESTABLISHED`, para su temporizador y envía ACK `ack=501`. En el paso siguiente sin nada en tránsito, enviará los datos |
| Cliente en `ESTABLISHED` | El SYN-ACK repetido | Repite el ACK `ack=501` |
| Servidor en `SYN_RECEIVED` | ACK `ack=501` | Pasa a `ESTABLISHED` y para su temporizador |
| Servidor en `SYN_RECEIVED` | Un segmento de datos (todos llevan `ack=501`) | Pasa a `ESTABLISHED`, para su temporizador y procesa los datos como en las filas siguientes. Es lo que ocurre en la realidad si se pierde el ACK del handshake |
| Servidor | Datos con el `seq` que esperaba | Los entrega a la aplicación, junto con los guardados que ahora encajan detrás. Responde ACK con el siguiente byte que espera |
| Servidor | Datos con un `seq` mayor (falta uno anterior) | Los guarda sin entregarlos y repite su último ACK |
| Servidor | Datos que ya había recibido (un reenvío) | Los descarta y repite su último ACK |
| Cliente | Un ACK que confirma bytes nuevos | Da por confirmado todo lo anterior (el ACK es acumulativo) y rearma o para su temporizador |
| Cliente | Un ACK repetido, que no confirma nada nuevo | No hace nada |

**Fin.** El laboratorio termina cuando el cliente tiene todos sus bytes confirmados y no queda nada en tránsito. Entonces «Siguiente paso» se desactiva y el panel dice «Entregado completo y en orden». La conexión sigue en `ESTABLISHED`: el cierre con FIN queda fuera (§7).

### 2.4 Modo UDP

- No hay estados, handshake, `seq`, `ack` ni temporizadores. Las etiquetas de estado dicen «UDP: sin conexión».
- El primer paso envía los tres datagramas a la vez. Cada paso siguiente entrega el más antiguo, y la aplicación lo recibe tal cual.
- Un datagrama perdido no vuelve, y el cliente no se entera. Con «todo » perdido, la aplicación termina con «Hola, bien».
- Termina cuando ya no queda nada en tránsito. El panel dice qué ha recibido la aplicación y cuántos datagramas se perdieron.

### 2.5 Simplificaciones, explicadas en el propio laboratorio o en la lección

- En la realidad, el temporizador cuenta tiempo: empieza en torno a 1 segundo, dobla la espera en cada reintento y acaba rindiéndose. Aquí vence cuando el lector pulsa el botón.
- TCP real envía a veces los ACK con retraso, y reenvía sin esperar al temporizador cuando ve tres ACK repetidos (*fast retransmit*). Aquí no se hace ninguna de las dos cosas.
- La red real puede desordenar paquetes. Aquí solo los pierde.
- En los ACK sin datos no se muestra el `seq`, para no añadir ruido (en la realidad lo llevan).

## 3. Narración

Cada paso produce una narración, `{ key, ...datos }`, que `strings.ts` convierte en una frase en el idioma de la página. Claves:

| Clave | Cuándo |
|---|---|
| `intro` / `udp-intro` | Estado inicial |
| `client-sends-syn` | El cliente abre la conexión |
| `server-receives-syn` | El servidor recibe el SYN y responde SYN-ACK |
| `server-repeats-synack` | El servidor recibe un SYN repetido |
| `client-receives-synack` | El cliente recibe el SYN-ACK y pasa a `ESTABLISHED` |
| `client-repeats-ack` | El cliente recibe un SYN-ACK repetido |
| `server-receives-ack` | El servidor recibe el ACK del handshake |
| `client-sends-data` | El cliente envía sus tres segmentos |
| `server-delivers` | Los datos llegan en orden (con los guardados que encajan, si los hay) |
| `server-completes-and-delivers` | Los datos completan el handshake en `SYN_RECEIVED` y se entregan |
| `server-buffers` | Llega un segmento fuera de orden |
| `server-discards-duplicate` | Llega un segmento ya recibido |
| `client-receives-ack` | Un ACK confirma bytes nuevos (quedan pendientes o ya no) |
| `client-ignores-duplicate-ack` | Llega un ACK repetido |
| `segment-lost` / `udp-lost` | El lector pierde un segmento |
| `timeout` | Vence un temporizador y se reenvía un segmento |
| `done` / `udp-done` | Fin |
| `udp-client-sends` / `udp-server-receives` | Envío y entrega en modo UDP |

Ejemplo (es, `server-buffers`): «El servidor guarda "bien", pero no puede entregarlo: le falta "todo ". Repite ack=107 para avisar de que sigue esperando el byte 107.»

## 4. Interfaz

### 4.1 Disposición

- **Panel** con el estilo del tema, como `<TryIt>`. Lleva una cabecera `// laboratorio · handshake TCP` (o `// lab · TCP handshake`) y un selector **TCP | UDP**. Cambiar de modo reinicia el laboratorio.
- **Cabecera de la escalera:** «Cliente» y «Servidor», cada uno con su estado actual como etiqueta (`SYN_SENT`, `ESTABLISHED`…).
- **Escalera:** dos líneas verticales, la del cliente a la izquierda y la del servidor a la derecha. Cada segmento es una fila:
  - Una flecha hacia la derecha (cliente → servidor) o hacia la izquierda.
  - La etiqueta encima: `SYN seq=100`, `SYN-ACK seq=500`, `ACK` o `seq=101 · «Hola, » (6 bytes)`.
  - La segunda línea debajo: `ack=101`, `ack=501`…
  - Un estado, que nunca se indica solo con color:
    - **en tránsito:** línea discontinua, la etiqueta «en tránsito» y un botón **Perder**;
    - **entregado:** línea continua;
    - **perdido:** la flecha se corta a mitad con ✕ y la etiqueta «perdido».
  - Los reenvíos llevan «(reenvío)».
- **Temporizadores:** una fila propia en el lado de su dueño, «⏱ vence el temporizador del cliente».
- **Cambios de estado:** una marca en la línea vertical, en la fila donde ocurren («→ `ESTABLISHED`»).
- **Altura de la escalera:** tiene una altura máxima, con scroll propio, y se desplaza sola a la fila nueva. Así los controles quedan siempre cerca, aunque se pierdan muchos paquetes.
- **Aplicación del servidor**, debajo de la escalera. Es la clave de la lección. Muestra «Recibido: Hola, » y, aparte, «Guardado sin entregar: bien». En UDP solo existe «Recibido».
- **Narración:** la frase del último paso.
- **Controles:** **[▶ Siguiente paso]**, con el color de acento, y **[↺ Reiniciar]**.
- **A 375 px:** las líneas van en los bordes y las etiquetas en medio, sin scroll horizontal en la página.

### 4.2 Accesibilidad

- **Selector de modo:** un grupo de radio (`fieldset` y `legend` «Protocolo»).
- **Escalera:** una lista ordenada. Cada fila se lee entera, por ejemplo «3. Cliente → servidor: ACK, ack=501. En tránsito». Las flechas y las líneas son decorativas (`aria-hidden`).
- **Botón «Perder»:** su nombre accesible es completo («Perder el segmento 3: ACK, ack=501»). Al pulsarlo, el foco pasa a «Siguiente paso», porque el botón desaparece.
- **Narración:** en una región `aria-live="polite"`.
- **Teclado:** todo se maneja con Tab, Enter y Espacio, sin atajos propios. Cuando la escalera tiene scroll, se puede enfocar y desplazar con el teclado.
- **Movimiento:** con `prefers-reduced-motion`, nada se anima y el scroll es instantáneo. Sin esa preferencia, la fila nueva aparece con un fundido corto.
- **Color:**
  - Solo tokens del tema (`--ide-*`): flechas del cliente en `info`, del servidor en `string`, y lo perdido en `accent`, siempre con ✕ y texto.
  - Las líneas cumplen 3:1 como gráfico (WCAG 1.4.11), y los textos, 4,5:1 (ya lo comprueba `tokens.test.ts`).
- **Sin JavaScript:** Astro pinta el estado inicial en el servidor. Se ve el panel con su texto de introducción, y los botones no hacen nada hasta que se hidrata.

## 5. Integración técnica

### 5.1 Dependencias y ficheros

- **Dependencias:** `@astrojs/react`, `react` y `react-dom`, más `@types/react` y `@types/react-dom`. La integración `react()` se añade en `web/astro.config.ts`.
- **Coste:** React pesa unos 60 KB comprimidos. Solo se descarga en la página de la lección 5, cuando el laboratorio entra en pantalla (`client:visible`). El resto de la web sigue sin el JavaScript de React.
- **Ficheros** en `web/src/playgrounds/tcp-handshake/`:

  | Fichero | Responsabilidad |
  |---|---|
  | `machine.ts` | Lógica pura: tipos, `initialState(config)`, `reduce(estado, evento)` y `canStep(estado)`. Eventos: `{ type: 'step' }`, `{ type: 'lose', id }` y `{ type: 'reset', mode }`. No sabe de React ni de idiomas |
  | `machine.test.ts` | Tests de la lógica (§6) |
  | `strings.ts` | Textos de interfaz, plantillas de narración y datos de cada idioma (`es` y `en`). El tipo de `en` sale de `es`, así que TypeScript exige las mismas claves |
  | `narration.ts` | Rellena una plantilla con los datos de una narración |
  | `TcpHandshake.tsx` | Componente raíz: `useReducer(reduce, …)`, recibe `lang` |
  | `Ladder.tsx` | La escalera |
  | `tcp-handshake.css` | Estilos, con prefijo `tcp-lab` y solo tokens del tema |

- **Uso en la lección:** `<TcpHandshake client:visible lang="es" />`, importado con el alias `~/playgrounds/…`.

### 5.2 Documentación

- En `docs/style-guide.md`, una sección «Playgrounds» con el patrón: dónde va cada playground, cómo se separan la lógica y la interfaz, cómo funcionan los textos por idioma y cómo se usa en MDX.
- En el spec de la Fase 0 (§6.4), un enlace a este documento.

## 6. Tests y verificación

| Qué | Cómo |
|---|---|
| Camino feliz TCP | Se recorre con `step` hasta el fin. Se comprueban los estados, los `seq` y `ack` de cada segmento, el texto final de la aplicación y que no quede nada en tránsito |
| Pérdidas TCP | Una prueba por cada tipo de segmento perdido: SYN, SYN-ACK, ACK del handshake, el 1.º, 2.º y 3.º de datos, un ACK de datos y un reenvío. En todas, se termina con todo entregado en orden |
| Casos concretos | Se pierde el ACK del handshake y los datos completan el handshake. Se pierde el 2.º de datos: el servidor guarda el 3.º, repite el ACK, el temporizador reenvía solo el 2.º y el ACK salta al final. Llegan un SYN y un SYN-ACK repetidos |
| UDP | Sin pérdidas, la aplicación lo recibe todo. Si se pierde el 2.º, recibe «Hola, bien» y no hay reenvío |
| Reglas generales | `lose` con un id que no está en tránsito no cambia nada. `step` tras el fin no cambia nada. `reset` vuelve al estado inicial del modo elegido |
| Textos | Los datos de los dos idiomas son ASCII. Cada clave de narración tiene plantilla en `es` y en `en`, y `narration.ts` rellena todos sus datos (sin `{…}` sin sustituir) |
| Pintado | `react-dom/server` pinta el componente en `es` y en `en` sin errores y con los textos del idioma |
| Build | `pnpm test`, `pnpm check` y `pnpm build` en verde, con los enlaces válidos |
| Navegador | Teclado y foco, árbol de accesibilidad, claro y oscuro, 375 y 1280 px sin scroll horizontal, `prefers-reduced-motion` emulado, y una partida completa con pérdidas en cada modo |

## 7. Fuera de alcance

- El cierre de la conexión (FIN y sus estados), el control de flujo y el de congestión.
- El tiempo real y la espera que se dobla en cada reintento (solo se mencionan), el *fast retransmit* y los ACK retrasados.
- Que la red desordene paquetes.
- Elegir otros textos, otros ISN u otro número de segmentos desde la interfaz.
- Atajos de teclado propios.
