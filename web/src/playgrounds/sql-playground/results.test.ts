import { describe, expect, it } from 'vitest';
import { MAX_ROWS, describeError, errorText, toOutput } from './results';

describe('toOutput', () => {
  it('a query with columns is a table, with NULL kept apart from text', () => {
    expect(
      toOutput({
        fields: [
          { name: 'id', dataTypeID: 23 },
          { name: 'nota', dataTypeID: 25 },
        ],
        rows: [
          ['1', null],
          ['2', 'x'],
        ],
      }),
    ).toEqual({
      kind: 'rows',
      columns: ['id', 'nota'],
      rows: [
        ['1', null],
        ['2', 'x'],
      ],
      total: 2,
    });
  });

  it('draws at most MAX_ROWS rows, and says how many there were', () => {
    const rows = Array.from({ length: 250 }, (_, i) => [String(i)]);
    const out = toOutput({ fields: [{ name: 'n', dataTypeID: 23 }], rows });
    expect(out).toMatchObject({ kind: 'rows', total: 250 });
    expect(out.kind === 'rows' && out.rows.length).toBe(MAX_ROWS);
  });

  it('a statement without columns says how many rows it changed', () => {
    expect(toOutput({ fields: [], rows: [], affectedRows: 3 })).toEqual({
      kind: 'done',
      affected: 3,
    });
    expect(toOutput({ fields: [], rows: [] })).toEqual({ kind: 'done', affected: 0 });
  });
});

describe('describeError', () => {
  it('finds the line and column of the error in the whole input', () => {
    const sql = 'SELECT 1;\nSELECT nombr\nFROM productos;';
    // PostgreSQL counts from 1 inside the statement that failed, which starts at 10.
    expect(
      describeError(
        sql,
        { message: 'column "nombr" does not exist', position: '8', hint: 'Perhaps…' },
        10,
      ),
    ).toEqual({
      message: 'column "nombr" does not exist',
      hint: 'Perhaps…',
      line: { number: 2, text: 'SELECT nombr', caret: 7 },
    });
  });

  it('without a position there is no line', () => {
    expect(
      describeError('SELECT 1', { message: 'boom', detail: 'Key (id)=(1) already exists.' }, 0),
    ).toEqual({
      message: 'boom',
      detail: 'Key (id)=(1) already exists.',
    });
  });
});

describe('errorText', () => {
  it('is what psql prints', () => {
    expect(
      errorText({
        message: 'column "nombr" does not exist',
        hint: 'Perhaps you meant "productos.nombre".',
        line: { number: 1, text: 'SELECT nombr FROM productos', caret: 7 },
      }),
    ).toBe(
      'ERROR:  column "nombr" does not exist\nLINE 1: SELECT nombr FROM productos\n               ^\nHINT:  Perhaps you meant "productos.nombre".',
    );
    expect(errorText({ message: 'duplicate key', detail: 'Key (id)=(1) already exists.' })).toBe(
      'ERROR:  duplicate key\nDETAIL:  Key (id)=(1) already exists.',
    );
  });
});
