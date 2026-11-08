ALTER TABLE "users" ALTER COLUMN "google_sub" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verify_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verify_expires_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verify_sent_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_failures" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "users_verify_token_idx" ON "users" USING btree ("verify_token_hash");--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "google_sub" IS NOT NULL;
