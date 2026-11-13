CREATE TABLE "device_days" (
	"anon_id" text NOT NULL,
	"day_n" smallint NOT NULL,
	"day" date NOT NULL,
	"sessions" integer NOT NULL,
	"answers" integer NOT NULL,
	"active_s" integer NOT NULL,
	CONSTRAINT "device_days_anon_id_day_n_pk" PRIMARY KEY("anon_id","day_n")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"anon_id" text PRIMARY KEY NOT NULL,
	"first_visit_at" timestamp with time zone NOT NULL,
	"cohort_day" date,
	"internal" boolean NOT NULL,
	"ui_lang" text NOT NULL,
	"device" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"welcome" boolean DEFAULT false NOT NULL,
	"languages" boolean DEFAULT false NOT NULL,
	"goal" boolean DEFAULT false NOT NULL,
	"start" boolean DEFAULT false NOT NULL,
	"start_choice" boolean DEFAULT false NOT NULL,
	"onboarding_done" boolean DEFAULT false NOT NULL,
	"review_start" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_days" (
	"day" date NOT NULL,
	"type" text NOT NULL,
	"detail" text NOT NULL,
	"internal" boolean NOT NULL,
	"events" integer NOT NULL,
	"devices" integer NOT NULL,
	CONSTRAINT "event_days_day_type_detail_internal_pk" PRIMARY KEY("day","type","detail","internal")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"anon_id" text NOT NULL,
	"session_id" text NOT NULL,
	"internal" boolean NOT NULL,
	"host" text NOT NULL,
	"ui_lang" text NOT NULL,
	"device" text NOT NULL,
	"days_since_first_visit" smallint NOT NULL,
	"game_mode" text NOT NULL,
	"study_mode" text NOT NULL,
	"params" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"anon_id" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"active" boolean NOT NULL,
	"locale" text NOT NULL,
	"next_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"anon_id" text NOT NULL,
	"internal" boolean NOT NULL,
	"host" text NOT NULL,
	"device" text NOT NULL,
	"ui_lang" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"end_reason" text NOT NULL,
	"final" boolean NOT NULL,
	"days_since_first_visit" smallint NOT NULL,
	"session_n" integer NOT NULL,
	"active_time_s" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"screens_n" integer NOT NULL,
	"answers_n" integer NOT NULL,
	"correct_n" integer NOT NULL,
	"scheduled_n" integer NOT NULL,
	"scheduled_good_n" integer NOT NULL,
	"finished_stack" boolean NOT NULL,
	"goal_reached" boolean NOT NULL,
	"xp" integer NOT NULL,
	"settings_changes_n" integer NOT NULL,
	"game_mode_start" text NOT NULL,
	"game_mode_end" text NOT NULL,
	"study_mode_start" text NOT NULL,
	"study_mode_end" text NOT NULL,
	"return_after_pause" boolean NOT NULL,
	"pause_days" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "devices_cohort_day" ON "devices" USING btree ("cohort_day");--> statement-breakpoint
CREATE INDEX "events_ts_brin" ON "events" USING brin ("ts");--> statement-breakpoint
CREATE INDEX "feedback_received_at" ON "feedback" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_once" ON "feedback" USING btree ("received_at","kind","anon_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_next_at" ON "push_subscriptions" USING btree ("next_at") WHERE "push_subscriptions"."active";--> statement-breakpoint
CREATE INDEX "sessions_anon_id" ON "sessions" USING btree ("anon_id");--> statement-breakpoint
CREATE INDEX "sessions_started_at" ON "sessions" USING btree ("started_at");