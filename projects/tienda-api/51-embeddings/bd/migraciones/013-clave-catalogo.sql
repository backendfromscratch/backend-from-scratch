-- Un rol más para las claves de API (Fase 11, lección 4): catalogo, la clave de un programa que
-- solo consulta el catálogo, como el agente de un comparador de precios. Por MCP (src/mcp.ts) solo
-- ve las herramientas del catálogo; las de los pedidos, solo reparto y admin. Así cada agente entra
-- con lo justo para su trabajo, como la empresa de reparto en la Fase 6. Dice lo mismo que el SQL
-- que generó drizzle-kit (drizzle/0010_clave-catalogo.sql).

-- #region clave-catalogo
-- Una restricción CHECK no se cambia: se borra y se crea otra, con el mismo nombre (el que le puso
-- PostgreSQL en la migración 009). Las dos órdenes van en la misma migración, y nuestro ejecutor
-- aplica cada una en una transacción: nunca queda la tabla sin la restricción.
ALTER TABLE claves_api DROP CONSTRAINT claves_api_rol_check;
ALTER TABLE claves_api
  ADD CONSTRAINT claves_api_rol_check CHECK (rol IN ('reparto', 'admin', 'catalogo'));
-- #endregion clave-catalogo
