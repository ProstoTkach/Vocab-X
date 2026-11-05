CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "card_progress" (
	"user_id" uuid NOT NULL,
	"word_id" text NOT NULL,
	"lang" text NOT NULL,
	"card" jsonb NOT NULL,
	"due_at" timestamp (3) with time zone NOT NULL,
	"last_event_id" text NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "card_progress_user_id_word_id_pk" PRIMARY KEY("user_id","word_id")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"lang" text NOT NULL,
	"data" jsonb NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "decks_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "review_events" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"word_id" text NOT NULL,
	"at" timestamp (3) with time zone NOT NULL,
	"grade" smallint NOT NULL,
	"format" text NOT NULL,
	"response_ms" integer NOT NULL,
	"was_new" boolean NOT NULL,
	"retention" double precision NOT NULL,
	"xp" integer NOT NULL,
	"kind" text,
	"deleted_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "review_events_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "review_events_grade_chk" CHECK ("review_events"."grade" BETWEEN 1 AND 4),
	CONSTRAINT "review_events_response_chk" CHECK ("review_events"."response_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"profile" jsonb,
	"settings" jsonb,
	"gamification" jsonb,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"google_sub" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "words" (
	"user_id" uuid NOT NULL,
	"id" text NOT NULL,
	"lang" text NOT NULL,
	"term" text NOT NULL,
	"data" jsonb NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"server_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "words_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "card_progress" ADD CONSTRAINT "card_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_events" ADD CONSTRAINT "review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_state" ADD CONSTRAINT "user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "words" ADD CONSTRAINT "words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_progress_sync_idx" ON "card_progress" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "card_progress_due_idx" ON "card_progress" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "decks_sync_idx" ON "decks" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "review_events_sync_idx" ON "review_events" USING btree ("user_id","server_seq");--> statement-breakpoint
CREATE INDEX "review_events_time_idx" ON "review_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "review_events_word_idx" ON "review_events" USING btree ("user_id","word_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email")) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "words_sync_idx" ON "words" USING btree ("user_id","server_seq");