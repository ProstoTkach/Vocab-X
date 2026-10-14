-- ===== перелічувані типи =====
CREATE TYPE card_state_t   AS ENUM ('new','learning','review','relearning');
CREATE TYPE exercise_fmt_t AS ENUM ('REC','PROD','AUD_PART','AUD_FULL','MCQ','CLZ','MAT','LIS');
CREATE TYPE cosmetic_t     AS ENUM ('avatar','hat','background','card_style');
CREATE TYPE word_source_t  AS ENUM ('manual','public_deck','video','import');
CREATE TYPE item_status_t  AS ENUM ('candidate','accepted','suspended');
CREATE TYPE outcome_t      AS ENUM ('promoted','stayed','demoted');

CREATE SEQUENCE sync_seq;
CREATE FUNCTION touch_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); NEW.server_seq := nextval('sync_seq'); RETURN NEW; END $$;

-- ===== 1. довідковий шар =====
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,
  google_sub text UNIQUE,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_auth_chk CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE league_tiers (tier smallint PRIMARY KEY, name text NOT NULL, icon_url text);

CREATE TABLE achievements (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE, title text NOT NULL, description text NOT NULL, icon_url text,
  condition_type text NOT NULL CHECK (condition_type IN ('streak_days','words_mastered','reviews','level','league_tier')),
  condition_value int NOT NULL CHECK (condition_value > 0),
  reward_xp int NOT NULL DEFAULT 0
);

CREATE TABLE cosmetic_items (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE, name text NOT NULL, type cosmetic_t NOT NULL, image_url text NOT NULL,
  unlock_level smallint, unlock_achievement_id smallint REFERENCES achievements(id)
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  selected_avatar_id int REFERENCES cosmetic_items(id),
  selected_card_style_id int REFERENCES cosmetic_items(id),
  league_tier smallint NOT NULL DEFAULT 1 REFERENCES league_tiers(tier),
  native_lang text NOT NULL DEFAULT 'uk', target_lang text NOT NULL DEFAULT 'en',
  timezone text NOT NULL DEFAULT 'UTC',
  daily_goal_xp int NOT NULL DEFAULT 50 CHECK (daily_goal_xp > 0),
  desired_retention real NOT NULL DEFAULT 0.9 CHECK (desired_retention BETWEEN 0.8 AND 0.95),
  audio_enabled boolean NOT NULL DEFAULT true, typing_mode boolean NOT NULL DEFAULT false,
  binary_swipe boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  server_seq bigint NOT NULL DEFAULT nextval('sync_seq')
);
CREATE TABLE user_cosmetics (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, item_id int REFERENCES cosmetic_items(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, item_id));
CREATE TABLE user_achievements (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, achievement_id smallint REFERENCES achievements(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, achievement_id));

CREATE TABLE words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language text NOT NULL, word text NOT NULL, lemma text NOT NULL,
  translation text NOT NULL, example text, image_url text,
  freq_rank int CHECK (freq_rank > 0), cefr_level text CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')), pos text,
  source word_source_t NOT NULL DEFAULT 'manual', video_id text, video_time_s int,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, server_seq bigint NOT NULL DEFAULT nextval('sync_seq')
);
CREATE UNIQUE INDEX words_owner_lemma_uq ON words (owner_id, language, lemma) WHERE deleted_at IS NULL;
CREATE INDEX words_sync_idx ON words (owner_id, server_seq);

CREATE TABLE decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, description text, language text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz, server_seq bigint NOT NULL DEFAULT nextval('sync_seq'));
CREATE TABLE deck_words (
  deck_id uuid REFERENCES decks(id) ON DELETE CASCADE, word_id uuid REFERENCES words(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0, deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(), server_seq bigint NOT NULL DEFAULT nextval('sync_seq'),
  PRIMARY KEY (deck_id, word_id));

CREATE TABLE public_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_deck_id uuid REFERENCES decks(id) ON DELETE SET NULL,
  title text NOT NULL, description text, language text NOT NULL,
  downloads int NOT NULL DEFAULT 0, is_listed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) STORED);
CREATE INDEX public_decks_search_idx ON public_decks USING gin (search);
CREATE TABLE public_deck_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_deck_id uuid NOT NULL REFERENCES public_decks(id) ON DELETE CASCADE,
  position int NOT NULL, word text NOT NULL, translation text NOT NULL, example text, image_url text);

-- ===== 2. навчальне ядро =====
CREATE TABLE card_states (
  word_id uuid PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state card_state_t NOT NULL DEFAULT 'new',
  stability real CHECK (stability > 0), difficulty real CHECK (difficulty BETWEEN 1 AND 10),
  last_review_at timestamptz, due_at timestamptz, previous_interval_days real,
  format_level smallint NOT NULL DEFAULT 1 CHECK (format_level BETWEEN 1 AND 4),
  level_streak smallint NOT NULL DEFAULT 0,
  reps int NOT NULL DEFAULT 0, lapses int NOT NULL DEFAULT 0,
  successful_reviews int NOT NULL DEFAULT 0, failed_reviews int NOT NULL DEFAULT 0,
  status text GENERATED ALWAYS AS (CASE WHEN state = 'new' THEN 'new'
                                        WHEN stability >= 30 THEN 'mastered' ELSE 'learning' END) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(), server_seq bigint NOT NULL DEFAULT nextval('sync_seq'));
CREATE INDEX card_states_due_idx ON card_states (user_id, due_at) WHERE state <> 'new';
CREATE INDEX card_states_sync_idx ON card_states (user_id, server_seq);

CREATE TABLE test_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language text NOT NULL, lemma text NOT NULL, sense text NOT NULL DEFAULT '',
  format exercise_fmt_t NOT NULL CHECK (format IN ('MCQ','CLZ','MAT','LIS')),
  cefr_level text NOT NULL, payload jsonb NOT NULL, quality real CHECK (quality BETWEEN 0 AND 1),
  status item_status_t NOT NULL DEFAULT 'candidate',
  n_responses int NOT NULL DEFAULT 0, n_correct int NOT NULL DEFAULT 0, r_pb real,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (language, lemma, sense, format, cefr_level));

CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text, last_sync_at timestamptz, last_pull_seq bigint NOT NULL DEFAULT 0);

CREATE TABLE review_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  reviewed_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  format exercise_fmt_t NOT NULL, grade smallint NOT NULL CHECK (grade BETWEEN 1 AND 4),
  is_correct boolean GENERATED ALWAYS AS (grade >= 2) STORED,
  response_ms int NOT NULL CHECK (response_ms >= 0),
  test_item_id uuid REFERENCES test_items(id), device_id uuid REFERENCES devices(id),
  predicted_p real, stability_before real, stability_after real, difficulty_after real,
  interval_before_days real, interval_after_days real, format_level_after smallint,
  xp_awarded int NOT NULL DEFAULT 0, reject_reason text);
CREATE INDEX review_events_user_time_idx ON review_events (user_id, reviewed_at);
CREATE INDEX review_events_word_time_idx ON review_events (word_id, reviewed_at);

CREATE TABLE llm_generation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  test_item_id uuid REFERENCES test_items(id) ON DELETE SET NULL,
  lemma text NOT NULL, format exercise_fmt_t NOT NULL, attempt_no smallint NOT NULL,
  passed_hard boolean NOT NULL, failed_checks text[] NOT NULL DEFAULT '{}', quality real,
  model text NOT NULL, tokens_in int, tokens_out int, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE user_model_params (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  params real[] NOT NULL CHECK (array_length(params,1) = 21), format_params jsonb NOT NULL DEFAULT '{}',
  n_events int NOT NULL DEFAULT 0, fitted_at timestamptz, version int NOT NULL DEFAULT 0);
CREATE TABLE user_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  level smallint NOT NULL DEFAULT 1, xp_total bigint NOT NULL DEFAULT 0,
  streak_days int NOT NULL DEFAULT 0, streak_freezes smallint NOT NULL DEFAULT 0 CHECK (streak_freezes BETWEEN 0 AND 2),
  last_goal_date date, words_mastered int NOT NULL DEFAULT 0, total_reviews int NOT NULL DEFAULT 0,
  last_login_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE daily_activity (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, local_date date NOT NULL,
  xp int NOT NULL DEFAULT 0, reviews int NOT NULL DEFAULT 0, goal_met boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, local_date));
CREATE TABLE xp_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid UNIQUE REFERENCES review_events(id) ON DELETE SET NULL,
  amount int NOT NULL, reason text NOT NULL, week_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX xp_ledger_week_idx ON xp_ledger (week_start, user_id);

CREATE TABLE league_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week_start date NOT NULL,
  tier smallint NOT NULL REFERENCES league_tiers(tier));
CREATE TABLE league_members (
  cohort_id uuid REFERENCES league_cohorts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, week_start date NOT NULL,
  weekly_xp int NOT NULL DEFAULT 0, active_days smallint NOT NULL DEFAULT 0, reached_at timestamptz,
  flagged boolean NOT NULL DEFAULT false, final_rank smallint, outcome outcome_t,
  PRIMARY KEY (cohort_id, user_id), UNIQUE (week_start, user_id));
CREATE TABLE anomaly_flags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, week_start date,
  kind text NOT NULL CHECK (kind IN ('robust_z','low_cv','rate','duplicate_burst')),
  score real, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz);

-- ===== 3. відео =====
CREATE TABLE google_links (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, google_sub text NOT NULL,
  refresh_token_enc bytea NOT NULL, scopes text[] NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz);
CREATE TABLE yt_channels (
  channel_id text PRIMARY KEY, uploads_playlist_id text NOT NULL, title text,
  l2_share real CHECK (l2_share BETWEEN 0 AND 1), checked_at timestamptz NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE yt_videos (
  video_id text PRIMARY KEY, channel_id text REFERENCES yt_channels(channel_id) ON DELETE CASCADE,
  title text NOT NULL, description text, language text, duration_s int, category_id text,
  embeddable boolean NOT NULL DEFAULT true, published_at timestamptz,
  fetched_at timestamptz NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE video_recommendations (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, video_id text REFERENCES yt_videos(video_id) ON DELETE CASCADE,
  score real NOT NULL, components jsonb NOT NULL, computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id));
CREATE TABLE user_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, video_id text NOT NULL,
  language text NOT NULL, cues jsonb NOT NULL, lemma_counts jsonb NOT NULL, n_tokens int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, video_id));
CREATE TABLE video_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, video_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(), max_position_s int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false, words_added int NOT NULL DEFAULT 0);

-- ===== 4. безпека =====
CREATE TABLE sessions (
  id_hash bytea PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(), ip inet, user_agent text, revoked_at timestamptz);
CREATE TABLE user_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind text NOT NULL,
  policy_version text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz);
CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL, details jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- ===== тригери синхронізації =====
CREATE TRIGGER t_words BEFORE INSERT OR UPDATE ON words FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER t_decks BEFORE INSERT OR UPDATE ON decks FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER t_deck_words BEFORE INSERT OR UPDATE ON deck_words FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER t_card_states BEFORE INSERT OR UPDATE ON card_states FOR EACH ROW EXECUTE FUNCTION touch_row();
CREATE TRIGGER t_profiles BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_row();
