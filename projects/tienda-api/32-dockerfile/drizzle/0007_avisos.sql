CREATE TABLE "avisos" (
	"clave_id" integer PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"secreto" text NOT NULL,
	"cambiado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_clave_id_claves_api_id_fk" FOREIGN KEY ("clave_id") REFERENCES "public"."claves_api"("id") ON DELETE cascade ON UPDATE no action;