import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { companyMcpApi } from "../api/company-mcp";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { useToastActions } from "../context/ToastContext";

type Perm = "read" | "write" | "full";

export function AgentMcpBindings({ companyId, agentId }: { companyId: string; agentId: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const { data: integrations } = useQuery({
    queryKey: queryKeys.companyMcp.integrations(companyId),
    queryFn: () => companyMcpApi.listIntegrations(companyId).then((r) => r.integrations),
  });

  const { data: bindingRows } = useQuery({
    queryKey: queryKeys.companyMcp.agentBindings(companyId, agentId),
    queryFn: () => companyMcpApi.getAgentBindings(companyId, agentId).then((r) => r.bindings),
  });

  const byMcp = useMemo(() => {
    const m = new Map<string, Perm>();
    for (const b of bindingRows ?? []) {
      m.set(b.mcpIntegrationId, b.permission as Perm);
    }
    return m;
  }, [bindingRows]);

  const [local, setLocal] = useState<Record<string, Perm | "">>({});

  useEffect(() => {
    if (!integrations) return;
    const next: Record<string, Perm | ""> = {};
    for (const i of integrations) {
      next[i.id] = byMcp.get(i.id) ?? "";
    }
    setLocal(next);
  }, [integrations, byMcp]);

  const save = useMutation({
    mutationFn: () => {
      const bindings: Array<{ mcpIntegrationId: string; permission: Perm }> = [];
      for (const [mcpId, p] of Object.entries(local)) {
        if (p === "read" || p === "write" || p === "full") {
          bindings.push({ mcpIntegrationId: mcpId, permission: p });
        }
      }
      return companyMcpApi.setAgentBindings(companyId, agentId, bindings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyMcp.agentBindings(companyId, agentId) });
      pushToast({ title: "Saved", body: "MCP bindings updated.", tone: "success" });
    },
    onError: (e) => {
      pushToast({
        title: "Save failed",
        body: e instanceof Error ? e.message : "Error",
        tone: "error",
      });
    },
  });

  if (!integrations?.length) {
    return (
      <div>
        <h3 className="text-sm font-medium mb-2">MCP access</h3>
        <p className="text-sm text-muted-foreground">
          Add MCP integrations in{" "}
          <a href="/company/settings" className="underline">
            Company → Settings
          </a>{" "}
          first.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">MCP access</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Policy for this agent (Option A: UI and audit; local Cursor may still have other MCPs on disk).
      </p>
      <div className="space-y-2 text-sm">
        {integrations.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-2">
            <span className="w-40 truncate font-medium">{i.displayName}</span>
            <select
              className="rounded border border-border bg-background px-2 py-1 text-xs"
              value={local[i.id] ?? ""}
              onChange={(e) =>
                setLocal((prev) => ({
                  ...prev,
                  [i.id]: (e.target.value || "") as Perm | "",
                }))
              }
            >
              <option value="">— none —</option>
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="full">Full</option>
            </select>
          </div>
        ))}
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save MCP bindings"}
        </Button>
      </div>
    </div>
  );
}
