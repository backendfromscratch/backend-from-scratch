ALTER TABLE "users" ADD COLUMN "provider_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_provider_sub_unique" UNIQUE("provider_sub");