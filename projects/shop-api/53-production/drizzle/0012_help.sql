CREATE TABLE "help_chunks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "help_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"page" text NOT NULL,
	"title" text NOT NULL,
	"section" text NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(384),
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || section || ' ' || text)) STORED NOT NULL
);
--> statement-breakpoint
CREATE INDEX "help_chunks_by_embedding" ON "help_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "help_chunks_by_words" ON "help_chunks" USING gin ("search");