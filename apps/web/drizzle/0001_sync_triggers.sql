-- Every write to a synced row takes the next sync number, so devices can ask what changed.
CREATE FUNCTION touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.server_seq := nextval('sync_seq');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER t_user_state BEFORE UPDATE ON user_state FOR EACH ROW EXECUTE FUNCTION touch_row();
--> statement-breakpoint
CREATE TRIGGER t_words BEFORE UPDATE ON words FOR EACH ROW EXECUTE FUNCTION touch_row();
--> statement-breakpoint
CREATE TRIGGER t_decks BEFORE UPDATE ON decks FOR EACH ROW EXECUTE FUNCTION touch_row();
--> statement-breakpoint
CREATE TRIGGER t_card_progress BEFORE UPDATE ON card_progress FOR EACH ROW EXECUTE FUNCTION touch_row();
--> statement-breakpoint
CREATE TRIGGER t_review_events BEFORE UPDATE ON review_events FOR EACH ROW EXECUTE FUNCTION touch_row();
