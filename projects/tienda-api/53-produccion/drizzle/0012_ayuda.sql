CREATE TABLE "fragmentos_ayuda" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fragmentos_ayuda_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pagina" text NOT NULL,
	"titulo" text NOT NULL,
	"seccion" text NOT NULL,
	"texto" text NOT NULL,
	"embedding" vector(384),
	"busqueda" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', titulo || ' ' || seccion || ' ' || texto)) STORED NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fragmentos_ayuda_por_embedding" ON "fragmentos_ayuda" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "fragmentos_ayuda_por_palabras" ON "fragmentos_ayuda" USING gin ("busqueda");