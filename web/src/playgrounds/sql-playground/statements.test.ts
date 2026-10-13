import { describe, expect, it } from 'vitest';
import { isMetaCommand, splitStatements } from './statements';

const texts = (sql: string) => splitStatements(sql).map((s) => s.text);

describe('splitStatements', () => {
  it('splits on semicolons and keeps where each one starts', () => {
    const sql = 'SELECT 1;\n  SELECT 2 ;SELECT 3';
    expect(splitStatements(sql)).toEqual([
      { text: 'SELECT 1', offset: 0 },
      { text: 'SELECT 2', offset: 12 },
      { text: 'SELECT 3', offset: 22 },
    ]);
  });

  it('ignores semicolons inside strings, quoted names, dollar quotes and comments', () => {
    expect(texts(`SELECT 'a;b', "x;y" FROM t; SELECT 'it''s;'`)).toEqual([
      `SELECT 'a;b', "x;y" FROM t`,
      `SELECT 'it''s;'`,
    ]);
    expect(texts('SELECT $$a;b$$; SELECT $f$ ; $f$')).toEqual([
      'SELECT $$a;b$$',
      'SELECT $f$ ; $f$',
    ]);
    expect(texts('SELECT 1 -- a;b\n; SELECT /* x; /* y; */ z; */ 2')).toEqual([
      'SELECT 1 -- a;b',
      'SELECT /* x; /* y; */ z; */ 2',
    ]);
  });

  it('drops empty and comment-only pieces', () => {
    expect(texts(' ;; -- only a comment\n; /* and this */ ;')).toEqual([]);
    expect(texts('')).toEqual([]);
  });

  it('keeps an unfinished string as one statement, for PostgreSQL to report', () => {
    expect(texts(`SELECT 'abc; SELECT 2`)).toEqual([`SELECT 'abc; SELECT 2`]);
  });
});

describe('isMetaCommand', () => {
  it('recognises psql commands', () => {
    expect(isMetaCommand({ text: '\\dt', offset: 0 })).toBe(true);
    expect(isMetaCommand({ text: '\\d productos', offset: 0 })).toBe(true);
    expect(isMetaCommand({ text: 'SELECT 1', offset: 0 })).toBe(false);
  });
});
