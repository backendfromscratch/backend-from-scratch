// Una tabla grande de vectores de mentira, para ver con EXPLAIN ANALYZE lo que cambia el índice HNSW
// (Fase 11, lección 5), como hizo muchos-pedidos.ts con los pedidos en la Fase 5. Ejecútalo con:
//   npm run bd:muchos-vectores              50 000 vectores agrupados en la tabla vectores_de_prueba
//   npm run bd:muchos-vectores -- 100000    otros tantos
//   npm run bd:muchos-vectores -- --al-azar al azar del todo, sin grupos: el peor caso para HNSW
//   npm run bd:muchos-vectores -- --borrar  borra la tabla
// Con Docker Compose: docker compose exec api node scripts/muchos-vectores.ts
// Es una tabla aparte, y no productos: 50 000 productos de mentira saldrían en las búsquedas del
// asistente. Al final enseña los dos planes, con el índice y sin él (obligando a PostgreSQL a leer
// la tabla entera), de la misma consulta que hace la búsqueda por el significado, y cuántos de los
// 10 más cercanos de verdad encuentra el índice: su acierto (recall), porque HNSW es aproximado.
import { parseArgs } from 'node:util';
import { pool } from '../src/bd.ts';

let opciones: { borrar: boolean; alAzar: boolean; cuantos: number };
try {
  const { values, positionals } = parseArgs({
    options: { borrar: { type: 'boolean' }, 'al-azar': { type: 'boolean' } },
    allowPositionals: true,
    strict: true,
  });
  opciones = {
    borrar: values.borrar === true,
    alAzar: values['al-azar'] === true,
    cuantos: Number(positionals[0] ?? 50_000),
  };
  if (!Number.isInteger(opciones.cuantos) || opciones.cuantos < 1) throw new Error('un número');
} catch (error) {
  console.error(`Argumento no válido: ${(error as Error).message}`);
  console.error('Uso: npm run bd:muchos-vectores [-- <cuántos>] [-- --al-azar], o -- --borrar');
  process.exit(1);
}

const segundosDesde = (inicio: number) => ((performance.now() - inicio) / 1000).toFixed(1);

try {
  await pool.query('DROP TABLE IF EXISTS vectores_de_prueba');
  if (opciones.borrar) {
    console.log('Tabla vectores_de_prueba borrada');
  } else {
    // #region generar
    // Los vectores de un modelo de verdad no están repartidos al azar: los textos que tratan de lo
    // mismo caen cerca unos de otros, en grupos, y lejos de los de otros temas. Así que, por
    // defecto, CENTROS puntos al azar (los temas), y cada vector, uno de ellos (por turnos) más un
    // poco de ruido: dos vectores de un mismo grupo quedan a unos 0,2 de distancia, y dos de grupos
    // distintos, a 1. Con --al-azar, cada vector es 384 números al azar, sin grupos: el peor caso
    // para HNSW, porque todos están casi igual de lejos de todos. Los números, entre -0,5 y 0,5
    // (random() - 0.5; el ruido, la mitad de ancho), juntados en un array con array_agg y
    // convertidos en vector; al final, normalizado (l2_normalize, de pgvector: longitud 1, como los
    // del modelo). generate_series da las filas y, para cada una, las 384 dimensiones: todo pasa
    // dentro de la base de datos, en una sola consulta.
    const CENTROS = 500;
    const RUIDO = 0.5;
    const alAzar = () => Array.from({ length: 384 }, () => Math.random() - 0.5);
    const centros = Array.from({ length: CENTROS }, alAzar);
    let inicio = performance.now();
    await pool.query(`
      CREATE TABLE vectores_de_prueba (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        embedding vector(384) NOT NULL
      )
    `);
    if (opciones.alAzar) {
      await pool.query(
        `INSERT INTO vectores_de_prueba (embedding)
         SELECT l2_normalize(array_agg(random() - 0.5)::vector)
         FROM generate_series(1, $1) AS fila, generate_series(1, 384) AS dimension
         GROUP BY fila`,
        [opciones.cuantos],
      );
    } else {
      // Los centros llegan como una lista de vectores ($2, vector[]), y unnest la convierte en una
      // tabla con su número (WITH ORDINALITY, desde 1). El + de pgvector suma dos vectores número
      // a número: el centro y el ruido de la fila.
      await pool.query(
        `WITH centros AS (
           SELECT grupo, centro FROM unnest($2::vector[]) WITH ORDINALITY AS c (centro, grupo)
         ), ruidos AS (
           SELECT fila, array_agg($3 * (random() - 0.5))::vector AS ruido
           FROM generate_series(1, $1) AS fila, generate_series(1, 384) AS dimension
           GROUP BY fila
         )
         INSERT INTO vectores_de_prueba (embedding)
         SELECT l2_normalize(centro + ruido)
         FROM ruidos JOIN centros ON grupo = fila % $4 + 1`,
        [opciones.cuantos, centros.map((centro) => JSON.stringify(centro)), RUIDO, CENTROS],
      );
    }
    const forma = opciones.alAzar ? 'al azar' : `agrupados en ${CENTROS} temas`;
    console.log(`${opciones.cuantos} vectores ${forma}, en ${segundosDesde(inicio)} s`);
    // #endregion generar

    // #region indice
    // El índice, después de llenar la tabla: crearlo de una vez es más rápido que ir metiendo las
    // filas una a una. Para construir el grafo, PostgreSQL usa maintenance_work_mem (64 MB si no se
    // dice): con 256 MB, el de 50 000 vectores cabe entero en memoria y se construye antes. Y sin
    // ayudantes en paralelo (max_parallel_maintenance_workers = 0): para trabajar juntos, el grafo
    // tendría que estar en la memoria compartida (/dev/shm), y la de un contenedor de Docker es de
    // 64 MB: no cabría. SET, solo en esta conexión. Y ANALYZE pone al día las estadísticas, como en
    // la Fase 5.
    inicio = performance.now();
    const cliente = await pool.connect();
    try {
      await cliente.query(`SET maintenance_work_mem = '256MB'`);
      await cliente.query('SET max_parallel_maintenance_workers = 0');
      await cliente.query(
        'CREATE INDEX ON vectores_de_prueba USING hnsw (embedding vector_cosine_ops)',
      );
    } finally {
      cliente.release();
    }
    await pool.query('ANALYZE vectores_de_prueba');
    console.log(`Índice HNSW, en ${segundosDesde(inicio)} s`);
    // #endregion indice

    // #region explicar
    // La consulta de la búsqueda: los 5 más cercanos a un vector (aquí, el de la fila 1). Primero tal
    // cual; después con enable_indexscan = off, que le prohíbe a PostgreSQL usar índices: tiene que
    // calcular la distancia de cada fila y ordenarlas todas. En una transacción, con SET LOCAL, para
    // que la prohibición acabe con ella.
    const consulta = `EXPLAIN ANALYZE
      SELECT id, embedding <=> (SELECT embedding FROM vectores_de_prueba WHERE id = 1) AS distancia
      FROM vectores_de_prueba
      ORDER BY distancia
      LIMIT 5`;
    const plan = async (sinIndice: boolean) => {
      const conexion = await pool.connect();
      try {
        await conexion.query('BEGIN');
        if (sinIndice) await conexion.query('SET LOCAL enable_indexscan = off');
        const { rows } = await conexion.query<{ 'QUERY PLAN': string }>(consulta);
        await conexion.query('COMMIT');
        return rows.map((fila) => fila['QUERY PLAN']).join('\n');
      } finally {
        conexion.release();
      }
    };
    console.log(`\nCon el índice:\n${await plan(false)}`);
    console.log(`\nSin el índice:\n${await plan(true)}`);
    // #endregion explicar

    // #region acierto
    // HNSW es aproximado: no garantiza encontrar los más cercanos de verdad. Cuántos encuentra es su
    // acierto (en inglés, recall): de los 10 más cercanos de verdad, cuántos devuelve también el
    // índice. Para medirlo, BUSQUEDAS vectores nuevos, hechos como los de la tabla (cerca de un
    // centro al azar o, con --al-azar, al azar): los 10 más cercanos a cada uno leyendo la tabla
    // entera (que no se equivoca) y con el índice, con hnsw.ef_search (cuántos candidatos junta
    // antes de quedarse con los 10 mejores) en 40, el que usa si no se dice, y en 100. De cada
    // forma, también la distancia media de los 10 que devuelve (lo cerca que están los que
    // encuentra) y lo que tarda cada búsqueda, de media.
    const BUSQUEDAS = 20;
    const diez = async (vector: string, ajuste: string) => {
      const conexion = await pool.connect();
      try {
        await conexion.query('BEGIN');
        await conexion.query(`SET LOCAL ${ajuste}`);
        const inicio = performance.now();
        const { rows } = await conexion.query<{ id: number; distancia: number }>(
          `SELECT id, embedding <=> $1::vector AS distancia
           FROM vectores_de_prueba ORDER BY distancia LIMIT 10`,
          [vector],
        );
        const ms = performance.now() - inicio;
        await conexion.query('COMMIT');
        return { filas: rows, ms };
      } finally {
        conexion.release();
      }
    };
    const formas = [
      { nombre: 'leyendo la tabla entera', ajuste: 'enable_indexscan = off' },
      { nombre: 'con el índice, hnsw.ef_search = 40', ajuste: 'hnsw.ef_search = 40' },
      { nombre: 'con el índice, hnsw.ef_search = 100', ajuste: 'hnsw.ef_search = 100' },
    ].map((forma) => ({ ...forma, encontrados: 0, distancias: 0, ms: 0 }));
    for (let i = 0; i < BUSQUEDAS; i++) {
      // JSON.stringify da [0.12,-0.3,…], el texto que PostgreSQL convierte en un vector. Sin
      // normalizar: la distancia del coseno no mira la longitud.
      const centro = centros[Math.floor(Math.random() * CENTROS)]!;
      const numeros = opciones.alAzar
        ? alAzar()
        : centro.map((valor) => valor + RUIDO * (Math.random() - 0.5));
      const vector = JSON.stringify(numeros);
      const deVerdad = (await diez(vector, formas[0]!.ajuste)).filas.map((fila) => fila.id);
      for (const forma of formas) {
        const { filas, ms } = await diez(vector, forma.ajuste);
        forma.encontrados += filas.filter((fila) => deVerdad.includes(fila.id)).length;
        forma.distancias += filas.reduce((suma, fila) => suma + fila.distancia, 0);
        forma.ms += ms;
      }
    }
    const total = BUSQUEDAS * 10;
    console.log(
      `\nDe los 10 más cercanos de verdad, en ${BUSQUEDAS} búsquedas (vectores ${forma}):`,
    );
    for (const { nombre, encontrados, distancias, ms } of formas) {
      console.log(
        `  ${nombre}: ${encontrados} de ${total} (${Math.round((encontrados / total) * 100)} %), ` +
          `a ${(distancias / total).toFixed(3)} de media, en ${(ms / BUSQUEDAS).toFixed(1)} ms por búsqueda`,
      );
    }
    // #endregion acierto
  }
} finally {
  await pool.end();
}
