ALTER TABLE "claves_api" ADD COLUMN "rol" text DEFAULT 'reparto' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "cliente_id" integer;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "rol" text DEFAULT 'cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_por_cliente" ON "pedidos" USING btree ("cliente_id","creado_en" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "claves_api" ADD CONSTRAINT "claves_api_rol_check" CHECK ("claves_api"."rol" IN ('reparto', 'admin'));--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_check" CHECK ("usuarios"."rol" IN ('cliente', 'reparto', 'admin'));