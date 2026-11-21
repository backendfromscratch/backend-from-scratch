// A big table of fake vectors, to see with EXPLAIN ANALYZE what the HNSW index changes (Phase 11,
// lesson 5), as many-orders.ts did with the orders in Phase 5. Run it with:
//   npm run db:many-vectors              50,000 grouped vectors in the test_vectors table
//   npm run db:many-vectors -- 100000    that many
//   npm run db:many-vectors -- --random  fully random, with no groups: HNSW's worst case
//   npm run db:many-vectors -- --drop    drops the table
// With Docker Compose: docker compose exec api node scripts/many-vectors.ts
// It's a separate table, and not products: 50,000 fake products would show up in the assistant's
// searches. At the end it shows the two plans, with the index and without it (forcing PostgreSQL to
// read the whole table), of the same query the search by meaning runs, and how many of the true 10
// nearest the index finds: its recall, because HNSW is approximate.
import { parseArgs } from 'node:util';
import { pool } from '../src/db.ts';

let options: { drop: boolean; random: boolean; count: number };
try {
  const { values, positionals } = parseArgs({
    options: { drop: { type: 'boolean' }, random: { type: 'boolean' } },
    allowPositionals: true,
    strict: true,
  });
  options = {
    drop: values.drop === true,
    random: values.random === true,
    count: Number(positionals[0] ?? 50_000),
  };
  if (!Number.isInteger(options.count) || options.count < 1) throw new Error('a number');
} catch (error) {
  console.error(`Invalid argument: ${(error as Error).message}`);
  console.error('Usage: npm run db:many-vectors [-- <how many>] [-- --random], or -- --drop');
  process.exit(1);
}

const secondsSince = (start: number) => ((performance.now() - start) / 1000).toFixed(1);

try {
  await pool.query('DROP TABLE IF EXISTS test_vectors');
  if (options.drop) {
    console.log('Table test_vectors dropped');
  } else {
    // #region generate
    // A real model's vectors aren't spread at random: texts about the same thing land close to each
    // other, in groups, and far from those about other topics. So, by default, CENTRES random
    // points (the topics), and each vector, one of them (in turn) plus a little noise: two vectors
    // of the same group end up about 0.2 apart, and two of different groups, 1 apart. With
    // --random, each vector is 384 random numbers, with no groups: HNSW's worst case, because they
    // are all almost equally far from each other. The numbers, between -0.5 and 0.5 (random() -
    // 0.5; the noise, half as wide), gathered into an array with array_agg and turned into a
    // vector; at the end, normalised (l2_normalize, from pgvector: length 1, like the model's).
    // generate_series gives the rows and, for each one, the 384 dimensions: everything happens
    // inside the database, in a single query.
    const CENTRES = 500;
    const NOISE = 0.5;
    const random = () => Array.from({ length: 384 }, () => Math.random() - 0.5);
    const centres = Array.from({ length: CENTRES }, random);
    let start = performance.now();
    await pool.query(`
      CREATE TABLE test_vectors (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        embedding vector(384) NOT NULL
      )
    `);
    if (options.random) {
      await pool.query(
        `INSERT INTO test_vectors (embedding)
         SELECT l2_normalize(array_agg(random() - 0.5)::vector)
         FROM generate_series(1, $1) AS n, generate_series(1, 384) AS dimension
         GROUP BY n`,
        [options.count],
      );
    } else {
      // The centres arrive as a list of vectors ($2, vector[]), and unnest turns it into a table
      // with their number (WITH ORDINALITY, from 1). pgvector's + adds two vectors number by
      // number: the centre and the row's noise.
      await pool.query(
        `WITH centres AS (
           SELECT grp, centre FROM unnest($2::vector[]) WITH ORDINALITY AS c (centre, grp)
         ), noises AS (
           SELECT n, array_agg($3 * (random() - 0.5))::vector AS noise
           FROM generate_series(1, $1) AS n, generate_series(1, 384) AS dimension
           GROUP BY n
         )
         INSERT INTO test_vectors (embedding)
         SELECT l2_normalize(centre + noise)
         FROM noises JOIN centres ON grp = n % $4 + 1`,
        [options.count, centres.map((centre) => JSON.stringify(centre)), NOISE, CENTRES],
      );
    }
    const shape = options.random ? 'at random' : `grouped in ${CENTRES} topics`;
    console.log(`${options.count} vectors ${shape}, in ${secondsSince(start)} s`);
    // #endregion generate

    // #region index
    // The index, after filling the table: creating it in one go is faster than adding the rows one
    // by one. To build the graph, PostgreSQL uses maintenance_work_mem (64 MB if not told): with
    // 256 MB, the one for 50,000 vectors fits whole in memory and is built sooner. And with no
    // parallel helpers (max_parallel_maintenance_workers = 0): to work together, the graph would
    // have to be in shared memory (/dev/shm), and a Docker container's is 64 MB: it wouldn't fit.
    // SET, only in this connection. And ANALYZE updates the statistics, as in Phase 5.
    start = performance.now();
    const client = await pool.connect();
    try {
      await client.query(`SET maintenance_work_mem = '256MB'`);
      await client.query('SET max_parallel_maintenance_workers = 0');
      await client.query('CREATE INDEX ON test_vectors USING hnsw (embedding vector_cosine_ops)');
    } finally {
      client.release();
    }
    await pool.query('ANALYZE test_vectors');
    console.log(`HNSW index, in ${secondsSince(start)} s`);
    // #endregion index

    // #region explain
    // The search's query: the 5 nearest to a vector (here, row 1's). First as it is; then with
    // enable_indexscan = off, which forbids PostgreSQL from using indexes: it has to compute the
    // distance of every row and sort them all. In a transaction, with SET LOCAL, so the ban ends
    // with it.
    const query = `EXPLAIN ANALYZE
      SELECT id, embedding <=> (SELECT embedding FROM test_vectors WHERE id = 1) AS distance
      FROM test_vectors
      ORDER BY distance
      LIMIT 5`;
    const plan = async (withoutIndex: boolean) => {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        if (withoutIndex) await connection.query('SET LOCAL enable_indexscan = off');
        const { rows } = await connection.query<{ 'QUERY PLAN': string }>(query);
        await connection.query('COMMIT');
        return rows.map((row) => row['QUERY PLAN']).join('\n');
      } finally {
        connection.release();
      }
    };
    console.log(`\nWith the index:\n${await plan(false)}`);
    console.log(`\nWithout the index:\n${await plan(true)}`);
    // #endregion explain

    // #region recall
    // HNSW is approximate: it doesn't guarantee finding the true nearest ones. How many it finds is
    // its recall: of the true 10 nearest, how many the index returns too. To measure it, SEARCHES
    // new vectors, made like the table's (near a random centre or, with --random, at random): the
    // 10 nearest to each one reading the whole table (which makes no mistakes) and with the index,
    // with hnsw.ef_search (how many candidates it gathers before keeping the 10 best) at 40, the one
    // it uses unless told otherwise, and at 100.
    // For each way, also the average distance of the 10 it returns (how close the ones it finds
    // are) and how long each search takes, on average.
    const SEARCHES = 20;
    const ten = async (vector: string, setting: string) => {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(`SET LOCAL ${setting}`);
        const start = performance.now();
        const { rows } = await connection.query<{ id: number; distance: number }>(
          `SELECT id, embedding <=> $1::vector AS distance
           FROM test_vectors ORDER BY distance LIMIT 10`,
          [vector],
        );
        const ms = performance.now() - start;
        await connection.query('COMMIT');
        return { rows, ms };
      } finally {
        connection.release();
      }
    };
    const ways = [
      { name: 'reading the whole table', setting: 'enable_indexscan = off' },
      { name: 'with the index, hnsw.ef_search = 40', setting: 'hnsw.ef_search = 40' },
      { name: 'with the index, hnsw.ef_search = 100', setting: 'hnsw.ef_search = 100' },
    ].map((way) => ({ ...way, found: 0, distances: 0, ms: 0 }));
    for (let i = 0; i < SEARCHES; i++) {
      // JSON.stringify gives [0.12,-0.3,…], the text PostgreSQL turns into a vector. Not
      // normalised: the cosine distance doesn't look at the length.
      const centre = centres[Math.floor(Math.random() * CENTRES)]!;
      const numbers = options.random
        ? random()
        : centre.map((value) => value + NOISE * (Math.random() - 0.5));
      const vector = JSON.stringify(numbers);
      const truth = (await ten(vector, ways[0]!.setting)).rows.map((row) => row.id);
      for (const way of ways) {
        const { rows, ms } = await ten(vector, way.setting);
        way.found += rows.filter((row) => truth.includes(row.id)).length;
        way.distances += rows.reduce((sum, row) => sum + row.distance, 0);
        way.ms += ms;
      }
    }
    const total = SEARCHES * 10;
    console.log(`\nOf the true 10 nearest, over ${SEARCHES} searches (vectors ${shape}):`);
    for (const { name, found, distances, ms } of ways) {
      console.log(
        `  ${name}: ${found} of ${total} (${Math.round((found / total) * 100)}%), ` +
          `at ${(distances / total).toFixed(3)} on average, in ${(ms / SEARCHES).toFixed(1)} ms per search`,
      );
    }
    // #endregion recall
  }
} finally {
  await pool.end();
}
