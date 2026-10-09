/**
 * Sustituye cada {nombre} de una frase por su valor. Los huecos sin valor se quedan como están.
 * La usan los textos de los laboratorios (strings.ts de cada uno).
 */
export function fill(template: string, values: Record<string, string | number | boolean>): string {
  return template.replace(/\{(\w+)\}/g, (hole, name: string) =>
    name in values ? String(values[name]) : hole,
  );
}
