/** Un error de un diagrama. `line` es la línea del bloque (desde 1) cuando el problema está en una línea concreta. */
export class DiagramError extends Error {
  line: number | undefined;

  constructor(message: string, line?: number) {
    super(message);
    this.name = 'DiagramError';
    this.line = line;
  }
}
