ALTER TABLE "usuarios" ADD COLUMN "sub_proveedor" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sub_proveedor_unique" UNIQUE("sub_proveedor");