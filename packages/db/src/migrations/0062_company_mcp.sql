CREATE TABLE "company_mcp_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"provider_key" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"token_secret_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_bindings" (
	"agent_id" uuid NOT NULL,
	"mcp_integration_id" uuid NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("agent_id","mcp_integration_id")
);
--> statement-breakpoint
CREATE TABLE "company_mcp_sync_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "company_mcp_integrations" ADD CONSTRAINT "company_mcp_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_mcp_integrations" ADD CONSTRAINT "company_mcp_integrations_token_secret_id_company_secrets_id_fk" FOREIGN KEY ("token_secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_mcp_bindings" ADD CONSTRAINT "agent_mcp_bindings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_mcp_bindings" ADD CONSTRAINT "agent_mcp_bindings_mcp_integration_id_company_mcp_integrations_id_fk" FOREIGN KEY ("mcp_integration_id") REFERENCES "public"."company_mcp_integrations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_mcp_sync_tokens" ADD CONSTRAINT "company_mcp_sync_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "company_mcp_integrations_company_key_uq" ON "company_mcp_integrations" USING btree ("company_id","key");
--> statement-breakpoint
CREATE INDEX "company_mcp_integrations_company_id_idx" ON "company_mcp_integrations" USING btree ("company_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "company_mcp_sync_tokens_token_hash_uq" ON "company_mcp_sync_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "company_mcp_sync_tokens_company_id_idx" ON "company_mcp_sync_tokens" USING btree ("company_id");
--> statement-breakpoint
