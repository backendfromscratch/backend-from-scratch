ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "embedding" vector(384);--> statement-breakpoint
CREATE INDEX "products_by_embedding" ON "products" USING hnsw ("embedding" vector_cosine_ops);