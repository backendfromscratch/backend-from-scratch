CREATE TABLE "claves_api" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "claves_api_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"hash" "bytea" NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"usada_en" timestamp with time zone,
	CONSTRAINT "claves_api_hash_unique" UNIQUE("hash")
);
