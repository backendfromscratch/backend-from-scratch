/**
 * Splits what the reader types into statements, as psql does: each one is sent alone, so each gets
 * its own result and an error stops at its statement. Semicolons inside strings, quoted names,
 * dollar quotes and comments do not split.
 */
export interface Statement {
  text: string;
  /** Where `text` starts in the whole input: errors point at the right line with it. */
  offset: number;
}

/** `$$` or `$tag$`, the start of a dollar-quoted string. */
const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/;

export function splitStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  let hasCode = false;
  let i = 0;
  const push = (end: number) => {
    const piece = sql.slice(start, end);
    const lead = piece.length - piece.trimStart().length;
    if (hasCode) statements.push({ text: piece.trim(), offset: start + lead });
    hasCode = false;
  };
  while (i < sql.length) {
    const c = sql[i]!;
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
    } else if (c === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql.startsWith('/*', i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith('*/', i)) {
          depth--;
          i += 2;
        } else i++;
      }
    } else if (c === "'" || c === '"') {
      hasCode = true;
      i++;
      while (i < sql.length) {
        if (sql[i] === c && sql[i + 1] === c) i += 2;
        else if (sql[i] === c) {
          i++;
          break;
        } else i++;
      }
    } else if (c === '$' && DOLLAR_TAG.test(sql.slice(i))) {
      hasCode = true;
      const tag = DOLLAR_TAG.exec(sql.slice(i))![0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
    } else if (c === ';') {
      push(i);
      i++;
      start = i;
    } else {
      if (!/\s/.test(c)) hasCode = true;
      i++;
    }
  }
  push(sql.length);
  return statements;
}

/** `\dt`, `\d productos`…: commands of the psql program, not SQL. PostgreSQL does not know them. */
export function isMetaCommand(statement: Statement): boolean {
  return statement.text.startsWith('\\');
}
