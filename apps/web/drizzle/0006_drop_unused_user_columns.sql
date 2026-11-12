-- Apply only after the deploy that stops reading these columns is live (DATA_MAP 3.1).
-- Nothing reads or writes them since step 2.1a / session 8. To undo:
--   ALTER TABLE users ADD COLUMN login_failures smallint NOT NULL DEFAULT 0;
--   ALTER TABLE users ADD COLUMN locked_until timestamp(3) with time zone;
--   ALTER TABLE users ADD COLUMN deleted_at timestamp(3) with time zone;
DROP INDEX "users_email_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "login_failures";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "locked_until";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "deleted_at";