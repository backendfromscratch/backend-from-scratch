const WORDS_PER_MINUTE = 200;

/** Una celda vacía o la fila separadora de una tabla de Markdown: `|`, `|---|---|`… */
const TABLE_SYNTAX = /^\|[|:-]*$/;

/** Minutos de lectura de un MDX: sin imports, bloques de código, etiquetas de componentes ni la sintaxis de las tablas. */
export function readingMinutes(body: string): number {
  const prose = body
    .replace(/^import .*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    // Las props con plantilla literal (salidas de terminal) antes que las etiquetas: pueden llevar «>».
    .replace(/\{`[\s\S]*?`\}/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const words = prose.split(/\s+/).filter((word) => word && !TABLE_SYNTAX.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
