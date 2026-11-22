// El latido del trabajador (Fase 9, lección 1). A la API, Docker le pregunta si está bien por /salud
// (el HEALTHCHECK del Dockerfile), pero el trabajador no es un servidor: no hay nada que
// preguntarle. Así que lo dice él: mientras coge trabajos, cada 5 segundos escribe en un fichero, y
// su healthcheck (compose.yaml) comprueba que el fichero es reciente. Un trabajador atascado (su
// proceso congelado, su bucle de eventos bloqueado) o que se está apagando deja de escribir, y a
// los 30 segundos Docker lo da por enfermo.
import { writeFileSync } from 'node:fs';
import { log } from './log.ts';

// El fichero, dentro del contenedor: el healthcheck de compose.yaml lo busca aquí.
export const FICHERO_LATIDO = '/tmp/latido';

// #region latido
// Cada `cadaMs`, si `vivo()` dice que sí, escribe la hora en el fichero, y con ella cambia la fecha
// de modificación del fichero, que es lo que lee el healthcheck. unref(): el intervalo no mantiene
// vivo el proceso por sí solo. Si el fichero no se puede escribir (sin Docker, en un sistema sin
// /tmp), lo dice una vez y el trabajador sigue. Devuelve la función que lo para.
export function empezarLatido(
  vivo: () => boolean,
  { fichero = FICHERO_LATIDO, cadaMs = 5000 }: { fichero?: string; cadaMs?: number } = {},
): () => void {
  let avisado = false;
  const latir = () => {
    if (!vivo()) return;
    try {
      writeFileSync(fichero, `${new Date().toISOString()}\n`);
    } catch (error) {
      if (!avisado) {
        log.warn({ fichero, motivo: (error as Error).message }, 'sin fichero de latido');
        avisado = true;
      }
    }
  };
  latir();
  const temporizador = setInterval(latir, cadaMs);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
// #endregion latido
