import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from './database';
import { MAX_ROWS } from './results';

const tienda = readFileSync(
  fileURLToPath(new URL('../../../public/practicas/tienda.sql', import.meta.url)),
  'utf8',
);

let db: Database;
beforeAll(async () => {
  db = await openDatabase(tienda);
}, 30_000);
afterAll(() => db.close());

describe('openDatabase', () => {
  it('answers with the shop’s data, every value as psql prints it', async () => {
    const reply = await db.run(
      'SELECT id, nombre, precio_centimos FROM productos ORDER BY id LIMIT 2;',
    );
    expect(reply).toEqual({
      outputs: [
        {
          kind: 'rows',
          columns: ['id', 'nombre', 'precio_centimos'],
          rows: [
            ['1', 'Camiseta', '2000'],
            ['2', 'Taza', '850'],
          ],
          total: 2,
        },
      ],
    });
  });

  it('writes the types a lesson uses as text, like psql', async () => {
    const { outputs } = await db.run(
      `SELECT true, 1::bigint, 1.50::numeric, 0.1::float8 + 0.2, creado_en, creado_en::date, interval '1 day',
              ARRAY[1, 2], ARRAY['a', 'b'], '{"a": 1}'::jsonb, NULL::text
         FROM pedidos ORDER BY id LIMIT 1`,
    );
    expect(outputs[0]).toMatchObject({
      rows: [
        [
          't',
          '1',
          '1.50',
          '0.30000000000000004',
          '2026-10-01 09:00:00+00',
          '2026-10-01',
          '1 day',
          '{1,2}',
          '{a,b}',
          '{"a": 1}',
          null,
        ],
      ],
    });
  });

  it('runs each statement alone: its own result and its own count', async () => {
    const { outputs } = await db.run(
      'UPDATE productos SET precio_centimos = precio_centimos WHERE id <= 2; SELECT count(*) FROM pedidos; CREATE TEMP TABLE t (x int)',
    );
    expect(outputs).toEqual([
      { kind: 'done', affected: 2 },
      { kind: 'rows', columns: ['count'], rows: [['25']], total: 1 },
      { kind: 'done', affected: 0 },
    ]);
  });

  it('stops at the first error, keeps what ran before and points at its line', async () => {
    const sql = 'SELECT 1 AS uno;\nSELECT nombr FROM productos;\nSELECT 3;';
    const reply = await db.run(sql);
    expect(reply.outputs).toHaveLength(1);
    expect(reply.error).toMatchObject({
      message: 'column "nombr" does not exist',
      line: { number: 2, text: 'SELECT nombr FROM productos;', caret: 7 },
    });
    expect(reply.error?.hint).toContain('productos.nombre');
  });

  it('says what a constraint rejected', async () => {
    const reply = await db.run("INSERT INTO categorias (nombre) VALUES ('Ropa')");
    expect(reply.error?.detail).toBe('Key (nombre)=(Ropa) already exists.');
  });

  it('recognises a psql command instead of running it', async () => {
    expect(await db.run('SELECT 1; \\dt')).toMatchObject({
      outputs: [{ kind: 'rows' }],
      meta: '\\dt',
    });
  });

  it('counts a big result but keeps only the first rows', async () => {
    const { outputs } = await db.run('SELECT * FROM generate_series(1, 5000)');
    expect(outputs[0]).toMatchObject({ kind: 'rows', total: 5000 });
    expect(outputs[0]!.kind === 'rows' && outputs[0]!.rows.length).toBe(MAX_ROWS);
  });

  it('shows a query plan', async () => {
    const { outputs } = await db.run('EXPLAIN SELECT * FROM pedidos WHERE id = 1');
    expect(outputs[0]).toMatchObject({ kind: 'rows', columns: ['QUERY PLAN'] });
  });

  it('an empty input does nothing', async () => {
    expect(await db.run('  -- nada\n')).toEqual({ outputs: [] });
  });

  it('keeps a transaction open between statements, like psql', async () => {
    const reply = await db.run(
      'BEGIN; DELETE FROM pedidos; SELECT count(*) FROM pedidos; ROLLBACK; SELECT count(*) FROM pedidos;',
    );
    expect(
      reply.outputs.filter((o) => o.kind === 'rows').map((o) => o.kind === 'rows' && o.rows[0]![0]),
    ).toEqual(['0', '25']);
  });
});
