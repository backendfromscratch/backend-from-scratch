// Un eco por WebSocket: lo que el cliente manda, el servidor se lo devuelve.
import { upgradeWebSocket } from '@hono/node-server';

// #region eco
// La conexión empieza como una petición HTTP normal (GET /eco, con Upgrade: websocket). El
// servidor responde 101 Switching Protocols y, desde ahí, ya no hay peticiones ni respuestas:
// los dos lados mandan mensajes cuando quieren, por la misma conexión.
export const eco = upgradeWebSocket(() => ({
  onOpen(_evento, ws) {
    ws.send('Hola. Escribe algo y te lo devuelvo.');
  },
  onMessage(evento, ws) {
    ws.send(`eco: ${evento.data}`);
  },
}));
// #endregion eco
