/** A diagram error. `line` is the line within the block (from 1) when the problem is on a specific line. */
export class DiagramError extends Error {
  line: number | undefined;

  constructor(message: string, line?: number) {
    super(message);
    this.name = 'DiagramError';
    this.line = line;
  }
}
