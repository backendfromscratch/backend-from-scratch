/** Texts of the SQL playground in both languages. The {like this} placeholders are filled in SqlPlayground.tsx. */
import type { Locale } from '../../lib/locales';

const es = {
  title: 'playground · PostgreSQL en tu navegador',
  intro:
    'Un PostgreSQL de verdad, con los datos de la tienda. Lo que cambies se queda en esta página.',
  queryLabel: 'Consulta SQL',
  defaultQuery: 'SELECT * FROM productos;',
  run: 'Ejecutar',
  stop: 'Detener',
  reset: 'Restaurar datos',
  shortcut: 'Ctrl + Enter también ejecuta.',
  loading: 'Descargando PostgreSQL (unos 5 MB, solo la primera vez)…',
  restarting: 'Arrancando PostgreSQL con los datos de la tienda…',
  running: 'Ejecutando…',
  rows: '({count} filas)',
  oneRow: '(1 fila)',
  rowsCapped: '({count} filas; se ven las {shown} primeras)',
  done: 'Hecho: {count} filas cambiadas.',
  doneOne: 'Hecho: 1 fila cambiada.',
  doneNone: 'Hecho.',
  nothing: 'No hay nada que ejecutar: escribe una consulta.',
  meta: '{command} es un comando de psql, el programa de la terminal, no de SQL: aquí no funciona. Pruébalo en psql.',
  stopped: 'Detenido. Los datos vuelven a estar como al principio.',
  restored: 'Datos restaurados: la próxima consulta empieza con la tienda como al principio.',
  failed: 'No se ha podido cargar PostgreSQL. Comprueba la conexión y vuelve a pulsar «Ejecutar».',
  wait: 'Un momento: todavía estoy con la consulta anterior. Si no termina, pulsa «Detener».',
  announceRows: 'Resultado: {count} filas.',
  announceError: 'Error: {message}',
  table: 'Resultado {number}',
};

export type Strings = typeof es;

const en: Strings = {
  title: 'playground · PostgreSQL in your browser',
  intro: 'A real PostgreSQL, with the shop’s data. What you change stays on this page.',
  queryLabel: 'SQL query',
  defaultQuery: 'SELECT * FROM products;',
  run: 'Run',
  stop: 'Stop',
  reset: 'Reset data',
  shortcut: 'Ctrl + Enter runs it too.',
  loading: 'Downloading PostgreSQL (about 5 MB, only the first time)…',
  restarting: 'Starting PostgreSQL with the shop’s data…',
  running: 'Running…',
  rows: '({count} rows)',
  oneRow: '(1 row)',
  rowsCapped: '({count} rows; showing the first {shown})',
  done: 'Done: {count} rows changed.',
  doneOne: 'Done: 1 row changed.',
  doneNone: 'Done.',
  nothing: 'Nothing to run: type a query.',
  meta: '{command} is a command of psql, the terminal program, not SQL: it doesn’t work here. Try it in psql.',
  stopped: 'Stopped. The data is back as it was at the start.',
  restored: 'Data reset: the next query starts with the shop as it was at the start.',
  failed: 'PostgreSQL could not be loaded. Check your connection and press “Run” again.',
  wait: 'One moment: I’m still on the previous query. If it doesn’t finish, press “Stop”.',
  announceRows: 'Result: {count} rows.',
  announceError: 'Error: {message}',
  table: 'Result {number}',
};

export const strings: Record<Locale, Strings> = { es, en };
