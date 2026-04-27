import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { companyMcpApi, type McpOauthProviderId, type McpProviderKey } from "../api/company-mcp";
import { queryKeys } from "../lib/queryKeys";
import { useToastActions } from "../context/ToastContext";
import { Button } from "@/components/ui/button";
import { Field } from "./agent-config-primitives";
import { ApiError } from "../api/client";
import { cn } from "../lib/utils";

const PROVIDERS: { id: McpProviderKey; label: string; hint: string }[] = [
  {
    id: "custom_stdio",
    label: "Custom (stdio)",
    hint:
      "Command, args, and optional env in JSON (e.g. npx -y … for remote stdio). Put API keys, PATs, or bearer material in the token field (injected as API_KEY or tokenEnvName). Browser-first npx auth must be completed out of band; then paste the resulting secret here so agents do not need a browser at run time. See doc/MCP-CONNECTORS.md.",
  },
  {
    id: "http_bearer",
    label: "HTTP (Bearer)",
    hint:
      "Set { \"url\": \"https://…\" } in config. The stored token is sent as Authorization: Bearer. Prefer this when the remote MCP documents bearer or OAuth-derived access tokens.",
  },
];

export function CompanyMcpSettings({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [providerKey, setProviderKey] = useState<McpProviderKey>("custom_stdio");
  const [oauthMode, setOauthMode] = useState<"none" | McpOauthProviderId>("none");
  const [token, setToken] = useState("");
  const [configJson, setConfigJson] = useState("{}\n");
  const [newTokenName, setNewTokenName] = useState("Local dev machine");
  const [justCreatedSyncToken, setJustCreatedSyncToken] = useState<string | null>(null);

  const { data: list } = useQuery({
    queryKey: queryKeys.companyMcp.integrations(companyId),
    queryFn: () => companyMcpApi.listIntegrations(companyId).then((r) => r.integrations),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("mcp_oauth");
    if (v === "ok") {
      void queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.integrations(companyId) });
      pushToast({ title: "MCP connected", body: "OAuth completed.", tone: "success" });
      params.delete("mcp_oauth");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    } else if (v === "error") {
      const reason = params.get("reason");
      pushToast({ title: "OAuth failed", body: reason ?? "Unknown error", tone: "error" });
      params.delete("mcp_oauth");
      params.delete("reason");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    }
  }, [companyId, pushToast, queryClient]);

  const { data: syncTokens } = useQuery({
    queryKey: queryKeys.companyMcp.syncTokens(companyId),
    queryFn: () => companyMcpApi.listSyncTokens(companyId).then((r) => r.tokens),
  });

  const createInt = useMutation({
    mutationFn: () => {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(configJson || "{}") as Record<string, unknown>;
      } catch {
        throw new Error("Config must be valid JSON");
      }
      return companyMcpApi.createIntegration(companyId, {
        key: key.trim(),
        displayName: displayName.trim(),
        providerKey,
        token: token.trim() || null,
        config,
        enabled: true,
        oauthProvider: oauthMode === "none" ? null : oauthMode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.integrations(companyId) });
      setKey("");
      setDisplayName("");
      setToken("");
      setOauthMode("none");
      setConfigJson("{}\n");
      pushToast({ title: "MCP added", body: "Integration created.", tone: "success" });
    },
    onError: (e) => {
      pushToast({
        title: "Could not add MCP",
        body: e instanceof Error ? e.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const verifyM = useMutation({
    mutationFn: (id: string) => companyMcpApi.verify(companyId, id),
    onSuccess: (r, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.integrations(companyId) });
      pushToast({
        title: r.ok ? "Connection OK" : "Verification failed",
        body: r.error ?? "OK",
        tone: r.ok ? "success" : "error",
      });
    },
    onError: (e) => {
      pushToast({
        title: "Verify failed",
        body: e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Error",
        tone: "error",
      });
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => companyMcpApi.deleteIntegration(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.integrations(companyId) });
    },
  });

  const createSync = useMutation({
    mutationFn: () => companyMcpApi.createSyncToken(companyId, newTokenName.trim() || "Local sync"),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.syncTokens(companyId) });
      setJustCreatedSyncToken(r.token);
    },
  });

  const revokeSync = useMutation({
    mutationFn: (id: string) => companyMcpApi.revokeSyncToken(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.syncTokens(companyId) });
    },
  });

  const connectOAuth = useMutation({
    mutationFn: (integrationId: string) => companyMcpApi.initiateOAuth(companyId, integrationId),
    onSuccess: (data) => {
      const popup = window.open(data.authUrl, "mcp_oauth", "width=600,height=700");
      if (!popup) {
        pushToast({ title: "Pop-up blocked", body: "Allow pop-ups to complete OAuth.", tone: "error" });
        return;
      }
      const poll = setInterval(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.integrations(companyId) });
      }, 2000);
      setTimeout(() => clearInterval(poll), 60_000);
    },
    onError: (e) => {
      pushToast({
        title: "Could not start OAuth",
        body: e instanceof Error ? e.message : "Error",
        tone: "error",
      });
    },
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const bundleUrl = `${baseUrl}/api/companies/${encodeURIComponent(companyId)}/mcp/cursor-mcp.json`;

  const parsedConfig = (() => {
    try {
      return JSON.parse(configJson || "{}") as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  const hasConfigUrl =
    typeof parsedConfig?.url === "string" && (parsedConfig.url as string).trim().length > 0;
  const canCreate =
    Boolean(key.trim() && displayName.trim()) &&
    (providerKey === "http_bearer"
      ? oauthMode !== "none"
        ? hasConfigUrl
        : token.trim().length > 0
      : true);

  return (
    <div className="space-y-4" data-testid="company-mcp-section">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Cursor MCP
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Connectors: each integration is a command or HTTP URL plus optional secrets (key, PAT, bearer,
        or future OAuth/refresh material) stored encrypted. Finish interactive login{" "}
        <span className="font-medium text-foreground">before</span> unattended agent runs. Use a{" "}
        <span className="font-medium text-foreground">local sync token</span> and{" "}
        <code className="text-xs">Sync-PaperclipMcp.ps1</code> (or curl) to write{" "}
        <code className="text-xs">%USERPROFILE%\.cursor\mcp.json</code> with those secrets so
        Cursor does not need a browser at run time. The web UI does not write that file directly.
      </p>
      <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
        <strong>For hosted OAuth services</strong> (Supabase, Notion, Context7 remote): configure them
        directly in <strong>Cursor Settings → MCP</strong>. Use Paperclip for static credentials you
        want to share company-wide (connection strings, API keys, internal integration tokens). See{" "}
        <code className="text-xs">doc/MCP-CONNECTORS.md</code> for guidance.
      </p>

      <div className="rounded-md border border-border px-4 py-3 space-y-3">
        <div className="text-sm font-medium">Add integration</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Key (slug)">
            <input
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="notion"
            />
          </Field>
          <Field label="Display name">
            <input
              className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Notion workspace"
            />
          </Field>
        </div>
        <Field label="Hosted OAuth (optional)">
          <select
            className="w-full max-w-md rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={oauthMode}
            onChange={(e) => {
              const v = e.target.value as "none" | McpOauthProviderId;
              setOauthMode(v);
              if (v !== "none") {
                setProviderKey("http_bearer");
              }
            }}
          >
            <option value="none">None (static token)</option>
            <option value="notion">Notion (OAuth — set server env for client id/secret)</option>
            <option value="context7">Context7 (OAuth)</option>
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            When set, use provider <span className="font-medium">HTTP (Bearer)</span> with a remote{" "}
            <code className="text-xs">url</code> in config, then use <strong>Connect</strong> on the integration
            to authorize. Static tokens are not required for OAuth.
          </p>
        </Field>
        <Field label="Provider">
          <select
            className="w-full max-w-md rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={providerKey}
            disabled={oauthMode !== "none"}
            onChange={(e) => setProviderKey(e.target.value as McpProviderKey)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            {PROVIDERS.find((p) => p.id === providerKey)?.hint}
          </p>
        </Field>
        <Field
          label={oauthMode === "none" ? "Token (stored encrypted)" : "Token (optional static override)"}
        >
          <input
            type="password"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            placeholder={
              oauthMode === "none"
                ? "API key, PAT, or bearer (after connect / provider docs)"
                : "Leave empty to use OAuth access token at run time"
            }
          />
        </Field>
        <Field label="Extra config (JSON)">
          <textarea
            className="w-full min-h-[88px] font-mono text-xs rounded border border-border bg-background px-2 py-1.5"
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            placeholder='{"url":"https://..."}'
          />
        </Field>
        <Button
          size="sm"
          onClick={() => createInt.mutate()}
          disabled={createInt.isPending || !canCreate}
        >
          {createInt.isPending ? "Adding…" : "Add integration"}
        </Button>
      </div>

      <div className="rounded-md border border-border px-4 py-3 space-y-2">
        <div className="text-sm font-medium">Integrations</div>
        {(list ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(list ?? []).map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-border/60 rounded px-3 py-2"
              >
                <div>
                  <div className="font-medium">
                    {i.displayName}{" "}
                    <span className="text-muted-foreground font-normal">({i.key})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {i.providerKey} · {i.enabled ? "enabled" : "disabled"}{" "}
                    {i.lastVerifiedAt
                      ? `· last check ${new Date(i.lastVerifiedAt).toLocaleString()}`
                      : ""}
                    {i.lastError ? ` · ${i.lastError}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {i.oauthProvider && !i.oauthConnected && (
                    <Button
                      size="sm"
                      onClick={() => connectOAuth.mutate(i.id)}
                      disabled={connectOAuth.isPending}
                    >
                      Connect {i.oauthProvider}
                    </Button>
                  )}
                  {i.oauthProvider && i.oauthConnected && (
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        i.tokenExpiresAt && new Date(i.tokenExpiresAt) > new Date()
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                      )}
                    >
                      {i.tokenExpiresAt && new Date(i.tokenExpiresAt) > new Date()
                        ? "OAuth connected"
                        : "Token refresh pending"}
                    </span>
                  )}
                  <Button size="sm" variant="outline" onClick={() => verifyM.mutate(i.id)} disabled={verifyM.isPending}>
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Remove this integration?")) deleteM.mutate(i.id);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-border px-4 py-3 space-y-2">
        <div className="text-sm font-medium">Local sync token</div>
        <p className="text-xs text-muted-foreground">
          Shown only once. Use with Authorization: Bearer &lt;token&gt; to fetch the bundle. Save it in
          a password manager or your sync script env.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Label">
            <input
              className="w-56 rounded border border-border bg-background px-2 py-1.5 text-sm"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
            />
          </Field>
          <Button size="sm" onClick={() => createSync.mutate()} disabled={createSync.isPending}>
            Create token
          </Button>
        </div>
        {justCreatedSyncToken && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 font-mono text-xs break-all">
            {justCreatedSyncToken}
          </div>
        )}
        <ul className="text-xs space-y-1 text-muted-foreground">
          {(syncTokens ?? []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <span>
                {t.name} · {t.revokedAt ? "revoked" : t.lastUsedAt ? "used" : "unused"}
              </span>
              {!t.revokedAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => {
                    if (window.confirm("Revoke this token?")) revokeSync.mutate(t.id);
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-border px-4 py-3 space-y-2 text-xs text-muted-foreground">
        <div className="text-sm font-medium text-foreground">Bundle URL (GET)</div>
        <p className="font-mono break-all">{bundleUrl}</p>
        <p>
          Returns JSON: <code>{"{ \"mcpServers\": { ... } }"}</code>. Auth: board session, or{" "}
          <code>Authorization: Bearer pcpmcp_…</code> sync token.
        </p>
      </div>
    </div>
  );
}
