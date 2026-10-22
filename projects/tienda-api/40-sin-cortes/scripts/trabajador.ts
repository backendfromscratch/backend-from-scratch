// El trabajador (Fase 9, lección 1): el otro proceso de la tienda. El mismo código y la misma
// imagen que la API, con otro comando: no escucha peticiones, coge trabajos de la cola (src/cola.ts)
// y los hace. Con Docker Compose arranca solo (el servicio trabajador); sin Docker, en otra terminal:
//   npm run trabajador
// Necesita REDIS_URL (la cola) y DATABASE_URL (los avisos y los emails están en la base de datos).
import { pool } from '../src/bd.ts';
import { crearTrabajador } from '../src/cola.ts';
import { config } from '../src/config.ts';
import { empezarLatido } from '../src/latido.ts';
import { log } from '../src/log.ts';

if (!config.REDIS_URL) {
  console.error('Falta REDIS_URL: el trabajador coge los trabajos de la cola, que está en Redis');
  process.exit(1);
}

const trabajador = crearTrabajador();
// El latido (src/latido.ts): mientras el trabajador coge trabajos, Docker lo da por sano.
const pararLatido = empezarLatido(() => trabajador.enMarcha());
log.info('El trabajador espera trabajos de la cola');

// #region apagar
// Apagarse bien, como la API (Fase 7): docker stop manda SIGTERM. El trabajador deja de coger
// trabajos y termina el que tiene a medias antes de salir. Uno cortado a la mitad no se pierde (la
// cola lo da por abandonado y lo repite), pero se haría dos veces: un aviso o un correo de más.
// docker stop espera 10 segundos antes de matarlo, y ningún trabajo espera más de 5 segundos sin
// respuesta: ni un aviso (url-segura.ts) ni un correo (correo.ts).
for (const senal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(senal, async () => {
    // Lo primero, sin más latidos: ya se está yendo.
    pararLatido();
    log.info(`${senal}: el trabajador acaba lo que tiene a medias y se apaga`);
    // Si aun así algo se atasca, sale a los 9 segundos, antes de que docker stop lo mate, y con
    // error (1): no ha podido cerrarse bien.
    setTimeout(() => process.exit(1), 9000).unref();
    try {
      await trabajador.cerrar();
      await pool.end();
      process.exit(0);
    } catch (error) {
      log.error({ motivo: (error as Error).message }, 'el trabajador no se ha cerrado bien');
      process.exit(1);
    }
  });
}
// #endregion apagar
