// npm run evals (Fase 11, lección 7): las evals de evals/casos.ts, contra el modelo de verdad. Cada
// vez cuesta dinero: 12 casos, cada uno con dos o tres llamadas al modelo, y el juez. La tabla
// del final dice cuánto, caso a caso.
// Necesita lo que necesita la tienda: su configuración (.env, con tu ANTHROPIC_API_KEY) y su base
// de datos con los datos de práctica y la ayuda cargada. Con Docker Compose, dentro del contenedor
// de la API, que ya tiene las dos cosas (la base de datos de Compose no se ve desde fuera):
//   docker compose exec api npm run evals
// Sin Docker, con la tienda configurada en tu ordenador: npm run evals.

// #region sin-clave
// Antes de importar nada de la tienda: sin clave no hay nada que hacer, y conviene decir por qué
// en lugar de dejar que falle cada caso con un 401.
if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error(
    'npm run evals pregunta al modelo de verdad, y eso cuesta dinero (unos céntimos cada vez): ' +
      'pon tu ANTHROPIC_API_KEY en .env. No se ha llamado a nada.',
  );
  process.exit(1);
}
// #endregion sin-clave

// Sin las líneas del log de la tienda (cada herramienta escribe una): solo los avisos y la tabla.
process.env.LOG_LEVEL = 'warn';
const { cliente } = await import('../src/asistente/cliente.ts');
const { pool } = await import('../src/bd.ts');
const { casos } = await import('./casos.ts');
const { evaluar, tabla } = await import('./evaluar.ts');

// #region carmen
// Las herramientas trabajan para un cliente: Carmen, la de los datos de práctica, buscada por su
// email (su id depende de las cuentas que hubiera antes). Y la ayuda tiene que estar cargada.
const { rows } = await pool.query<{ id: number }>(
  `SELECT id FROM usuarios WHERE lower(email) = 'carmen@ejemplo.com'`,
);
const [{ n: fragmentos }] = (
  await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM fragmentos_ayuda')
).rows as [{ n: number }];
if (rows.length === 0 || fragmentos === 0) {
  console.error(
    rows.length === 0
      ? 'No está la cuenta de Carmen: carga los datos de práctica (npm run bd:datos).'
      : 'La ayuda no está cargada: npm run ayuda (con Docker Compose, la carga el trabajador al arrancar).',
  );
  await pool.end();
  process.exit(1);
}
// #endregion carmen

const resultados = await evaluar(casos, { cliente: cliente!, quien: { clienteId: rows[0]!.id } });
console.log(tabla(resultados));
await pool.end();
// Con algún caso que no pasa, termina con un error (1): un script que lo use lo nota. process.exit,
// y no esperar a que acabe solo: la conexión de la caché (CACHE_URL, en Compose) lo tendría abierto.
process.exit(resultados.every((resultado) => resultado.aprobado) ? 0 : 1);
