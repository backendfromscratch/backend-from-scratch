-- The shop's help pages, in chunks (Phase 11, lesson 6). The assistant looks them up with its
-- search_help tool to answer about shipping, returns, payments or the account with what the shop
-- says, and not with what the model thinks it knows. The pages are Markdown files in the help/
-- folder; npm run help splits them into chunks, one per section, computes each one's vector and
-- saves them here (src/help.ts). It says the same as the SQL drizzle-kit generated
-- (drizzle/0012_help.sql).

-- #region table
-- Each row, one section of a page: the page (page, the file's name without .md, like returns;
-- title, the page's title), the section's heading and its text. With both titles, the chunk makes
-- sense on its own, without the rest of the page.
-- embedding: its vector, like the products' one (migration 014), or NULL if it was loaded with
-- SEMANTIC_SEARCH=no.
-- search: for searching by words when there are no vectors. It's a generated column (GENERATED
-- ALWAYS AS … STORED): PostgreSQL computes it and stores it by itself every time the row is written,
-- from the others, and nobody can write it. to_tsvector('english', …) turns the text into a
-- tsvector: the list of its words, without the ones that say nothing (the, of, and…) and reduced to
-- their stem by the rules of English, so "return" and "returned" end up as the same one.
CREATE TABLE help_chunks (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  page text NOT NULL,
  title text NOT NULL,
  section text NOT NULL,
  text text NOT NULL,
  embedding vector(384),
  search tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || section || ' ' || text)) STORED NOT NULL
);
-- #endregion table

-- #region indexes
-- Two indexes, one for each way of searching. HNSW, like the products' one: the chunks closest to a
-- question by cosine distance (<=>). And GIN (Generalized Inverted Index), the word search's one:
-- for each word, the rows it's in, like the index at the back of a book. With a few rows,
-- PostgreSQL will read the whole table anyway: the indexes are there for when the help grows.
CREATE INDEX help_chunks_by_embedding ON help_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX help_chunks_by_words ON help_chunks USING gin (search);
-- #endregion indexes
