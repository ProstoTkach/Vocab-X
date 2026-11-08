CREATE TABLE "league_members" (
	"week" date NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"tier" smallint NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"xp_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_members_week_user_id_pk" PRIMARY KEY("week","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"look" jsonb NOT NULL,
	"frame" jsonb NOT NULL,
	"tier" smallint DEFAULT 0 NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_result" jsonb
);
--> statement-breakpoint
ALTER TABLE "review_events" ADD COLUMN "credited_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_profiles" ADD CONSTRAINT "league_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_members_group_idx" ON "league_members" USING btree ("week","group_id");--> statement-breakpoint
CREATE INDEX "league_members_tier_idx" ON "league_members" USING btree ("week","tier");--> statement-breakpoint
CREATE INDEX "league_members_user_idx" ON "league_members" USING btree ("user_id","week");