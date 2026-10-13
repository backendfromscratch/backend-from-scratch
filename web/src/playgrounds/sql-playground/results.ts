/**
 * Results and errors as the reader sees them in psql: every value as PostgreSQL writes it as text
 * (t and f, 2026-10-01 09:00:00+00), and errors with their line and a caret under the problem.
 */
interface Field {
  name: string;
  dataTypeID: number;
}

export interface RawResult {
  fields: Field[];
  rows: unknown[][];
  affectedRows?: number;
}

/** More rows than this are counted, not drawn: a page with 100,000 rows would freeze. */
export const MAX_ROWS = 100;

export type Output =
  | { kind: 'rows'; columns: string[]; rows: (string | null)[][]; total: number }
  | { kind: 'done'; affected: number };

export function toOutput(result: RawResult): Output {
  if (result.fields.length === 0) return { kind: 'done', affected: result.affectedRows ?? 0 };
  return {
    kind: 'rows',
    columns: result.fields.map((field) => field.name),
    rows: result.rows
      .slice(0, MAX_ROWS)
      .map((row) => row.map((value) => (value === null ? null : String(value)))),
    total: result.rows.length,
  };
}

export interface DbError {
  message: string;
  /** From 1, inside the statement that failed. PGlite gives it as text. */
  position?: number | string;
  hint?: string;
  detail?: string;
}

export interface ErrorView {
  message: string;
  detail?: string;
  hint?: string;
  line?: { number: number; text: string; caret: number };
}

export function describeError(sql: string, error: DbError, offset: number): ErrorView {
  const view: ErrorView = { message: error.message };
  if (error.detail) view.detail = error.detail;
  if (error.hint) view.hint = error.hint;
  const position = Number(error.position);
  if (Number.isInteger(position) && position > 0) {
    const at = offset + position - 1;
    const lineStart = sql.lastIndexOf('\n', at - 1) + 1;
    const lineEnd = sql.indexOf('\n', at);
    view.line = {
      number: sql.slice(0, at).split('\n').length,
      text: sql.slice(lineStart, lineEnd === -1 ? sql.length : lineEnd),
      caret: at - lineStart,
    };
  }
  return view;
}

/** The block psql prints. The labels stay in English, like PostgreSQL's messages here. */
export function errorText(view: ErrorView): string {
  const lines = [`ERROR:  ${view.message}`];
  if (view.line) {
    const prefix = `LINE ${view.line.number}: `;
    lines.push(prefix + view.line.text, ' '.repeat(prefix.length + view.line.caret) + '^');
  }
  if (view.detail) lines.push(`DETAIL:  ${view.detail}`);
  if (view.hint) lines.push(`HINT:  ${view.hint}`);
  return lines.join('\n');
}

const asText = (value: string) => value;

/**
 * PGlite turns some types into JavaScript values (numbers, Dates, objects). These ids keep them as
 * the text PostgreSQL sends, which is what psql prints. database.test.ts checks every type a lesson uses.
 */
export const TEXT_PARSERS: Record<number, (value: string) => string> = Object.fromEntries(
  [
    16, // boolean
    17, // bytea
    20,
    21,
    23,
    26, // bigint, smallint, integer, oid
    114,
    3802, // json, jsonb
    700,
    701,
    1700, // real, double precision, numeric
    1082,
    1083,
    1114,
    1184,
    1186, // date, time, timestamp, timestamptz, interval
    1000,
    1005,
    1007,
    1016,
    1009,
    1015,
    1021,
    1022,
    1231,
    1182,
    1115,
    1185,
    199,
    3807, // arrays of those
  ].map((id) => [id, asText]),
);
