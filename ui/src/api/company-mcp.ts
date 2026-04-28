import { api } from "./client";

export type McpProviderKey = "http_bearer" | "custom_stdio";

export type CompanyMcpIntegration = {
  id: string;
  key: string;
  displayName: string;
  providerKey: string;
  config: Record<string, unknown>;
  hasToken: boolean;
  enabled: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type McpSyncToken = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export type AgentMcpBinding = {
  agentId: string;
  mcpIntegrationId: string;
  permission: string;
  createdAt: string;
};

const enc = encodeURIComponent;

export const companyMcpApi = {
  listIntegrations: (companyId: string) =>
    api.get<{ integrations: CompanyMcpIntegration[] }>(`/companies/${enc(companyId)}/mcp/integrations`),

  createIntegration: (
    companyId: string,
    body: {
      key: string;
      displayName: string;
      providerKey: McpProviderKey;
      config?: Record<string, unknown>;
      token?: string | null;
      enabled?: boolean;
    },
  ) => api.post<{ integration: CompanyMcpIntegration }>(`/companies/${enc(companyId)}/mcp/integrations`, body),

  updateIntegration: (
    companyId: string,
    id: string,
    body: {
      displayName?: string;
      config?: Record<string, unknown>;
      token?: string | null;
      enabled?: boolean;
    },
  ) =>
    api.patch<{ integration: CompanyMcpIntegration }>(
      `/companies/${enc(companyId)}/mcp/integrations/${enc(id)}`,
      body,
    ),

  deleteIntegration: (companyId: string, id: string) =>
    api.delete<{ ok: true }>(`/companies/${enc(companyId)}/mcp/integrations/${enc(id)}`),

  verify: (companyId: string, id: string) =>
    api.post<{ ok: boolean; error: string | null; lastVerifiedAt: string }>(
      `/companies/${enc(companyId)}/mcp/integrations/${enc(id)}/verify`,
      {},
    ),

  listSyncTokens: (companyId: string) =>
    api.get<{ tokens: McpSyncToken[] }>(`/companies/${enc(companyId)}/mcp/sync-tokens`),

  createSyncToken: (companyId: string, name: string) =>
    api.post<{ id: string; name: string; token: string; createdAt: string }>(
      `/companies/${enc(companyId)}/mcp/sync-tokens`,
      { name },
    ),

  revokeSyncToken: (companyId: string, id: string) =>
    api.delete<{ ok: true }>(`/companies/${enc(companyId)}/mcp/sync-tokens/${enc(id)}`),

  getAgentBindings: (companyId: string, agentId: string) =>
    api.get<{ bindings: AgentMcpBinding[] }>(
      `/companies/${enc(companyId)}/agents/${enc(agentId)}/mcp-bindings`,
    ),

  setAgentBindings: (
    companyId: string,
    agentId: string,
    bindings: Array<{ mcpIntegrationId: string; permission: "read" | "write" | "full" }>,
  ) =>
    api.put<{ ok: true }>(`/companies/${enc(companyId)}/agents/${enc(agentId)}/mcp-bindings`, { bindings }),
};
