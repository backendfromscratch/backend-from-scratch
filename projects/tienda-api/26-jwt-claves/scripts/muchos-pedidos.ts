// Añade 100 000 pedidos de mentira, para ver con EXPLAIN ANALYZE lo que cambia un índice (lección
// 7). Ejecútalo con: npm run bd:muchos-pedidos
// Todos son anteriores a los de ejemplo. Para quitarlos después:
//   DELETE FROM pedidos WHERE creado_en < '2026-10-01 09:00:00+00';
import { pool } from '../src/bd.ts';

// #region generar
// generate_series(1, 100000) da los números del 1 al 100 000, uno por fila, y el INSERT crea un
// pedido con cada uno: todo pasa dentro de la base de datos, en una sola consulta. Uno por minuto,
// hacia atrás desde el primer pedido de ejemplo.
await pool.query(`
  INSERT INTO pedidos (producto_id, cantidad, estado, creado_en)
  SELECT
    n % 3 + 1,
    n % 4 + 1,
    'enviado',
    timestamptz '2026-10-01 09:00:00+00' - n * interval '1 minute'
  FROM generate_series(1, 100000) AS n
`);
// ANALYZE pone al día las estadísticas de la tabla (cuántas filas tiene, cómo son sus valores):
// con ellas decide PostgreSQL cómo hacer cada consulta.
await pool.query('ANALYZE pedidos');
// #endregion generar

const { rows } = await pool.query('SELECT count(*)::int AS pedidos FROM pedidos');
console.log(`Ahora hay ${rows[0].pedidos} pedidos`);
await pool.end();
