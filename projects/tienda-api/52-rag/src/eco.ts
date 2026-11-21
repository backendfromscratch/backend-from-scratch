// Un eco por WebSocket: lo que el cliente manda, el servidor se lo devuelve.
import { upgradeWebSocket } from '@hono/node-server';
import { alApagar } from './apagado.ts';

// #region eco
// La conexión empieza como una petición HTTP normal (GET /eco, con Upgrade: websocket). El
// servidor responde 101 Switching Protocols y, desde ahí, ya no hay peticiones ni respuestas:
// los dos lados mandan mensajes cuando quieren, por la misma conexión.
// Desde la Fase 9 (lección 4), al apagarse la API (apagado.ts) cierra la conexión con el código
// 1001, «me voy» (Going Away): el cliente puede volver a conectarse, y llegará a la otra copia.
export const eco = upgradeWebSocket(() => {
  let dejarDeEsperar = () => {};
  return {
    onOpen(_evento, ws) {
      const cerrar = () => ws.close(1001, 'La tienda se apaga');
      if (alApagar.aborted) return cerrar();
      alApagar.addEventListener('abort', cerrar);
      dejarDeEsperar = () => alApagar.removeEventListener('abort', cerrar);
      ws.send('Hola. Escribe algo y te lo devuelvo.');
    },
    onMessage(evento, ws) {
      ws.send(`eco: ${evento.data}`);
    },
    onClose() {
      dejarDeEsperar();
    },
  };
});
// #endregion eco
