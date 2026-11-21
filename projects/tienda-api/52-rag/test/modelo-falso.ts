// Un modelo de IA de mentira para los tests (Fase 11): un servidor HTTP pequeño que habla el trozo de
// la API de mensajes de Claude (POST /v1/messages) que usa la tienda. Los tests nunca llaman al
// modelo de verdad: costaría dinero, pediría una clave y cada vez contestaría otra cosa. El SDK de la
// tienda llega aquí porque ANTHROPIC_BASE_URL apunta a este servidor. Fuera de los tests,
// scripts/modelo-falso.ts lo arranca para que practiques con él (npm run modelo-falso).
//
// #region como-se-usa
//   const modelo = await arrancarModeloFalso();   // en un puerto libre de 127.0.0.1
//   process.env.ANTHROPIC_BASE_URL = modelo.url;  // antes de importar la tienda
//   modelo.guion(texto('¡Hola!'));                // lo que contestará la próxima petición
//   …                                             // la petición a la tienda
//   modelo.peticiones[0]!.cuerpo                  // lo que la tienda le ha mandado
//   await modelo.peticiones[0]!.acabada           // 'entera', o 'cortada' si la tienda colgó antes
//   modelo.reiniciar();                           // sin guion ni peticiones, para el test siguiente
//   await modelo.cerrar();
// #endregion como-se-usa
//
// Cada petición se lleva el primer turno que quede en el guion. Un turno es un mensaje (con sus
// bloques: texto o llamadas a herramientas), un error de la API (un 429, un 529…) o un silencio (no
// contesta nunca: para probar el tiempo máximo). Cada mensaje empieza, además, con un bloque
// thinking vacío y firmado (pensamiento(), abajo), como los de Claude Haiku 5.5. Si la petición
// lleva "stream": true, el mensaje llega como eventos (Server-Sent Events), en el orden y con la
// forma que manda la API de verdad: todos de golpe o, con una pausa, poco a poco (para que un test
// pueda irse a medias, lección 2). Y un flujo puede romperse a medias: con un evento error, como
// hace la API cuando se sobrecarga en mitad de una respuesta, o con un corte de la conexión. Sin
// turnos en el guion, responde un 500 que lo dice.
// Desde la lección 6, un bloque de texto puede llevar citas (citations: de qué resultado de búsqueda
// sale), y el flujo las manda como la API, con citations_delta. Y, como la API, rechaza con un 400
// una petición con resultados de búsqueda (search_result) mal hechos (problemaDeLaPeticion).
import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import { setTimeout as dormir } from 'node:timers/promises';

// #region turnos
// Una cita (lección 6), como las manda la API cuando el texto sale de un bloque search_result: el
// texto citado, el origen y el título del resultado, su posición entre todos los search_result de
// la petición (search_result_index) y qué bloques de su contenido cita (del start_block_index al
// end_block_index, sin incluir este).
export interface Cita {
  type: 'search_result_location';
  cited_text: string;
  source: string;
  title: string | null;
  search_result_index: number;
  start_block_index: number;
  end_block_index: number;
}

// Un bloque del contenido de la respuesta, con los nombres de la API: texto (con sus citas, si las
// tiene), una llamada a una herramienta de la tienda (tool_use, lección 3) o lo que el modelo
// piensa antes (thinking).
export type Bloque =
  | { type: 'text'; text: string; citations?: Cita[] }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: string; signature: string };

// Por qué ha parado el modelo (stop_reason): ha terminado, quiere usar una herramienta, ha llegado al
// tope de tokens o se ha negado.
export type Parada = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';

// Los tokens que dice haber gastado: los de entrada (instrucciones y conversación) y los de salida.
export interface Uso {
  entrada: number;
  salida: number;
}

export interface TurnoMensaje {
  tipo: 'mensaje';
  contenido: Bloque[];
  parada: Parada;
  // Solo en una negativa: la categoría de la política que la ha provocado.
  categoria?: string | null;
  uso: Uso;
  // Con stream: los milisegundos entre un evento y el siguiente. Sin stream, la respuesta entera
  // tarda lo que tardaría su flujo, y llega de golpe al final. Sin pausa, todo enseguida.
  pausa?: number;
  // Con stream: lo que rompe el flujo a medias, después del texto del primer bloque (el que va
  // detrás del thinking; errorEnElFlujo): un error de la API, como evento, o 'corte', la conexión
  // cerrada sin más. Sin stream, la respuesta es ese error, con su código, o la conexión cerrada
  // sin contestar.
  errorEnMedio?: TurnoError | 'corte';
}

export interface TurnoError {
  tipo: 'error';
  estado: number;
  tipoError: string;
  mensaje: string;
  cabeceras: Record<string, string>;
}

export type Turno = TurnoMensaje | TurnoError | { tipo: 'silencio' };

const USO_POR_DEFECTO: Uso = { entrada: 120, salida: 30 };

/** Un mensaje con estos bloques. Por defecto, termina con end_turn. Con pausa, su flujo va lento. */
export function mensaje(
  contenido: Bloque[],
  {
    parada = 'end_turn',
    uso = USO_POR_DEFECTO,
    pausa,
  }: { parada?: Parada; uso?: Uso; pausa?: number } = {},
): Turno {
  return { tipo: 'mensaje', contenido, parada, uso, ...(pausa === undefined ? {} : { pausa }) };
}

/** Un bloque de texto. */
export const bloqueTexto = (text: string): Bloque => ({ type: 'text', text });

/**
 * Un bloque de texto con una cita (lección 6): el texto sale del resultado de búsqueda número
 * indice de la petición (el primero, el 0), que tiene ese origen, ese título y ese texto.
 */
export const bloqueCitado = (
  text: string,
  resultado: { indice: number; source: string; title: string; texto: string },
): Bloque => ({
  type: 'text',
  text,
  citations: [
    {
      type: 'search_result_location',
      cited_text: resultado.texto,
      source: resultado.source,
      title: resultado.title,
      search_result_index: resultado.indice,
      start_block_index: 0,
      end_block_index: 1,
    },
  ],
});

/** Una llamada a una herramienta: su nombre y lo que le pasa (input). */
export const bloqueHerramienta = (
  name: string,
  input: Record<string, unknown>,
  id = `toolu_falso_${name}`,
): Bloque => ({ type: 'tool_use', id, name, input });

/**
 * El modelo pide herramientas (lección 3): estos bloques (llamadas y, si se quiere, texto antes), y
 * stop_reason tool_use, que es lo que hace la API cuando para para que la tienda las ejecute.
 */
export const pideHerramientas = (...contenido: Bloque[]) =>
  mensaje(contenido, { parada: 'tool_use' });

/** La respuesta más corriente: un solo bloque de texto. */
export const texto = (contenido: string, opciones: { uso?: Uso; pausa?: number } = {}) =>
  mensaje([bloqueTexto(contenido)], opciones);

/** El modelo se niega a contestar: stop_reason refusal, con la categoría en stop_details. */
export function rechazo(categoria: string | null = 'cyber', contenido: Bloque[] = []): Turno {
  return { tipo: 'mensaje', contenido, parada: 'refusal', categoria, uso: USO_POR_DEFECTO };
}

/** Un error de la API: el código, su tipo (error.type) y su mensaje. */
export function errorDeLaApi(
  estado: number,
  tipoError: string,
  mensaje: string,
  cabeceras: Record<string, string> = {},
): TurnoError {
  return { tipo: 'error', estado, tipoError, mensaje, cabeceras };
}

/** 429: demasiadas peticiones. Con segundos, la cabecera retry-after. */
export const demasiadasPeticiones = (segundos?: number) =>
  errorDeLaApi(
    429,
    'rate_limit_error',
    'Number of request tokens has exceeded your per-minute rate limit',
    segundos === undefined ? {} : { 'retry-after': String(segundos) },
  );

/** 529: la API está sobrecargada. */
export const sobrecargado = () => errorDeLaApi(529, 'overloaded_error', 'Overloaded');

/** No contesta nunca: el cliente tiene que rendirse (su timeout). */
export const silencio = (): Turno => ({ tipo: 'silencio' });

/**
 * El bloque thinking con el que empieza cada mensaje del modelo falso; n es el número de la
 * petición que lo recibe (la primera después de reiniciar(), 1). Claude Haiku 5.5 piensa antes de
 * contestar (el thinking adaptativo está encendido si no se dice otra cosa) y no enseña lo que
 * piensa (display: omitted, también por defecto): el bloque llega con el texto vacío y una firma
 * (signature), que lleva lo pensado, cifrado. Si la conversación sigue con herramientas
 * (lección 3), la tienda tiene que devolverlo tal cual.
 */
export const pensamiento = (n: number): Bloque => ({
  type: 'thinking',
  thinking: '',
  signature: `firma-falsa-${n}`,
});

/**
 * Con stream, la API contesta 200 y empieza a mandar este texto; a medias, manda un evento error
 * (con el tipo del error: overloaded_error, si es sobrecargado()) y cierra la respuesta. Es lo que
 * hace la API de verdad cuando se sobrecarga en mitad de una respuesta: el código de estado ya
 * salió, así que el error llega como un evento más. Con 'corte', en lugar del evento, la conexión
 * se cierra sin más (un corte de la red). Sin stream, responde el error con su código.
 */
export function errorEnElFlujo(
  contenido: string,
  error: TurnoError | 'corte' = sobrecargado(),
): Turno {
  return {
    tipo: 'mensaje',
    contenido: [bloqueTexto(contenido)],
    parada: 'end_turn',
    uso: USO_POR_DEFECTO,
    errorEnMedio: error,
  };
}
// #endregion turnos

// #region servidor
/** Una petición que ha recibido: el camino, las cabeceras y el cuerpo (el JSON, ya leído). */
export interface PeticionRecibida {
  ruta: string;
  cabeceras: IncomingHttpHeaders;
  // El JSON tal cual llegó: cada test mira lo suyo.
  cuerpo: any;
  // Se cumple cuando se cierra la conexión de esta respuesta: 'entera' si el modelo falso llegó a
  // mandarla toda, 'cortada' si la tienda colgó antes (el tiempo máximo, o el cliente que se va).
  acabada: Promise<'entera' | 'cortada'>;
}

export interface ModeloFalso {
  /** http://127.0.0.1:<puerto>: lo que va en ANTHROPIC_BASE_URL. */
  url: string;
  /** Añade turnos al final del guion. */
  guion(...turnos: Turno[]): void;
  /** Las peticiones recibidas, en orden. */
  peticiones: PeticionRecibida[];
  /** Vacía el guion y las peticiones, y vuelve a contar desde 1. */
  reiniciar(): void;
  cerrar(): Promise<void>;
}

// Cómo arrancarlo. Los tests no le pasan nada: un puerto libre de 127.0.0.1, y cada petición se
// lleva un turno de su guion. scripts/modelo-falso.ts le da un puerto fijo, dónde escuchar (en
// Docker, 0.0.0.0, para que lo encuentren los demás contenedores) y porDefecto: el turno con el
// que contesta cuando el guion está vacío, decidido con lo que ha mandado la tienda (el cuerpo).
export interface OpcionesModeloFalso {
  puerto?: number;
  host?: string;
  porDefecto?: (cuerpo: any) => Turno;
}

export async function arrancarModeloFalso({
  puerto = 0,
  host = '127.0.0.1',
  porDefecto,
}: OpcionesModeloFalso = {}): Promise<ModeloFalso> {
  const turnos: Turno[] = [];
  const peticiones: PeticionRecibida[] = [];
  let contador = 0;

  const servidor = createServer(async (req, res) => {
    let texto = '';
    for await (const trozo of req) texto += trozo;
    const ruta = req.url ?? '';
    if (req.method !== 'POST' || ruta !== '/v1/messages') {
      return responderError(res, errorDeLaApi(404, 'not_found_error', `No existe ${ruta}`));
    }
    let cuerpo;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return responderError(
        res,
        errorDeLaApi(400, 'invalid_request_error', 'El cuerpo no es JSON'),
      );
    }
    const problema = problemaDeLaPeticion(cuerpo);
    if (problema !== undefined) {
      return responderError(res, errorDeLaApi(400, 'invalid_request_error', problema));
    }
    // writableFinished: si la respuesta salió entera antes de cerrarse la conexión.
    const acabada = new Promise<'entera' | 'cortada'>((resolver) =>
      res.once('close', () => resolver(res.writableFinished ? 'entera' : 'cortada')),
    );
    peticiones.push({ ruta, cabeceras: req.headers, cuerpo, acabada });
    contador += 1;
    res.setHeader('request-id', `req_falso_${contador}`);

    const turno = turnos.shift() ?? porDefecto?.(cuerpo);
    if (turno === undefined) {
      return responderError(
        res,
        errorDeLaApi(
          500,
          'api_error',
          'El modelo falso no tiene más turnos: añade uno con guion()',
        ),
      );
    }
    if (turno.tipo === 'silencio') return; // la respuesta se queda abierta, sin nada
    if (turno.tipo === 'error') return responderError(res, turno);
    const completo = mensajeCompleto(turno, contador, cuerpo.model);
    if (cuerpo.stream === true) {
      const eventos = eventosDelFlujo(completo, turno.errorEnMedio);
      return responderFlujo(res, eventos, turno.pausa ?? 0, turno.errorEnMedio === 'corte');
    }
    if (turno.errorEnMedio === 'corte') return res.destroy();
    if (turno.errorEnMedio) return responderError(res, turno.errorEnMedio);
    // Sin stream, con pausa, la respuesta tarda lo que tardaría su flujo, y llega entera: la API no
    // contesta hasta haberla escrito toda. Si la tienda se ha ido mientras, no hay a quién darla.
    if (turno.pausa) await dormir(turno.pausa * (eventosDelFlujo(completo).length - 1));
    if (res.destroyed) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(completo));
  });
  servidor.listen(puerto, host);
  await once(servidor, 'listening');
  const { port } = servidor.address() as { port: number };

  return {
    // Escuchando en todas las direcciones (0.0.0.0), también en 127.0.0.1.
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
    guion: (...nuevos) => turnos.push(...nuevos),
    peticiones,
    reiniciar() {
      turnos.length = 0;
      peticiones.length = 0;
      contador = 0;
    },
    async cerrar() {
      // Las respuestas que se han quedado abiertas (un silencio) no dejarían cerrar el servidor.
      servidor.closeAllConnections();
      servidor.close();
      await once(servidor, 'close');
    },
  };
}
// #endregion servidor

// #region peticion
// Las reglas de la API para los resultados de búsqueda (lección 6) que el modelo falso comprueba,
// para que un test falle si la tienda los manda mal, como fallaría con la API de verdad. Un
// tool_result que lleva algún search_result solo puede llevar search_result; cada uno, con su
// origen (source), su título (title) y al menos un bloque de texto no vacío; y todos los de la
// petición, con las citas igual (todas encendidas o todas apagadas). Devuelve el problema, o
// undefined si no hay ninguno.
type BloqueRecibido = { type?: string; [campo: string]: unknown };

export function problemaDeLaPeticion(cuerpo: {
  messages?: { role: string; content: unknown }[];
}): string | undefined {
  const citas = new Set<boolean>();
  for (const mensaje of cuerpo.messages ?? []) {
    if (!Array.isArray(mensaje.content)) continue;
    for (const bloque of mensaje.content as BloqueRecibido[]) {
      if (bloque.type !== 'tool_result' || !Array.isArray(bloque.content)) continue;
      const dentro = bloque.content as BloqueRecibido[];
      const resultados = dentro.filter((parte) => parte.type === 'search_result');
      if (resultados.length === 0) continue;
      if (resultados.length !== dentro.length) {
        return 'tool_result: if one block is a search_result, all of them must be';
      }
      for (const resultado of resultados) {
        const contenido = resultado.content as BloqueRecibido[] | undefined;
        if (typeof resultado.source !== 'string' || typeof resultado.title !== 'string') {
          return 'search_result: source and title are required';
        }
        const vacio = (parte: BloqueRecibido) =>
          parte.type !== 'text' || typeof parte.text !== 'string' || parte.text === '';
        if (!Array.isArray(contenido) || contenido.length === 0 || contenido.some(vacio)) {
          return 'search_result: content must be a list of non-empty text blocks';
        }
        citas.add((resultado.citations as { enabled?: boolean } | undefined)?.enabled === true);
      }
    }
  }
  if (citas.size > 1) {
    return 'search_result: citations must be enabled on all of them or on none';
  }
  return undefined;
}
// #endregion peticion

// #region respuestas
// Un error, como los manda la API: el código de estado y un JSON con type: 'error'.
function responderError(res: ServerResponse, turno: TurnoError) {
  res.writeHead(turno.estado, { 'content-type': 'application/json', ...turno.cabeceras });
  res.end(
    JSON.stringify({
      type: 'error',
      error: { type: turno.tipoError, message: turno.mensaje },
      request_id: res.getHeader('request-id') ?? null,
    }),
  );
}

// El mensaje entero, como lo devuelve la API sin streaming: el de la petición número n, que empieza
// con su bloque thinking.
function mensajeCompleto(turno: TurnoMensaje, n: number, modelo: string) {
  return {
    id: `msg_falso_${n}`,
    type: 'message',
    role: 'assistant',
    model: modelo,
    content: [pensamiento(n), ...turno.contenido],
    stop_reason: turno.parada,
    stop_sequence: null,
    stop_details:
      turno.parada === 'refusal'
        ? { type: 'refusal', category: turno.categoria ?? null, explanation: null }
        : null,
    usage: {
      input_tokens: turno.uso.entrada,
      output_tokens: turno.uso.salida,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

// El mismo mensaje, en eventos (Server-Sent Events), en el orden de la API: message_start (el
// mensaje sin contenido), un ping, y por cada bloque content_block_start, sus trozos
// (content_block_delta: text_delta para el texto, citations_delta para cada una de sus citas,
// input_json_delta para lo que se pasa a una herramienta, como JSON a trozos; para el thinking, un
// thinking_delta vacío y un signature_delta con la firma) y content_block_stop; al final,
// message_delta (por qué ha parado y los tokens de salida) y message_stop. Con un error en medio,
// el flujo llega hasta el texto del primer bloque después del thinking, y en lugar de su
// content_block_stop y de todo lo que sigue va el evento error, con la misma forma que el cuerpo de
// un error (type: 'error' y, dentro, el tipo y el mensaje); con un corte, nada más.
type Evento = { type: string; [campo: string]: unknown };

function eventosDelFlujo(
  completo: ReturnType<typeof mensajeCompleto>,
  errorEnMedio?: TurnoError | 'corte',
): Evento[] {
  const eventos: Evento[] = [
    {
      type: 'message_start',
      message: {
        ...completo,
        content: [],
        stop_reason: null,
        stop_details: null,
        usage: { ...completo.usage, output_tokens: 1 },
      },
    },
    { type: 'ping' },
  ];
  completo.content.forEach((bloque, index) => {
    if (bloque.type === 'thinking') {
      eventos.push(
        {
          type: 'content_block_start',
          index,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'thinking_delta', thinking: bloque.thinking },
        },
        {
          type: 'content_block_delta',
          index,
          delta: { type: 'signature_delta', signature: bloque.signature },
        },
      );
    } else if (bloque.type === 'text') {
      eventos.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      for (const trozo of trozos(bloque.text)) {
        eventos.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'text_delta', text: trozo },
        });
      }
      // Las citas del bloque, una por evento, después de su texto (lección 6).
      for (const cita of bloque.citations ?? []) {
        eventos.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'citations_delta', citation: cita },
        });
      }
    } else {
      eventos.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: bloque.id, name: bloque.name, input: {} },
      });
      for (const trozo of ['', ...trozos(JSON.stringify(bloque.input))]) {
        eventos.push({
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: trozo },
        });
      }
    }
    eventos.push({ type: 'content_block_stop', index });
  });
  eventos.push(
    {
      type: 'message_delta',
      delta: {
        stop_reason: completo.stop_reason,
        stop_sequence: null,
        stop_details: completo.stop_details,
      },
      usage: { output_tokens: completo.usage.output_tokens },
    },
    { type: 'message_stop' },
  );
  if (errorEnMedio === undefined) return eventos;
  const primero = completo.content.findIndex((bloque) => bloque.type !== 'thinking');
  const hasta = eventos.findIndex(
    (evento) => evento.type === 'content_block_stop' && evento.index === primero,
  );
  if (errorEnMedio === 'corte') return eventos.slice(0, hasta);
  return [
    ...eventos.slice(0, hasta),
    { type: 'error', error: { type: errorEnMedio.tipoError, message: errorEnMedio.mensaje } },
  ];
}

// Cada evento son dos líneas, event: y data:, y una en blanco. Con pausa, cada uno espera ese
// tiempo antes de salir (el primero, no: las cabeceras y message_start salen enseguida, como en la
// API). Si la tienda cuelga a medias, se deja de escribir. Con cortar, al final la conexión se
// cierra de golpe, en lugar de terminar la respuesta: antes se espera a que haya salido lo escrito
// (destroy() tira lo que aún no ha salido, y sería un corte antes de empezar).
async function responderFlujo(
  res: ServerResponse,
  eventos: Evento[],
  pausa: number,
  cortar: boolean,
) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  let salido: Promise<unknown> = Promise.resolve();
  for (const [i, datos] of eventos.entries()) {
    if (i > 0 && pausa > 0) await dormir(pausa);
    if (res.destroyed) return;
    const evento = `event: ${datos.type}\ndata: ${JSON.stringify(datos)}\n\n`;
    salido = new Promise((listo) => res.write(evento, listo));
  }
  if (!cortar) return res.end();
  await salido;
  res.destroy();
}

// Un texto en trozos de unas pocas letras, como llegan los tokens.
function trozos(texto: string): string[] {
  return texto.match(/.{1,8}/gsu) ?? [];
}
// #endregion respuestas
