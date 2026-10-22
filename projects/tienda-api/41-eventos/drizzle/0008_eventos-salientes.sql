CREATE TABLE "eventos_salientes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "eventos_salientes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tipo" text NOT NULL,
	"datos" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"enviado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "eventos_salientes_sin_enviar" ON "eventos_salientes" USING btree ("creado_en") WHERE "eventos_salientes"."enviado_en" IS NULL;