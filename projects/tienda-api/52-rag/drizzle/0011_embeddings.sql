ALTER TABLE "productos" ADD COLUMN "descripcion" text;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
CREATE INDEX "productos_por_embedding" ON "productos" USING hnsw ("embedding" vector_cosine_ops);