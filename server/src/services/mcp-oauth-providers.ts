/**
 * OAuth2 endpoints and env-driven client credentials for Notion and Context7 MCP.
 * Set PAPERCLIP_MCP_OAUTH_NOTION_CLIENT_ID (and _SECRET) / CONTEXT7_* before using Connect in UI.
 *
 * Notion: https://developers.notion.com/docs/authorization
 * Context7: override URLs via env if their OAuth differs from defaults below.
 */
export const MCP_OAUTH_KNOWN = ["notion", "context7"] as const;
export type McpOauthProviderId = (typeof MCP_OAUTH_KNOWN)[number];

export type OAuthEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string;
};

const DEFAULT_NOTION: OAuthEndpoints = {
  authorizationEndpoint: "https://api.notion.com/v1/oauth/authorize",
  tokenEndpoint: "https://api.notion.com/v1/oauth/token",
  scopes: "read_content",
};

const DEFAULT_CONTEXT7: OAuthEndpoints = {
  authorizationEndpoint: process.env.PAPERCLIP_MCP_OAUTH_CONTEXT7_AUTH_URL?.trim() || "https://context7.com/api/oauth/authorize",
  tokenEndpoint: process.env.PAPERCLIP_MCP_OAUTH_CONTEXT7_TOKEN_URL?.trim() || "https://context7.com/api/oauth/token",
  scopes: process.env.PAPERCLIP_MCP_OAUTH_CONTEXT7_SCOPES?.trim() || "read",
};

export function getMcpOauthEndpoints(provider: McpOauthProviderId): OAuthEndpoints {
  if (provider === "notion") {
    return {
      authorizationEndpoint:
        process.env.PAPERCLIP_MCP_OAUTH_NOTION_AUTH_URL?.trim() || DEFAULT_NOTION.authorizationEndpoint,
      tokenEndpoint: process.env.PAPERCLIP_MCP_OAUTH_NOTION_TOKEN_URL?.trim() || DEFAULT_NOTION.tokenEndpoint,
      scopes: process.env.PAPERCLIP_MCP_OAUTH_NOTION_SCOPES?.trim() || DEFAULT_NOTION.scopes,
    };
  }
  return DEFAULT_CONTEXT7;
}

export function getMcpOauthClientCredentials(provider: McpOauthProviderId): { clientId: string; clientSecret: string } | null {
  if (provider === "notion") {
    const clientId = process.env.PAPERCLIP_MCP_OAUTH_NOTION_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.PAPERCLIP_MCP_OAUTH_NOTION_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }
  const clientId = process.env.PAPERCLIP_MCP_OAUTH_CONTEXT7_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.PAPERCLIP_MCP_OAUTH_CONTEXT7_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}
