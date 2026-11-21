-- Search by meaning (Phase 11, lesson 5). Each product now has a description and a vector (an
-- embedding): a list of 384 numbers that says what it's about, computed by a model from its name and
-- its description (src/embeddings.ts). Two products about the same thing have nearby vectors, and
-- "something for the cold" lands near the scarf even though it shares no word with it. It says the
-- same as the SQL drizzle-kit generated (drizzle/0011_embeddings.sql), plus the first statement,
-- which drizzle-kit doesn't write.

-- #region extension
-- pgvector, the PostgreSQL extension to store vectors and find the nearest ones: it brings the
-- vector type, the distance operators (<=>, the cosine one) and HNSW indexes. It comes installed in
-- the pgvector/pgvector image (compose.yaml), and this turns it on in this database. Turning it on
-- is a superuser's job: in Compose the shop user is one (the image creates it that way); in your
-- own PostgreSQL, turn it on yourself once, as a superuser (the README explains how). IF NOT
-- EXISTS: if it's already there, it does nothing.
CREATE EXTENSION IF NOT EXISTS vector;
-- #endregion extension

-- #region columns
-- The description, in free text, and the vector. Both accept NULL and have no DEFAULT: PostgreSQL
-- only notes that they exist, without touching the rows already there. vector(384): exactly 384
-- numbers, the ones the model gives; one with another number of dimensions doesn't fit. NULL means
-- "not computed yet": the worker computes it when a product changes, or npm run embeddings, for the
-- ones that were already there.
ALTER TABLE products ADD COLUMN description text;
ALTER TABLE products ADD COLUMN embedding vector(384);
-- #endregion columns

-- #region index
-- An HNSW index (Hierarchical Navigable Small World): a graph in which each vector is linked to a
-- few of its neighbours, on several floors. To find the nearest ones to a question, it goes in at
-- the top and keeps jumping towards the ones that look more alike, without looking at the whole
-- table. It's approximate: it almost always gives the true nearest ones, but doesn't promise it, and
-- in exchange it's much faster with many rows. vector_cosine_ops: the index can sort by the cosine
-- distance (<=>), the one the shop uses. Rows whose vector is NULL aren't in it.
CREATE INDEX products_by_embedding ON products USING hnsw (embedding vector_cosine_ops);
-- #endregion index
