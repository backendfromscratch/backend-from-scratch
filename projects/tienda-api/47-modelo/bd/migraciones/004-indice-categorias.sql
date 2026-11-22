-- Un índice para buscar en productos_categorias por categoría: el filtro GET /v2/productos?categoria=.
-- Este SQL no está escrito a mano: lo generó drizzle-kit al comparar src/esquema.ts con su foto
-- anterior (npm run bd:generar -- --name=indice-categorias, en drizzle/0001_indice-categorias.sql).
-- drizzle-kit solo lo genera; lo aplica nuestro ejecutor, como las demás: npm run bd:migrar

-- #region indice
CREATE INDEX "productos_categorias_por_categoria" ON "productos_categorias" USING btree ("categoria_id");
-- #endregion indice
