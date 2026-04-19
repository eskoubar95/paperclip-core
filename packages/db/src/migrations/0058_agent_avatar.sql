ALTER TABLE "agents" ADD COLUMN "avatar_asset_id" uuid;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "avatar_access_token" text;
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_avatar_asset_id_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_avatar_access_token_unique" ON "agents" USING btree ("avatar_access_token");
