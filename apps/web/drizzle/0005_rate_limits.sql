CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"translations" jsonb NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limits_reset_idx" ON "rate_limits" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "translation_cache_created_idx" ON "translation_cache" USING btree ("created_at");