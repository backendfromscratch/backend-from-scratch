// An echo over WebSocket: what the client sends, the server sends back.
import { upgradeWebSocket } from '@hono/node-server';

// #region echo
// The connection starts as a normal HTTP request (GET /echo, with Upgrade: websocket). The server
// answers 101 Switching Protocols and, from then on, there are no more requests or responses: both
// sides send messages whenever they want, over the same connection.
export const echo = upgradeWebSocket(() => ({
  onOpen(_event, ws) {
    ws.send("Hi. Type something and I'll send it back.");
  },
  onMessage(event, ws) {
    ws.send(`echo: ${event.data}`);
  },
}));
// #endregion echo
