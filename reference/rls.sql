ALTER TABLE words ENABLE ROW LEVEL SECURITY;
CREATE POLICY words_owner ON words
  USING      (owner_id = current_setting('app.user_id', true)::uuid)
  WITH CHECK (owner_id = current_setting('app.user_id', true)::uuid);
-- у кожній транзакції API: SELECT set_config('app.user_id', $1, true);
