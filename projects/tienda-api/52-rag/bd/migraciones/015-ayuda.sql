-- Las páginas de ayuda de la tienda, en trozos (Fase 11, lección 6). El asistente las consulta con su
-- herramienta buscar_en_ayuda para contestar sobre envíos, devoluciones, pagos o la cuenta con lo
-- que dice la tienda, y no con lo que el modelo crea saber. Las páginas son ficheros Markdown de la
-- carpeta ayuda/; npm run ayuda las parte en trozos, uno por sección, calcula el vector de cada uno
-- y los guarda aquí (src/ayuda.ts). Dice lo mismo que el SQL que generó drizzle-kit
-- (drizzle/0012_ayuda.sql).

-- #region tabla
-- Cada fila, una sección de una página: la página (pagina, el nombre del fichero sin .md, como
-- devoluciones; titulo, el título de la página), el título de la sección y su texto. Con los dos
-- títulos, el trozo se entiende solo, sin el resto de la página.
-- embedding: su vector, como el de los productos (migración 014), o NULL si se cargó con
-- BUSQUEDA_SEMANTICA=no.
-- busqueda: para buscar por palabras cuando no hay vectores. Es una columna generada (GENERATED
-- ALWAYS AS … STORED): PostgreSQL la calcula y la guarda él solo cada vez que se escribe la fila, a
-- partir de las otras, y nadie puede escribirla. to_tsvector('spanish', …) convierte el texto en un
-- tsvector: la lista de sus palabras, sin las que no dicen nada (el, de, que…) y reducidas a su raíz
-- según las reglas del español, así que «devolver» y «devuelvo» quedan en la misma.
CREATE TABLE fragmentos_ayuda (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  pagina text NOT NULL,
  titulo text NOT NULL,
  seccion text NOT NULL,
  texto text NOT NULL,
  embedding vector(384),
  busqueda tsvector GENERATED ALWAYS AS (to_tsvector('spanish', titulo || ' ' || seccion || ' ' || texto)) STORED NOT NULL
);
-- #endregion tabla

-- #region indices
-- Dos índices, uno por cada forma de buscar. HNSW, como el de los productos: los trozos más cercanos
-- a una pregunta por la distancia del coseno (<=>). Y GIN (Generalized Inverted Index), el de la
-- búsqueda por palabras: para cada palabra, las filas en las que está, como el índice del final de
-- un libro. Con unas pocas filas, PostgreSQL leerá la tabla entera de todas formas: los índices
-- están para cuando la ayuda crezca.
CREATE INDEX fragmentos_ayuda_por_embedding ON fragmentos_ayuda USING hnsw (embedding vector_cosine_ops);
CREATE INDEX fragmentos_ayuda_por_palabras ON fragmentos_ayuda USING gin (busqueda);
-- #endregion indices
