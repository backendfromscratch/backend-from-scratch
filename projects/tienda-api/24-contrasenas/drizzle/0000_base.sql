CREATE TABLE "categorias" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categorias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	CONSTRAINT "categorias_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "claves_idempotencia" (
	"clave" text PRIMARY KEY NOT NULL,
	"cuerpo_peticion" text NOT NULL,
	"estado" integer NOT NULL,
	"cuerpo" text NOT NULL,
	"location" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_procesados" (
	"id" text PRIMARY KEY NOT NULL,
	"procesado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pedidos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"producto_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"estado" text NOT NULL,
	"creado_en" timestamp with time zone NOT NULL,
	CONSTRAINT "pedidos_cantidad_check" CHECK ("pedidos"."cantidad" > 0),
	CONSTRAINT "pedidos_estado_check" CHECK ("pedidos"."estado" IN ('pendiente', 'pagado', 'enviado', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "productos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"precio_centimos" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "productos_precio_centimos_check" CHECK ("productos"."precio_centimos" > 0),
	CONSTRAINT "stock_no_negativo" CHECK ("productos"."stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "productos_categorias" (
	"producto_id" integer NOT NULL,
	"categoria_id" integer NOT NULL,
	CONSTRAINT "productos_categorias_producto_id_categoria_id_pk" PRIMARY KEY("producto_id","categoria_id")
);
--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_categorias" ADD CONSTRAINT "productos_categorias_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos_categorias" ADD CONSTRAINT "productos_categorias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_por_fecha" ON "pedidos" USING btree ("creado_en" DESC NULLS LAST,"id" DESC NULLS LAST);