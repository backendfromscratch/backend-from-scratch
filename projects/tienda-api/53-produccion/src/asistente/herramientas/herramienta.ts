// Cómo es una herramienta del asistente (Fase 11, lección 3). Una herramienta es una función de la
// tienda que el modelo puede pedir que se ejecute: el modelo no ejecuta nada, solo pide («llama a
// buscar_productos con { consulta: 'taza' }»), y es la tienda la que decide si lo hace y cómo.
import type Anthropic from '@anthropic-ai/sdk';

// #region quien
// Para quién trabaja la herramienta: el cliente de la sesión que ha hecho la pregunta. Lo pone la
// ruta, de la sesión, nunca el modelo: así una herramienta no puede hacer más de lo que podría hacer
// ese cliente, diga lo que diga la conversación.
export interface Quien {
  clienteId: number;
}
// #endregion quien

// #region herramienta
export interface Herramienta {
  // Lo que ve el modelo, con los nombres de la API: el nombre, la descripción (cuándo usarla y qué
  // devuelve) y el JSON Schema de lo que hay que pasarle. Va en cada petición, en tools.
  definicion: Anthropic.Tool;
  // Lo que ve el cliente mientras se ejecuta, en el evento herramienta del streaming: «Buscando
  // productos…». Siempre la misma frase: nunca lo que el modelo le ha pasado.
  etiqueta: string;
  // La función que hace el trabajo. entrada es lo que manda el modelo, sin comprobar: lo primero
  // que hace cada una es leerla con su esquema de Zod. Lo que devuelve va al modelo, en JSON (un
  // texto, tal cual), salvo que sea ResultadosDeBusqueda (abajo).
  ejecutar(entrada: unknown, quien: Quien): Promise<unknown>;
}
// #endregion herramienta

// #region resultados-de-busqueda
// Una fuente (lección 6): una sección de una página de ayuda. pagina es el nombre de su fichero
// (devoluciones, de ayuda/devoluciones.md), titulo el de la página y seccion el de la sección.
export interface Fuente {
  pagina: string;
  titulo: string;
  seccion: string;
}

// De dónde sale una sección, con los nombres de la API: source, el fichero de su página, y title,
// sus dos títulos. Es lo que lleva su bloque search_result (buscar-en-ayuda.ts), y lo que vuelve en
// cada cita de la respuesta que sale de él (conversacion.ts).
export const origenDe = ({ pagina, titulo, seccion }: Fuente) => ({
  source: `ayuda/${pagina}.md`,
  title: `${titulo}: ${seccion}`,
});

// Lo que devuelve una herramienta que busca en documentos (buscar_en_ayuda, lección 6), en lugar de
// unos datos cualesquiera. Va al modelo de otra forma: no en JSON, sino como bloques search_result,
// el formato que tiene la API para los resultados de una búsqueda (cada uno con su origen, su título
// y su texto) y con las citas encendidas. Con ellos, la respuesta del modelo dice de qué resultado
// saca cada frase (citations, en sus bloques de texto). Y lleva aparte, en el mismo orden, la fuente
// de cada bloque: con ellas, la tienda sabe de qué sección es cada cita, con sus propios datos.
export class ResultadosDeBusqueda {
  readonly bloques: Anthropic.SearchResultBlockParam[];
  readonly fuentes: Fuente[];

  constructor(bloques: Anthropic.SearchResultBlockParam[], fuentes: Fuente[]) {
    this.bloques = bloques;
    this.fuentes = fuentes;
  }
}
// #endregion resultados-de-busqueda
