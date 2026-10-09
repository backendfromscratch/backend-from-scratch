/**
 * Cuánto JavaScript puede llegar a descargar una página: sus scripts y todo lo que importan, también
 * con import() dinámico. Es una cota superior (no todo se descarga siempre), pero habría detectado
 * los 3,4 MB que Mermaid podía cargar en cada lección.
 */
import path from 'node:path';

const IMPORT = /(?:import|from)\s*\(?\s*["'`]((?:\.{1,2}\/|\/_astro\/)[^"'`]+\.js)["'`]/g;

/** Los ficheros JS propios que pide una página: scripts, modulepreload, islas e imports en línea. */
export function scriptEntries(html: string): string[] {
  const entries = new Set<string>();
  for (const [, src] of html.matchAll(
    /(?:src|href|component-url|renderer-url)="(\/_astro\/[^"]+\.js)"/g,
  )) {
    entries.add(src!);
  }
  for (const [, src] of html.matchAll(/import\s*\(?\s*["'`](\/_astro\/[^"'`]+\.js)["'`]/g)) {
    entries.add(src!);
  }
  return [...entries].sort();
}

/** Los ficheros JS que importa un fichero compilado (estáticos y dinámicos), como rutas absolutas. */
export function jsImports(code: string, fromPath: string): string[] {
  const found = new Set<string>();
  for (const [, target] of code.matchAll(IMPORT)) {
    found.add(
      target!.startsWith('/') ? target! : path.posix.join(path.posix.dirname(fromPath), target!),
    );
  }
  return [...found];
}

/** Bytes de todo el JavaScript alcanzable desde `entries`. Cada fichero cuenta una vez. */
export function closureBytes(
  entries: readonly string[],
  read: (path: string) => string | undefined,
): number {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const pending = [...entries];
  let bytes = 0;
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = read(file);
    if (code === undefined) continue;
    bytes += encoder.encode(code).length;
    pending.push(...jsImports(code, file));
  }
  return bytes;
}
