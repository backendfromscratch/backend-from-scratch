// An echo over WebSocket: what the client sends, the server sends back.
import { upgradeWebSocket } from '@hono/node-server';
import { onShutdown } from './shutdown.ts';

// #region echo
// The connection starts as a normal HTTP request (GET /echo, with Upgrade: websocket). The server
// answers 101 Switching Protocols and, from then on, there are no more requests or responses: both
// sides send messages whenever they want, over the same connection.
// Since Phase 9 (lesson 4), when the API shuts down (shutdown.ts) it closes the connection with
// code 1001, "going away": the client can connect again, and will reach the other copy.
export const echo = upgradeWebSocket(() => {
  let stopWaiting = () => {};
  return {
    onOpen(_event, ws) {
      const close = () => ws.close(1001, 'The shop is shutting down');
      if (onShutdown.aborted) return close();
      onShutdown.addEventListener('abort', close);
      stopWaiting = () => onShutdown.removeEventListener('abort', close);
      ws.send("Hi. Type something and I'll send it back.");
    },
    onMessage(event, ws) {
      ws.send(`echo: ${event.data}`);
    },
    onClose() {
      stopWaiting();
    },
  };
});
// #endregion echo
