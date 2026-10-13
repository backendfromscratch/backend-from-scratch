// Starts the server: it listens on port 3000, only on this computer.
import { createShopServer } from './app.ts';

const server = createShopServer();
server.listen(3000, '127.0.0.1', () => {
  console.log('The shop is listening on http://localhost:3000');
});
