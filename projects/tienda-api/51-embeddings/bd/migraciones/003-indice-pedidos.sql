-- Un índice para la lista de pedidos, tal y como la lee la API: del más nuevo al más antiguo
-- (creado_en DESC) y, entre dos de la misma fecha, el de id mayor primero (id DESC). Es el orden de
-- las páginas (src/paginacion.ts): con él, PostgreSQL va directo al cursor y lee solo los pedidos
-- de la página, sin recorrer la tabla entera.

-- #region indice
CREATE INDEX pedidos_por_fecha ON pedidos (creado_en DESC, id DESC);
-- #endregion indice

-- Lo que cuesta: cada INSERT y cada DELETE en pedidos, y cada UPDATE de estas dos columnas, tiene
-- que cambiar también el índice; y el índice ocupa espacio en disco. Por eso no se pone un índice
-- en cada columna, solo para las consultas que lo necesitan.
--
-- En una tabla grande en producción se usaría CREATE INDEX CONCURRENTLY: tarda más, pero no
-- bloquea las escrituras mientras se crea. No puede ir dentro de una transacción, y este ejecutor
-- mete cada migración en una.
