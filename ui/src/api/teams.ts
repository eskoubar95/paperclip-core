import type {
  BatchKickoff,
  CompanyIssueWebhook,
  CreateCompanyIssueWebhook,
  CreateIssueTemplate,
  CreateTeam,
  IssueTemplate,
  Team,
  TeamMembership,
  UpdateIssueTemplate,
  UpdateTeam,
} from "@paperclipai/shared";
import { api } from "./client";

export const teamsApi = {
  list: (companyId: string, includeArchived?: boolean) => {
    const q = includeArchived ? "?includeArchived=true" : "";
    return api.get<Team[]>(`/companies/${companyId}/teams${q}`);
  },
  create: (companyId: string, data: CreateTeam) =>
    api.post<Team>(`/companies/${companyId}/teams`, data),
  update: (companyId: string, teamId: string, data: UpdateTeam) =>
    api.patch<Team>(`/companies/${companyId}/teams/${teamId}`, data),
  listMemberships: (companyId: string, teamId: string) =>
    api.get<TeamMembership[]>(`/companies/${companyId}/teams/${teamId}/memberships`),
  addMembership: (
    companyId: string,
    teamId: string,
    data: { principalType: string; principalId: string; teamRole: string; status?: string },
  ) => api.post<TeamMembership>(`/companies/${companyId}/teams/${teamId}/memberships`, data),
  removeMembership: (companyId: string, teamId: string, membershipId: string) =>
    api.delete<{ ok: true }>(
      `/companies/${companyId}/teams/${teamId}/memberships/${membershipId}`,
    ),
  assignToRole: (
    companyId: string,
    teamId: string,
    data: { issueId: string; workstreamRole: string },
  ) => api.post(`/companies/${companyId}/teams/${teamId}/assign-to-role`, data),
  listIssueTemplates: (companyId: string) =>
    api.get<IssueTemplate[]>(`/companies/${companyId}/issue-templates`),
  createIssueTemplate: (companyId: string, data: CreateIssueTemplate) =>
    api.post<IssueTemplate>(`/companies/${companyId}/issue-templates`, data),
  updateIssueTemplate: (companyId: string, templateId: string, data: UpdateIssueTemplate) =>
    api.patch<IssueTemplate>(`/companies/${companyId}/issue-templates/${templateId}`, data),
  deleteIssueTemplate: (companyId: string, templateId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/issue-templates/${templateId}`),
  batchKickoff: (companyId: string, data: BatchKickoff) =>
    api.post<{ parentIssueId: string; childIssueIds: string[] }>(
      `/companies/${companyId}/batch-kickoff`,
      data,
    ),
  listWebhooks: (companyId: string) =>
    api.get<CompanyIssueWebhook[]>(`/companies/${companyId}/issue-webhooks`),
  createWebhook: (companyId: string, data: CreateCompanyIssueWebhook) =>
    api.post<CompanyIssueWebhook>(`/companies/${companyId}/issue-webhooks`, data),
  deleteWebhook: (companyId: string, webhookId: string) =>
    api.delete<{ ok: true }>(`/companies/${companyId}/issue-webhooks/${webhookId}`),
};
