CREATE TABLE "sesiones" (
	"id_hash" "bytea" PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_en" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;