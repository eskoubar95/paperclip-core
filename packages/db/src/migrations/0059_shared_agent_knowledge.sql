CREATE TABLE "agent_run_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"heartbeat_run_id" uuid NOT NULL,
	"issue_id" uuid,
	"project_id" uuid,
	"adapter_type" text NOT NULL,
	"outcome" text NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_heartbeat_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("heartbeat_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_run_summaries" ADD CONSTRAINT "agent_run_summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_run_summaries_heartbeat_run_id_unique" ON "agent_run_summaries" USING btree ("heartbeat_run_id");
--> statement-breakpoint
CREATE INDEX "agent_run_summaries_company_agent_created_idx" ON "agent_run_summaries" USING btree ("company_id","agent_id","created_at");
--> statement-breakpoint
CREATE TABLE "agent_knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"issue_id" uuid,
	"project_id" uuid,
	"source_run_id" uuid,
	"kind" text DEFAULT 'note' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"confidence" text,
	"visibility" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_knowledge_items" ADD CONSTRAINT "agent_knowledge_items_source_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_knowledge_items_company_agent_created_idx" ON "agent_knowledge_items" USING btree ("company_id","agent_id","created_at");
