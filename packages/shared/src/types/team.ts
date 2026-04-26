import type { IssueWorkstreamRole, TeamMembershipRole, TeamStatus } from "../constants.js";

export interface Team {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  notes: string | null;
  reportingHint: string | null;
  status: TeamStatus;
  notificationPolicy: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Lightweight team row embedded on issues for agents and list views. */
export interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  status: TeamStatus;
}

export interface TeamMembership {
  id: string;
  companyId: string;
  teamId: string;
  principalType: string;
  principalId: string;
  teamRole: TeamMembershipRole;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMembershipWithPrincipal extends TeamMembership {
  /** Resolved display name when available (agent name or user label). */
  displayName?: string | null;
}

export interface TeamLeadRefs {
  userId: string | null;
  agentId: string | null;
}

export interface IssueTemplate {
  id: string;
  companyId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  defaultTeamId: string | null;
  defaultWorkstreamRole: IssueWorkstreamRole | null;
  defaultStatus: string | null;
  defaultPriority: string | null;
  bodyTemplate: string | null;
  subIssueBlueprints: unknown[] | null;
  defaultLabelIds: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyIssueWebhook {
  id: string;
  companyId: string;
  url: string;
  secret: string | null;
  eventKinds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchKickoffRequest {
  title: string;
  projectId?: string | null;
  teamIds: string[];
  templateId?: string | null;
  /** When true, create one child issue per team with template defaults. */
  createPerTeamChildren?: boolean;
}

export interface BatchKickoffResult {
  parentIssueId: string;
  childIssueIds: string[];
}

export interface IssueOrchestrationSummaryRow {
  teamId: string | null;
  teamName: string | null;
  byStatus: Record<string, number>;
  blocked: number;
  wip: number;
}

export interface IssueOrchestrationSummary {
  parentIssueId: string;
  byTeam: IssueOrchestrationSummaryRow[];
  crossTeamBlockerCount: number;
  crossTeamBlockerWarning?: string | null;
}
