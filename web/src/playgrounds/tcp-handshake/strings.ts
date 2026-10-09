/** Texts of the tcp-handshake lab in both languages. The `payloads` data is ASCII only. */
import type { Locale } from '../../lib/locales';
import type { Fate, Narration, Side } from './machine';

export interface Strings {
  title: string;
  protocol: string;
  client: string;
  server: string;
  sideName: Record<Side, string>;
  /** What the state labels show in UDP mode. */
  udpNoState: string;
  next: string;
  reset: string;
  lose: string;
  /** Accessible name of the «Perder» button: {n} is the row and {summary} the segment. */
  loseLabel: string;
  /** The same in UDP mode, where there are datagrams instead of segments. */
  loseLabelUdp: string;
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
  /** Added to the narration when a data segment completes the handshake. */
  completesHandshake: string;
  done: string;
  udpDone: string;
  udpDoneLost: string;
  /** The data the client sends. ASCII only: so each letter is one byte. */
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
  loseLabelUdp: 'Perder el datagrama {n}: {summary}',
  ladderLabel: 'Lo que se ha enviado, en orden',
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
    'Además, este segmento lleva el mismo ack que el ACK del handshake que se perdió, así que completa el handshake: el servidor pasa a ESTABLISHED.',
  done: 'Entregado completo y en orden: {text}.',
  udpDone:
    'Fin. La aplicación ha recibido {text}. Esta vez no se ha perdido nada, pero si se hubiera perdido algún datagrama, nadie lo habría reenviado.',
  udpDoneLost:
    'Fin. La aplicación ha recibido {text}. Datagramas perdidos: {lost}. Nadie ha reenviado lo perdido: el cliente ni siquiera se ha enterado.',
  payloads: ['Hola, ', 'todo ', 'bien'],
  narration: {
    intro:
      'El servidor ya está escuchando (LISTEN), como nc -l. Pulsa «Siguiente paso» para que el cliente abra la conexión.',
    'udp-intro':
      'Con UDP no hay conexión que abrir: el cliente envía sus datos directamente. Pulsa «Siguiente paso».',
    'client-sends-syn':
      'El cliente envía un SYN («quiero conectarme») con su número de secuencia inicial, seq={seq}, y pasa a SYN_SENT. En la realidad, este número es aleatorio.',
    'server-receives-syn':
      'El servidor recibe el SYN, pasa a SYN_RECEIVED y responde con un SYN-ACK: su propio número inicial, seq={seq}, y ack={ack}, «el siguiente byte que espero de ti». El SYN gasta un número de secuencia, como si fuera un byte.',
    'server-repeats-synack':
      'Al servidor le llega otra vez el SYN: su SYN-ACK no ha llegado. Lo repite (seq={seq}, ack={ack}).',
    'client-receives-synack':
      'El cliente recibe el SYN-ACK y pasa a ESTABLISHED. Responde con un ACK, ack={ack}, para confirmar el número del servidor.',
    'client-repeats-ack':
      'Al cliente le llega otra vez el SYN-ACK: su ACK no ha llegado. Lo repite (ack={ack}).',
    'server-receives-ack':
      'El servidor recibe el ACK y pasa a ESTABLISHED. Handshake completo: cada uno conoce el número de secuencia del otro y sabe que el otro conoce el suyo.',
    'client-sends-data':
      'El cliente envía sus {count} segmentos de datos sin esperar respuesta. El primero empieza en el byte {first}, y el seq de cada uno es el del anterior más los bytes del anterior.',
    'server-delivers':
      'El servidor recibe los bytes que esperaba y entrega {text} a la aplicación. Responde ack={ack}: el siguiente byte que espera.',
    'server-buffers':
      'El servidor guarda {text}, pero no puede entregarlo todavía: le falta lo que empieza en el byte {ack}. Repite ack={ack} para avisar de que sigue esperando ese byte.',
    'server-discards-duplicate':
      'El servidor ya tenía {text}: es un reenvío. Lo descarta y repite ack={ack}.',
    'client-receives-ack':
      'El cliente recibe ack={ack}: el servidor tiene todo lo anterior a ese byte. Quedan {pending} bytes sin confirmar, así que reinicia el temporizador.',
    'client-receives-final-ack':
      'El cliente recibe ack={ack}: el servidor lo tiene todo. Para el temporizador.',
    'client-ignores-duplicate-ack':
      'El cliente recibe otra vez ack={ack} (fila {position}). No confirma nada nuevo, así que no hace nada. (TCP real, tras tres ACK repetidos, reenviaría sin esperar al temporizador.)',
    'segment-lost':
      'El segmento de la fila {position} se pierde, y la red no avisa a nadie. Si llevaba datos o un SYN, se reenviará cuando venza un temporizador. Si era un ACK sin datos, nadie lo reenvía: lo cubre el siguiente ACK, que es acumulativo.',
    'client-timeout-syn':
      'Vence el temporizador del cliente: su SYN no ha tenido respuesta, así que lo reenvía (seq={seq}). En la realidad, la primera espera es de alrededor de un segundo, cada reintento espera el doble que el anterior y al final se rinde.',
    'server-timeout-synack':
      'Vence el temporizador del servidor: nadie ha confirmado su SYN-ACK, así que lo reenvía (seq={seq}).',
    'client-timeout-data':
      'Vence el temporizador del cliente: nadie ha confirmado el byte {seq}. Reenvía solo ese segmento, el más antiguo sin confirmar. En la realidad, la espera se ajusta a lo que tarda la red en ir y volver.',
    'udp-client-sends':
      'El cliente envía sus {count} datagramas de golpe: sin handshake, sin números de secuencia y sin esperar confirmación.',
    'udp-server-receives':
      'Llega un datagrama y la aplicación recibe {text} tal cual. Nadie confirma nada.',
    'udp-lost':
      'El datagrama de la fila {position} se pierde. Con UDP nadie lo reenviará: el cliente ni siquiera sabe que se ha perdido.',
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
  loseLabelUdp: 'Lose datagram {n}: {summary}',
  ladderLabel: 'What has been sent, in order',
  routeToServer: 'Client → server',
  routeToClient: 'Server → client',
  fate: { 'in-transit': 'In transit', delivered: 'Delivered', lost: 'Lost' },
  retransmission: 'retransmission',
  bytes: '{n} bytes',
  timeoutRow: "The {side}'s timer expires",
  stateChange: 'The {side} moves to {state}.',
  appTitle: 'Server application',
  received: 'Received',
  buffered: 'Held, not delivered',
  nothing: '(nothing)',
  quoteOpen: '“',
  quoteClose: '”',
  completesHandshake:
    'This segment also carries the same ack as the handshake ACK that was lost, so it completes the handshake: the server moves to ESTABLISHED.',
  done: 'Delivered in full and in order: {text}.',
  udpDone:
    'Done. The application received {text}. Nothing was lost this time, but if a datagram had been lost, nobody would have resent it.',
  udpDoneLost:
    'Done. The application received {text}. Datagrams lost: {lost}. Nobody resent what was lost: the client never even noticed.',
  payloads: ['Hi, ', 'how are ', 'you?'],
  narration: {
    intro:
      'The server is already listening (LISTEN), like nc -l. Press “Next step” so the client opens the connection.',
    'udp-intro':
      'With UDP there is no connection to open: the client sends its data straight away. Press “Next step”.',
    'client-sends-syn':
      'The client sends a SYN (“I want to connect”) with its initial sequence number, seq={seq}, and moves to SYN_SENT. In reality this number is random.',
    'server-receives-syn':
      'The server receives the SYN, moves to SYN_RECEIVED and replies with a SYN-ACK: its own initial number, seq={seq}, and ack={ack}, “the next byte I expect from you”. The SYN uses up one sequence number, as if it were a byte.',
    'server-repeats-synack':
      'The SYN reaches the server again: its SYN-ACK never arrived. It sends it again (seq={seq}, ack={ack}).',
    'client-receives-synack':
      'The client receives the SYN-ACK and moves to ESTABLISHED. It replies with an ACK, ack={ack}, to confirm the server’s number.',
    'client-repeats-ack':
      'The SYN-ACK reaches the client again: its ACK never arrived. It sends it again (ack={ack}).',
    'server-receives-ack':
      'The server receives the ACK and moves to ESTABLISHED. Handshake complete: each side knows the other’s sequence number and knows the other side knows its own.',
    'client-sends-data':
      'The client sends its {count} data segments without waiting for a reply. The first one starts at byte {first}, and each seq is the previous one plus the previous segment’s length.',
    'server-delivers':
      'The server receives the bytes it was expecting and delivers {text} to the application. It replies ack={ack}: the next byte it expects.',
    'server-buffers':
      'The server keeps {text} but can’t deliver it yet: it is missing what starts at byte {ack}. It repeats ack={ack} to say it is still waiting for that byte.',
    'server-discards-duplicate':
      'The server already had {text}: this is a retransmission. It discards it and repeats ack={ack}.',
    'client-receives-ack':
      'The client receives ack={ack}: the server has everything before that byte. There are still {pending} unacknowledged bytes, so it restarts the timer.',
    'client-receives-final-ack':
      'The client receives ack={ack}: the server has everything. It stops the timer.',
    'client-ignores-duplicate-ack':
      'The client receives ack={ack} again (row {position}). It acknowledges nothing new, so the client does nothing. (Real TCP, after three duplicate ACKs, would resend without waiting for the timer.)',
    'segment-lost':
      'The segment in row {position} is lost, and the network tells no one. If it carried data or a SYN, it will be resent when a timer expires. If it was a bare ACK, nobody resends it: the next ACK, which is cumulative, covers it.',
    'client-timeout-syn':
      "The client's timer expires: its SYN got no reply, so it sends it again (seq={seq}). In reality the first wait is about one second, each retry waits twice as long as the last, and eventually it gives up.",
    'server-timeout-synack':
      "The server's timer expires: nobody has acknowledged its SYN-ACK, so it sends it again (seq={seq}).",
    'client-timeout-data':
      "The client's timer expires: nobody has acknowledged byte {seq}. It resends only that segment, the oldest unacknowledged one. In reality the wait is tuned to the measured round-trip time.",
    'udp-client-sends':
      'The client sends its {count} datagrams at once: no handshake, no sequence numbers and no waiting for confirmation.',
    'udp-server-receives':
      'A datagram arrives and the application receives {text} as is. Nobody acknowledges anything.',
    'udp-lost':
      'The datagram in row {position} is lost. With UDP nobody will resend it: the client doesn’t even know it was lost.',
  },
};

export const strings: Record<Locale, Strings> = { es, en };
