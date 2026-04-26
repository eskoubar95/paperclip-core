CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text,
	"reporting_hint" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notification_policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"principal_type" text NOT NULL,
	"principal_id" text NOT NULL,
	"team_role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"default_team_id" uuid,
	"default_workstream_role" text,
	"default_status" text,
	"default_priority" text,
	"body_template" text,
	"sub_issue_blueprints" jsonb,
	"default_label_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_issue_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"event_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "teams_company_idx" ON "teams" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_company_slug_uq" ON "teams" USING btree ("company_id","slug");
--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_team_principal_uq" ON "team_memberships" USING btree ("team_id","principal_type","principal_id");
--> statement-breakpoint
CREATE INDEX "team_memberships_team_role_idx" ON "team_memberships" USING btree ("team_id","team_role");
--> statement-breakpoint
CREATE INDEX "team_memberships_company_idx" ON "team_memberships" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_default_team_id_teams_id_fk" FOREIGN KEY ("default_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "issue_templates_company_idx" ON "issue_templates" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "company_issue_webhooks" ADD CONSTRAINT "company_issue_webhooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "company_issue_webhooks_company_idx" ON "company_issue_webhooks" USING btree ("company_id");
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "team_id" uuid;
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "workstream_role" text;
--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "issues_company_team_status_idx" ON "issues" USING btree ("company_id","team_id","status");
--> statement-breakpoint
CREATE INDEX "issues_company_workstream_status_idx" ON "issues" USING btree ("company_id","workstream_role","status");
