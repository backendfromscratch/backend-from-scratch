/**
 * Replaces each {name} in a sentence with its value. Placeholders without a value are left as they are.
 * Used by the labs' texts (each one's strings.ts).
 */
export function fill(template: string, values: Record<string, string | number | boolean>): string {
  return template.replace(/\{(\w+)\}/g, (hole, name: string) =>
    name in values ? String(values[name]) : hole,
  );
}
