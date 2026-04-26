CREATE TABLE "company_github_integrations" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'github_pat' NOT NULL,
	"pat_secret_id" uuid,
	"allowed_repo_full_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_github_integrations" ADD CONSTRAINT "company_github_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_github_integrations" ADD CONSTRAINT "company_github_integrations_pat_secret_id_company_secrets_id_fk" FOREIGN KEY ("pat_secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_github_integrations_pat_secret_uq" ON "company_github_integrations" USING btree ("pat_secret_id");
