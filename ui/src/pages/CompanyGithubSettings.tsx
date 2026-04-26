import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github } from "lucide-react";
import { companyGithubApi } from "@/api/company-github";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

export function CompanyGithubSettings() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [patDraft, setPatDraft] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings", href: "/company/settings" },
      { label: "GitHub" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const integrationQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.companyGithub.integration(selectedCompanyId) : ["company-github", "off"],
    queryFn: () => companyGithubApi.getIntegration(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const reposQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.companyGithub.repos(selectedCompanyId) : ["company-github-repos", "off"],
    queryFn: () => companyGithubApi.listRepos(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && integrationQuery.data?.configured === true,
    staleTime: 60_000,
  });

  useEffect(() => {
    const allowed = integrationQuery.data?.allowedRepoFullNames ?? [];
    setSelectedRepos(new Set(allowed.map((s) => s.toLowerCase())));
  }, [integrationQuery.data?.allowedRepoFullNames]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company selected");
      const pat = patDraft.trim();
      return companyGithubApi.putIntegration(selectedCompanyId, {
        ...(pat.length > 0 ? { pat } : {}),
        allowedRepoFullNames: [...selectedRepos],
      });
    },
    onSuccess: async () => {
      setPatDraft("");
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.companyGithub.integration(selectedCompanyId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.companyGithub.repos(selectedCompanyId) });
      }
      pushToast({ title: "GitHub settings saved", tone: "success" });
    },
    onError: (err) => {
      pushToast({
        title: "Could not save GitHub settings",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const repoRows = useMemo(() => {
    const list = reposQuery.data ?? [];
    return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [reposQuery.data]);

  const toggleRepo = (fullName: string, checked: boolean) => {
    const key = fullName.toLowerCase();
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const integration = integrationQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8 px-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md border border-border bg-card p-2">
          <Github className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">GitHub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect a fine-grained personal access token for this company. Paperclip stores it as an encrypted company
            secret and can inject <span className="font-mono text-xs">GH_TOKEN</span> /{" "}
            <span className="font-mono text-xs">GITHUB_TOKEN</span> for agents automatically. Choose which repositories
            are allowed for project workspaces.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Token needs repository access (e.g. Contents: Read) for repos you want to list and clone.{" "}
            <a
              href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token"
              className="underline hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              GitHub docs: fine-grained PATs
            </a>
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="text-sm">
          <span className="font-medium">Status: </span>
          {integrationQuery.isLoading ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : integration?.configured ? (
            <span className="text-green-700 dark:text-green-400">PAT configured</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">Not configured — paste a PAT to enable listing repos</span>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="github-pat" className="text-sm font-medium">
            {integration?.configured ? "Rotate PAT (optional)" : "Personal access token"}
          </label>
          <input
            id="github-pat"
            type="password"
            autoComplete="off"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
            placeholder={integration?.configured ? "Leave blank to keep the current token" : "github_pat_…"}
            value={patDraft}
            onChange={(e) => setPatDraft(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            The token is sent once over HTTPS, encrypted at rest, and never shown again in the UI.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Allowed repositories</span>
            {integration?.configured ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reposQuery.isFetching}
                onClick={() => void reposQuery.refetch()}
              >
                {reposQuery.isFetching ? "Loading…" : "Refresh list"}
              </Button>
            ) : null}
          </div>
          {reposQuery.isError ? (
            <p className="text-xs text-destructive">
              {reposQuery.error instanceof ApiError ? reposQuery.error.message : "Could not load repositories."}
            </p>
          ) : null}
          {!integration?.configured ? (
            <p className="text-xs text-muted-foreground">Save a PAT first to load repositories from GitHub.</p>
          ) : reposQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading repositories…</p>
          ) : repoRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No repositories returned for this token.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border border-border/80 divide-y divide-border/60">
              {repoRows.map((r) => (
                <label
                  key={r.fullName}
                  className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-accent/40"
                >
                  <Checkbox
                    checked={selectedRepos.has(r.fullName.toLowerCase())}
                    onCheckedChange={(v) => toggleRepo(r.fullName, v === true)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{r.fullName}</span>
                    {r.private ? (
                      <span className="ml-2 text-[10px] uppercase text-muted-foreground">private</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            When the allowlist is non-empty, only those GitHub repos can be used as project workspace URLs. Leave all
            unchecked to allow any GitHub URL (not recommended).
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="button"
            disabled={
              saveMutation.isPending ||
              !selectedCompanyId ||
              (!integration?.configured && patDraft.trim().length === 0)
            }
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
