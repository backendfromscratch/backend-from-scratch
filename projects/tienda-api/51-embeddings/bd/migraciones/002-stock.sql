-- Cuántas unidades quedan de cada producto. La tabla ya tiene filas, y cada una necesita un valor:
-- por eso, tres pasos. El ejecutor (scripts/migrar.ts) aplica la migración entera en una
-- transacción: si un paso falla, no se queda ninguno.

-- #region columna
-- 1. La columna, todavía sin NOT NULL: las filas que ya hay la reciben vacía (NULL). Con NOT NULL
--    y sin valor, PostgreSQL no la añadiría, porque esas filas romperían la regla desde el principio.
ALTER TABLE productos ADD COLUMN stock integer;
-- #endregion columna

-- #region rellenar
-- 2. Un valor para cada fila que ya había: un stock de partida, hasta que Ana cuente el almacén.
UPDATE productos SET stock = 10 WHERE stock IS NULL;
-- #endregion rellenar

-- #region reglas
-- 3. Ahora que ninguna fila está vacía, las reglas: el stock no puede faltar ni ser negativo, y un
--    producto nuevo empieza con 0 si no se dice otra cosa (DEFAULT).
ALTER TABLE productos
  ALTER COLUMN stock SET DEFAULT 0,
  ALTER COLUMN stock SET NOT NULL,
  ADD CONSTRAINT stock_no_negativo CHECK (stock >= 0);
-- #endregion reglas
