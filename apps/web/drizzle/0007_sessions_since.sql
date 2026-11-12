-- Needed BEFORE the deploy that reads it (session 15), while 0006 waits until AFTER that deploy:
-- so the main database gets this one statement by hand first, and `pnpm db:migrate` later
-- applies 0006 and finds this column already there (IF NOT EXISTS). To undo:
--   ALTER TABLE users DROP COLUMN sessions_since;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessions_since" timestamp (3) with time zone;
