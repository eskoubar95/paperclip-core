-- OAuth and token cache for hosted MCP (Notion, Context7)
ALTER TABLE "company_mcp_integrations" ADD COLUMN IF NOT EXISTS "oauth_provider" text;
ALTER TABLE "company_mcp_integrations" ADD COLUMN IF NOT EXISTS "oauth_state" text;
ALTER TABLE "company_mcp_integrations" ADD COLUMN IF NOT EXISTS "refresh_token_secret_id" uuid;
ALTER TABLE "company_mcp_integrations" ADD COLUMN IF NOT EXISTS "access_token_cache" text;
ALTER TABLE "company_mcp_integrations" ADD COLUMN IF NOT EXISTS "token_expires_at" timestamptz;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "company_mcp_integrations" ADD CONSTRAINT "company_mcp_integrations_refresh_token_secret_id_fk" FOREIGN KEY ("refresh_token_secret_id") REFERENCES "public"."company_secrets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_mcp_integrations_token_expires_idx" ON "company_mcp_integrations" ("token_expires_at") WHERE "refresh_token_secret_id" IS NOT NULL;
--> statement-breakpoint
