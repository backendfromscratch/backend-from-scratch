// El modelo falso de los tests (test/modelo-falso.ts), como un servidor para practicar (Fase 11): la
// tienda le pregunta a él en lugar de a la API de Claude, gratis y sin clave, y ves qué hace cuando
// la API contesta, falla o va lenta. Contesta a todas las peticiones con el mismo escenario, el que
// elijas:
//   normal   una respuesta corta, que repite tu última pregunta
//   429      demasiadas peticiones, con retry-after: 3. El SDK de la tienda repite la petición dos
//            veces, esperando esos 3 segundos, y la tienda acaba respondiendo 503
//   529      la API está sobrecargada, sin retry-after: el SDK repite con sus esperas cortas
//   lento    una respuesta larga, un trozo cada 250 ms: en streaming llega poco a poco; sin él, la
//            respuesta entera, unos 9 segundos después
//   herramienta  (lección 3) primero pide buscar_productos con «taza»; cuando la tienda le devuelve
//            el resultado, contesta con lo que le ha llegado
// Ejecútalo con:
//   npm run modelo-falso                 el escenario normal, en http://127.0.0.1:4100
//   npm run modelo-falso -- 429          otro (o ESCENARIO=429 npm run modelo-falso)
// y la tienda, en tu ordenador (npm run dev), con ANTHROPIC_BASE_URL=http://127.0.0.1:4100 y una
// clave cualquiera en .env. Con Docker Compose, el servicio modelo-falso de compose.yaml lo arranca
// en la red de la tienda (mira el README). Cada petición que le llega deja una línea: lo que ha
// pedido la tienda y lo que le contesta. Nunca lo uses fuera de tu ordenador.
import {
  arrancarModeloFalso,
  bloqueHerramienta,
  bloqueTexto,
  demasiadasPeticiones,
  pideHerramientas,
  sobrecargado,
  texto,
  type Turno,
} from '../test/modelo-falso.ts';

// #region escenarios
// Lo que ha mandado la tienda, con los nombres de la API: lo justo para contestar.
interface Peticion {
  model?: string;
  stream?: boolean;
  messages?: { role: string; content: unknown }[];
}

// El texto de la última pregunta: el último mensaje de la persona, si es un texto.
function ultimaPregunta(peticion: Peticion): string {
  const ultimo = peticion.messages?.findLast((mensaje) => mensaje.role === 'user');
  return typeof ultimo?.content === 'string' ? ultimo.content : '(sin texto)';
}

// Lo que ha devuelto una herramienta, si la conversación acaba con su resultado (un bloque
// tool_result en el último mensaje), en texto y acotado: los productos llegan en JSON.
function resultadoDeHerramienta(peticion: Peticion): string | undefined {
  const ultimo = peticion.messages?.at(-1);
  if (!Array.isArray(ultimo?.content)) return undefined;
  const resultado = ultimo.content.find((bloque) => bloque?.type === 'tool_result');
  if (resultado === undefined) return undefined;
  const contenido =
    typeof resultado.content === 'string' ? resultado.content : JSON.stringify(resultado.content);
  return contenido.length > 300 ? `${contenido.slice(0, 300)}…` : contenido;
}

const LARGA =
  'Te lo cuento despacio, trozo a trozo, como llega una respuesta larga del modelo: primero unas ' +
  'palabras, luego otras, y así hasta el final. En streaming las ves llegar; sin él, esperas a ' +
  'que esté entera.';

// Cada escenario decide su turno con la petición en la mano. Un Map, y no un objeto, para que la
// lista salga en este orden: en un objeto, las claves que son números ('429') irían delante.
export const ESCENARIOS = new Map<string, (peticion: Peticion) => Turno>([
  [
    'normal',
    (peticion) =>
      texto(
        `Soy el modelo falso: no entiendo nada, solo repito tu última pregunta. Era: «${ultimaPregunta(peticion)}».`,
      ),
  ],
  ['429', () => demasiadasPeticiones(3)],
  ['529', () => sobrecargado()],
  ['lento', () => texto(LARGA, { pausa: 250 })],
  [
    'herramienta',
    (peticion) => {
      const resultado = resultadoDeHerramienta(peticion);
      if (resultado === undefined) {
        return pideHerramientas(
          bloqueTexto('Voy a buscarlo.'),
          bloqueHerramienta('buscar_productos', { consulta: 'taza' }),
        );
      }
      return texto(
        `Soy el modelo falso. La tienda ha buscado por mí, y me ha devuelto: ${resultado}`,
      );
    },
  ],
]);
// #endregion escenarios

// Una línea por petición: qué ha pedido la tienda (el modelo, si es en streaming, cuántos
// mensajes lleva la conversación) y qué le contesta el modelo falso.
export function describir(peticion: Peticion, turno: Turno): string {
  const mensajes = peticion.messages?.length ?? 0;
  const pedido = `${peticion.model}, ${peticion.stream === true ? 'en streaming' : 'en JSON'}, ${mensajes} ${mensajes === 1 ? 'mensaje' : 'mensajes'}`;
  if (turno.tipo === 'error') {
    const espera = turno.cabeceras['retry-after'];
    return `→ ${pedido} ← ${turno.estado} ${turno.tipoError}${espera ? `, retry-after: ${espera}` : ''}`;
  }
  if (turno.tipo === 'silencio') return `→ ${pedido} ← (nada)`;
  return `→ ${pedido} ← 200, ${turno.parada}${turno.pausa ? `, un trozo cada ${turno.pausa} ms` : ''}`;
}

// #region arrancar
// Arranca el modelo falso con un escenario y devuelve su servidor. avisar escribe cada petición.
export async function arrancar(
  escenario: string,
  {
    puerto,
    host,
    avisar = () => {},
  }: { puerto?: number; host?: string; avisar?: (linea: string) => void } = {},
) {
  const elegido = ESCENARIOS.get(escenario);
  if (elegido === undefined) {
    throw new Error(
      `No hay escenario «${escenario}». Elige uno: ${[...ESCENARIOS.keys()].join(', ')}`,
    );
  }
  return arrancarModeloFalso({
    puerto,
    host,
    porDefecto: (peticion: Peticion) => {
      const turno = elegido(peticion);
      avisar(describir(peticion, turno));
      return turno;
    },
  });
}
// #endregion arrancar

if (import.meta.main) {
  // El escenario: el primer argumento, o ESCENARIO, o normal. El puerto y la dirección, como los de
  // la tienda: PORT (4100, si no) y HOST (127.0.0.1: solo tu ordenador; en Docker, 0.0.0.0).
  const escenario = process.argv[2] ?? process.env.ESCENARIO ?? 'normal';
  try {
    const modelo = await arrancar(escenario, {
      puerto: Number(process.env.PORT ?? 4100),
      host: process.env.HOST ?? '127.0.0.1',
      avisar: console.log,
    });
    // Ctrl + C, o docker compose stop: cierra el servidor y termina.
    for (const senal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(senal, () => void modelo.cerrar().then(() => process.exit(0)));
    }
    console.log(`Modelo falso en ${modelo.url}, con el escenario ${escenario} (Ctrl + C lo para)`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
