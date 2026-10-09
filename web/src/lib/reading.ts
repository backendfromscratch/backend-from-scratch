const WORDS_PER_MINUTE = 200;

/** An empty cell or the separator row of a Markdown table: `|`, `|---|---|`… */
const TABLE_SYNTAX = /^\|[|:-]*$/;

/** Reading minutes of an MDX file: without imports, code blocks, component tags or table syntax. */
export function readingMinutes(body: string): number {
  const prose = body
    .replace(/^import .*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    // Props with a template literal (terminal output) before the tags: they may contain «>».
    .replace(/\{`[\s\S]*?`\}/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const words = prose.split(/\s+/).filter((word) => word && !TABLE_SYNTAX.test(word)).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
