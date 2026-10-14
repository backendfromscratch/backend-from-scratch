import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './database';
import { lessonQueries } from './lessons';

describe('lessonQueries', () => {
  it('finds each playground’s query, in several lines', () => {
    const mdx =
      'Texto\n\n<SqlPlayground client:visible lang="es" query={`SELECT *\nFROM productos;`} />\n\n<SqlPlayground client:visible lang="es" />\n<SqlPlayground lang="es" rows={6} query={`SELECT 1;`} client:visible />';
    expect(lessonQueries(mdx)).toEqual(['SELECT *\nFROM productos;', 'SELECT 1;']);
  });
});

// The lessons never show a query that fails (spec §4.1): each runs against its language's data.
const docs = fileURLToPath(new URL('../../content/docs/', import.meta.url));
const practice = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../public/practicas/${name}`, import.meta.url)),
    'utf8',
  );
const lessons = readdirSync(docs, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.mdx'))
  .flatMap((file) =>
    lessonQueries(readFileSync(`${docs}${file}`, 'utf8')).map((sql) => ({
      file,
      sql,
      data: file.startsWith('en/') ? 'shop.sql' : 'tienda.sql',
    })),
  );

describe('the queries in the lessons', () => {
  it('run without errors on fresh data', async () => {
    for (const { file, sql, data } of lessons) {
      const db = await openDatabase(practice(data));
      const reply = await db.run(sql);
      expect(reply.error, `${file}: ${sql}`).toBeUndefined();
      expect(reply.meta, `${file}: ${sql}`).toBeUndefined();
      await db.close();
    }
  }, 120_000);
});
