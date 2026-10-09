/**
 * How much JavaScript a page can end up downloading: its scripts and everything they import, dynamic
 * import() included. It is an upper bound (not everything is always downloaded), but it would have
 * caught the 3.4 MB that Mermaid could load on every lesson.
 */
import path from 'node:path';

const IMPORT = /(?:import|from)\s*\(?\s*["'`]((?:\.{1,2}\/|\/_astro\/)[^"'`]+\.js)["'`]/g;

/** The first-party JS files a page requests: scripts, modulepreload, islands and inline imports. */
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

/** The JS files a compiled file imports (static and dynamic), as absolute paths. */
export function jsImports(code: string, fromPath: string): string[] {
  const found = new Set<string>();
  for (const [, target] of code.matchAll(IMPORT)) {
    found.add(
      target!.startsWith('/') ? target! : path.posix.join(path.posix.dirname(fromPath), target!),
    );
  }
  return [...found];
}

/** Bytes of all the JavaScript reachable from `entries`. Each file counts once. */
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
