ALTER TABLE "api_keys" ADD COLUMN "role" text DEFAULT 'delivery' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_by_customer" ON "orders" USING btree ("customer_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_role_check" CHECK ("api_keys"."role" IN ('delivery', 'admin'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('customer', 'delivery', 'admin'));