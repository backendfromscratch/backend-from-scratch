/** The queries the lessons write into their SQL playgrounds, so a test can run them all. */
const PLAYGROUND = /<SqlPlayground\b[^>]*?\squery=\{`([\s\S]*?)`\}/g;

export function lessonQueries(mdx: string): string[] {
  return [...mdx.matchAll(PLAYGROUND)].map(([, query]) => query!);
}
