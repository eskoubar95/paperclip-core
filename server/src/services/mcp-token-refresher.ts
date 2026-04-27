import type { Db } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { mcpOAuthService } from "./mcp-oauth.js";
import { secretService } from "./secrets.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Periodically refreshes OAuth access tokens for company MCP integrations before they expire.
 */
export function startMcpTokenRefresher(db: Db, intervalMs = DEFAULT_INTERVAL_MS): () => void {
  const secretsSvc = secretService(db);
  const oauth = mcpOAuthService(db, secretsSvc);

  const tick = async () => {
    try {
      const rows = await oauth.listIntegrationsNeedingRefresh();
      for (const row of rows) {
        const result = await oauth.refreshAccessToken(row.companyId, row.id);
        if (!result.ok) {
          logger.warn(
            { companyId: row.companyId, integrationId: row.id, error: result.error },
            "MCP OAuth refresh failed",
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "MCP OAuth token refresh tick failed");
    }
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);
  return () => clearInterval(handle);
}
