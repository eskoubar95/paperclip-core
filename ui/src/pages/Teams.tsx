import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hexagon, Plus, Trash2 } from "lucide-react";
import { agentsApi } from "@/api/agents";
import { teamsApi } from "@/api/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { TEAM_MEMBERSHIP_ROLES, ISSUE_WORKSTREAM_ROLES } from "@paperclipai/shared";
import type { Agent, Team } from "@paperclipai/shared";
import { issueFilterLabel } from "@/lib/issue-filters";

const ROLE_OPTIONS = [...TEAM_MEMBERSHIP_ROLES];

const WEBHOOK_EVENTS = ["issue.created", "issue.updated"] as const;

export function Teams() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({
    principalType: "agent" as "user" | "agent",
    principalId: "",
    teamRole: "backend" as string,
  });
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplBody, setTplBody] = useState("");
  const [tplTeamId, setTplTeamId] = useState("");
  const [tplWorkstream, setTplWorkstream] = useState("");
  const [kickTitle, setKickTitle] = useState("");
  const [kickTeamIds, setKickTeamIds] = useState<string[]>([]);
  const [kickTemplateId, setKickTemplateId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["issue.created", "issue.updated"]);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings", href: "/company/settings" },
      { label: "Teams" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const teamsQuery = useQuery({
    queryKey: selectedCompanyId
      ? [...queryKeys.teams.list(selectedCompanyId), includeArchived ? "with-archived" : "active-only"]
      : ["teams", "off"],
    queryFn: () => teamsApi.list(selectedCompanyId!, includeArchived),
    enabled: !!selectedCompanyId,
  });

  const agentsQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "off"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentsById = useMemo(() => {
    const map = new Map<string, Pick<Agent, "name" | "title">>();
    for (const a of agentsQuery.data ?? []) {
      map.set(a.id, { name: a.name, title: a.title });
    }
    return map;
  }, [agentsQuery.data]);

  const templatesQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.teams.issueTemplates(selectedCompanyId) : ["issue-templates", "off"],
    queryFn: () => teamsApi.listIssueTemplates(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const webhooksQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.teams.webhooks(selectedCompanyId) : ["issue-webhooks", "off"],
    queryFn: () => teamsApi.listWebhooks(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company");
      const s = slug.trim().toLowerCase().replace(/\s+/g, "-");
      return teamsApi.create(selectedCompanyId, {
        name: name.trim(),
        slug: s || name.trim().toLowerCase().replace(/\s+/g, "-"),
        status: "active",
      });
    },
    onSuccess: async () => {
      setName("");
      setSlug("");
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(selectedCompanyId) });
      }
      pushToast({ title: "Team created", tone: "success" });
    },
    onError: (e) => {
      pushToast({ title: "Could not create team", body: e instanceof Error ? e.message : "", tone: "error" });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, data }: { teamId: string; data: { name?: string; status?: "active" | "archived" } }) => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.update(selectedCompanyId, teamId, data);
    },
    onSuccess: async () => {
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.list(selectedCompanyId) });
      }
      setEditingTeamId(null);
      pushToast({ title: "Team updated", tone: "success" });
    },
    onError: (e) => {
      pushToast({ title: "Update failed", body: e instanceof Error ? e.message : "", tone: "error" });
    },
  });

  const membershipQuery = useQuery({
    queryKey:
      selectedCompanyId && expanded
        ? queryKeys.teams.memberships(selectedCompanyId, expanded)
        : ["teams", "memberships", "off"],
    queryFn: () => teamsApi.listMemberships(selectedCompanyId!, expanded!),
    enabled: !!selectedCompanyId && !!expanded,
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !expanded) throw new Error("No team");
      return teamsApi.addMembership(selectedCompanyId, expanded, {
        principalType: newMember.principalType,
        principalId: newMember.principalId.trim(),
        teamRole: newMember.teamRole,
      });
    },
    onSuccess: async () => {
      setNewMember((m) => ({ ...m, principalId: "" }));
      if (selectedCompanyId && expanded) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.teams.memberships(selectedCompanyId, expanded),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.teams.agentAffiliations(selectedCompanyId),
        });
      }
      pushToast({ title: "Member added", tone: "success" });
    },
    onError: (e) => {
      pushToast({ title: "Could not add member", body: e instanceof Error ? e.message : "", tone: "error" });
    },
  });

  const changeMemberRoleMutation = useMutation({
    mutationFn: async (input: { teamId: string; principalType: string; principalId: string; teamRole: string }) => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.addMembership(selectedCompanyId, input.teamId, {
        principalType: input.principalType,
        principalId: input.principalId,
        teamRole: input.teamRole,
      });
    },
    onSuccess: async (_, input) => {
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.teams.memberships(selectedCompanyId, input.teamId),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.teams.agentAffiliations(selectedCompanyId),
        });
      }
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!selectedCompanyId || !expanded) throw new Error("No team");
      return teamsApi.removeMembership(selectedCompanyId, expanded, membershipId);
    },
    onSuccess: async () => {
      if (selectedCompanyId && expanded) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.teams.memberships(selectedCompanyId, expanded),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.teams.agentAffiliations(selectedCompanyId),
        });
      }
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.createIssueTemplate(selectedCompanyId, {
        name: tplName.trim(),
        bodyTemplate: tplBody.trim() || null,
        defaultTeamId: tplTeamId || null,
        defaultWorkstreamRole: tplWorkstream
          ? (tplWorkstream as (typeof ISSUE_WORKSTREAM_ROLES)[number])
          : null,
        description: null,
      });
    },
    onSuccess: async () => {
      setTplName("");
      setTplBody("");
      setTplTeamId("");
      setTplWorkstream("");
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.issueTemplates(selectedCompanyId) });
      }
      pushToast({ title: "Template saved", tone: "success" });
    },
    onError: (e) => {
      pushToast({ title: "Could not save template", body: e instanceof Error ? e.message : "", tone: "error" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.deleteIssueTemplate(selectedCompanyId, id);
    },
    onSuccess: async () => {
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.issueTemplates(selectedCompanyId) });
      }
    },
  });

  const batchKickoffMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.batchKickoff(selectedCompanyId, {
        title: kickTitle.trim(),
        teamIds: kickTeamIds,
        templateId: kickTemplateId || null,
        createPerTeamChildren: true,
      });
    },
    onSuccess: async (res) => {
      setKickTitle("");
      setKickTeamIds([]);
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) });
      }
      pushToast({ title: "Batch created", body: `Parent ${res.parentIssueId.slice(0, 8)}…`, tone: "success" });
    },
    onError: (e) => {
      pushToast({ title: "Batch kickoff failed", body: e instanceof Error ? e.message : "", tone: "error" });
    },
  });

  const createWebhookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.createWebhook(selectedCompanyId, { url: webhookUrl.trim(), eventKinds: webhookEvents });
    },
    onSuccess: async () => {
      setWebhookUrl("");
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.webhooks(selectedCompanyId) });
      }
      pushToast({ title: "Webhook created", tone: "success" });
    },
    onError: (e) => {
      pushToast({ title: "Webhook failed", body: e instanceof Error ? e.message : "", tone: "error" });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!selectedCompanyId) throw new Error("No company");
      return teamsApi.deleteWebhook(selectedCompanyId, id);
    },
    onSuccess: async () => {
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.teams.webhooks(selectedCompanyId) });
      }
    },
  });

  const teamRows = teamsQuery.data ?? [];

  function startEdit(team: Team) {
    setEditingTeamId(team.id);
    setEditName(team.name);
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Hexagon className="h-7 w-7" />
          Teams
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create pods, assign membership roles, and use teams on issues for filters and orchestration.
        </p>
      </div>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">New team</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team-1" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-muted-foreground">Slug</label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="team-1" />
          </div>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-medium">Directory</h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={includeArchived}
              onCheckedChange={(c) => setIncludeArchived(c === true)}
            />
            Show archived
          </label>
        </div>
        {teamsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {teamRows.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {teamRows.map((team: Team) => {
            const memberAgentIds =
              expanded === team.id
                ? new Set(
                    (membershipQuery.data ?? [])
                      .filter((m) => m.principalType === "agent")
                      .map((m) => m.principalId),
                  )
                : new Set<string>();
            const availableAgents =
              expanded === team.id
                ? (agentsQuery.data ?? [])
                    .filter((a) => a.status !== "terminated" && !memberAgentIds.has(a.id))
                    .sort((a, b) => a.name.localeCompare(b.name))
                : [];

            return (
            <li key={team.id} className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  {editingTeamId === team.id ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      <Input
                        className="max-w-xs"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() =>
                          updateTeamMutation.mutate({
                            teamId: team.id,
                            data: { name: editName.trim() || team.name },
                          })
                        }
                        disabled={updateTeamMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingTeamId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {team.name}
                        {team.status === "archived" ? (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1">
                            Archived
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{team.slug}</div>
                    </>
                  )}
                  {team.reportingHint && (
                    <div className="text-xs text-muted-foreground mt-1">{team.reportingHint}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {editingTeamId !== team.id ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(team)}>
                      Edit
                    </Button>
                  ) : null}
                  {team.status === "active" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateTeamMutation.mutate({ teamId: team.id, data: { status: "archived" } })
                      }
                      disabled={updateTeamMutation.isPending}
                    >
                      Archive
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateTeamMutation.mutate({ teamId: team.id, data: { status: "active" } })}
                      disabled={updateTeamMutation.isPending}
                    >
                      Restore
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExpanded(expanded === team.id ? null : team.id)}
                  >
                    {expanded === team.id ? "Hide members" : "Members"}
                  </Button>
                </div>
              </div>
              {expanded === team.id && (
                <div className="mt-3 space-y-3 pl-2 border-l-2 border-muted">
                  <div className="flex flex-wrap gap-2 items-end">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={newMember.principalType}
                      onChange={(e) =>
                        setNewMember((m) => ({
                          ...m,
                          principalType: e.target.value as "user" | "agent",
                          principalId: "",
                        }))
                      }
                    >
                      <option value="agent">Agent</option>
                      <option value="user">User (by id)</option>
                    </select>
                    {newMember.principalType === "agent" ? (
                      <select
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[12rem] max-w-[min(100%,24rem)]"
                        value={newMember.principalId}
                        onChange={(e) => setNewMember((m) => ({ ...m, principalId: e.target.value }))}
                      >
                        <option value="">Select an agent…</option>
                        {availableAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.title ? ` — ${a.title}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        className="max-w-xs"
                        placeholder="User id (auth user id)"
                        value={newMember.principalId}
                        onChange={(e) => setNewMember((m) => ({ ...m, principalId: e.target.value }))}
                      />
                    )}
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={newMember.teamRole}
                      onChange={(e) => setNewMember((m) => ({ ...m, teamRole: e.target.value }))}
                      title="Workstream role for issues in this team (not the same as the agent job title)"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => addMemberMutation.mutate()}
                      disabled={!newMember.principalId.trim() || addMemberMutation.isPending}
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-lg">
                    Workstream role is for routing and filters on issues. It is stored per team membership and is
                    separate from the agent&apos;s name/title on the agent profile.
                  </p>
                  <ul className="text-sm space-y-1">
                    {membershipQuery.data?.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 flex-wrap">
                        {m.principalType === "agent" && agentsById.has(m.principalId) ? (
                          <div className="min-w-0">
                            <div className="font-medium text-sm">
                              {agentsById.get(m.principalId)!.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono break-all">
                              {m.principalId}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-xs break-all min-w-0">
                            {m.principalType}:{m.principalId}
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                            value={m.teamRole}
                            onChange={(e) => {
                              changeMemberRoleMutation.mutate({
                                teamId: team.id,
                                principalType: m.principalType,
                                principalId: m.principalId,
                                teamRole: e.target.value,
                              });
                            }}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="text-destructive hover:underline p-1"
                            onClick={() => removeMemberMutation.mutate(m.id)}
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">Issue templates</h2>
        <p className="text-xs text-muted-foreground">
          Prefill new issues and batch kickoff children. Workstream must match a membership role.
        </p>
        <div className="flex flex-col gap-2 max-w-lg">
          <Input placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <textarea
            className="min-h-[80px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            placeholder="Default description / checklist body (markdown)"
            value={tplBody}
            onChange={(e) => setTplBody(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1 min-w-[8rem]"
              value={tplTeamId}
              onChange={(e) => setTplTeamId(e.target.value)}
            >
              <option value="">Default team (optional)</option>
              {teamRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm flex-1 min-w-[8rem]"
              value={tplWorkstream}
              onChange={(e) => setTplWorkstream(e.target.value)}
            >
              <option value="">Default workstream</option>
              {ISSUE_WORKSTREAM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {issueFilterLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={!tplName.trim() || createTemplateMutation.isPending}
            onClick={() => createTemplateMutation.mutate()}
          >
            Save template
          </Button>
        </div>
        <ul className="text-sm space-y-1 border-t border-border pt-2 mt-2">
          {(templatesQuery.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2">
              <span>{t.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => deleteTemplateMutation.mutate(t.id)}
                disabled={deleteTemplateMutation.isPending}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">Program kickoff (batch)</h2>
        <p className="text-xs text-muted-foreground">
          Creates a parent issue and one child per selected team, using template defaults when provided.
        </p>
        <div className="space-y-2 max-w-lg">
          <Input
            placeholder="Batch / program title"
            value={kickTitle}
            onChange={(e) => setKickTitle(e.target.value)}
          />
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Teams</span>
            <div className="flex flex-wrap gap-2">
              {teamRows
                .filter((t) => t.status === "active")
                .map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={kickTeamIds.includes(t.id)}
                      onCheckedChange={(c) => {
                        setKickTeamIds((prev) =>
                          c === true ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                        );
                      }}
                    />
                    {t.name}
                  </label>
                ))}
            </div>
          </div>
          <select
            className="h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm"
            value={kickTemplateId}
            onChange={(e) => setKickTemplateId(e.target.value)}
          >
            <option value="">No template</option>
            {(templatesQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!kickTitle.trim() || kickTeamIds.length === 0 || batchKickoffMutation.isPending}
            onClick={() => batchKickoffMutation.mutate()}
          >
            Run kickoff
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-medium">Issue webhooks</h2>
        <p className="text-xs text-muted-foreground">POSTs JSON for issue.created / issue.updated (includes team and workstream on payload).</p>
        <div className="flex flex-col gap-2 max-w-lg">
          <Input
            type="url"
            placeholder="https://example.com/hooks/paperclip"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox
                  checked={webhookEvents.includes(ev)}
                  onCheckedChange={(c) => {
                    setWebhookEvents((prev) =>
                      c === true ? [...new Set([...prev, ev])] : prev.filter((x) => x !== ev),
                    );
                  }}
                />
                {ev}
              </label>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={!webhookUrl.trim() || webhookEvents.length === 0 || createWebhookMutation.isPending}
            onClick={() => createWebhookMutation.mutate()}
          >
            Add webhook
          </Button>
        </div>
        <ul className="text-sm space-y-1 border-t border-border pt-2">
          {(webhooksQuery.data ?? []).map((w) => (
            <li key={w.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0 break-all text-xs">
                <div>{w.url}</div>
                <div className="text-muted-foreground">{(w.eventKinds ?? []).join(", ")}</div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive shrink-0"
                onClick={() => deleteWebhookMutation.mutate(w.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
