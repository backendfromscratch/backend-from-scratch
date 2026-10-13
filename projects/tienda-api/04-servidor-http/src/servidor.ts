// Arranca el servidor: escucha en el puerto 3000, solo en este ordenador.
import { crearServidor } from './app.ts';

const servidor = crearServidor();
servidor.listen(3000, '127.0.0.1', () => {
  console.log('La tienda escucha en http://localhost:3000');
});
