-- La búsqueda por el significado (Fase 11, lección 5). Cada producto tiene ahora una descripción y
-- un vector (un embedding): una lista de 384 números que dice de qué trata, calculada por un modelo
-- a partir de su nombre y su descripción (src/embeddings.ts). Dos productos que tratan de lo mismo
-- tienen vectores cercanos, y «algo para el frío» queda cerca de la bufanda aunque no comparta ni
-- una palabra con ella. Dice lo mismo que el SQL que generó drizzle-kit
-- (drizzle/0011_embeddings.sql), más la primera orden, que drizzle-kit no escribe.

-- #region extension
-- pgvector, la extensión de PostgreSQL para guardar vectores y buscar los más cercanos: trae el tipo
-- vector, los operadores de distancia (<=>, la del coseno) y los índices HNSW. Viene instalada en la
-- imagen pgvector/pgvector (compose.yaml), y esto la activa en esta base de datos. Activarla es
-- cosa de un superusuario: en Compose lo es el usuario tienda (la imagen lo crea así); en tu propio
-- PostgreSQL, actívala tú una vez, como superusuario (el README lo explica). IF NOT EXISTS: si ya
-- está, no hace nada.
CREATE EXTENSION IF NOT EXISTS vector;
-- #endregion extension

-- #region columnas
-- La descripción, en texto libre, y el vector. Las dos admiten NULL y no tienen DEFAULT: PostgreSQL
-- solo apunta que existen, sin tocar las filas que ya hay. vector(384): exactamente 384 números,
-- los que da el modelo; uno con otro número de dimensiones no entra. NULL es «aún sin calcular»:
-- lo calcula el trabajador cuando un producto cambia, o npm run embeddings, para los que ya había.
ALTER TABLE productos ADD COLUMN descripcion text;
ALTER TABLE productos ADD COLUMN embedding vector(384);
-- #endregion columnas

-- #region indice
-- Un índice HNSW (Hierarchical Navigable Small World): un grafo en el que cada vector está unido a
-- unos cuantos de sus vecinos, en varios pisos. Para encontrar los más cercanos a una pregunta, se
-- entra por arriba y se va saltando hacia los que se parecen más, sin mirar toda la tabla. Es
-- aproximado: casi siempre da los más cercanos de verdad, pero no lo garantiza, y a cambio es mucho
-- más rápido con muchas filas. vector_cosine_ops: el índice sirve para ordenar por la distancia del
-- coseno (<=>), la que usa la tienda. Las filas con el vector en NULL no entran en él.
CREATE INDEX productos_por_embedding ON productos USING hnsw (embedding vector_cosine_ops);
-- #endregion indice
