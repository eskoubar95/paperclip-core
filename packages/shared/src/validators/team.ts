import { z } from "zod";
import {
  ISSUE_WORKSTREAM_ROLES,
  MEMBERSHIP_STATUSES,
  PRINCIPAL_TYPES,
  TEAM_MEMBERSHIP_ROLES,
  TEAM_STATUSES,
} from "../constants.js";

export const createTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "Slug: lowercase letters, numbers, hyphens"),
    notes: z.string().max(2000).optional().nullable(),
    reportingHint: z.string().max(500).optional().nullable(),
    status: z.enum(TEAM_STATUSES).optional().default("active"),
    notificationPolicy: z.record(z.unknown()).optional().nullable(),
  })
  .strict();

export const updateTeamSchema = createTeamSchema.partial();

export type CreateTeam = z.infer<typeof createTeamSchema>;
export type UpdateTeam = z.infer<typeof updateTeamSchema>;

export const createTeamMembershipSchema = z
  .object({
    principalType: z.enum(PRINCIPAL_TYPES),
    principalId: z.string().trim().min(1),
    teamRole: z.enum(TEAM_MEMBERSHIP_ROLES),
    status: z.enum(MEMBERSHIP_STATUSES).optional().default("active"),
  })
  .strict();

export const updateTeamMembershipSchema = createTeamMembershipSchema.partial();

export const issueWorkstreamRoleSchema = z.enum(ISSUE_WORKSTREAM_ROLES);

export const createIssueTemplateSchema = z
  .object({
    projectId: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    defaultTeamId: z.string().uuid().optional().nullable(),
    defaultWorkstreamRole: issueWorkstreamRoleSchema.optional().nullable(),
    defaultStatus: z.string().optional().nullable(),
    defaultPriority: z.string().optional().nullable(),
    bodyTemplate: z.string().max(524288).optional().nullable(),
    subIssueBlueprints: z.array(z.record(z.unknown())).optional().nullable(),
    defaultLabelIds: z.array(z.string().uuid()).optional().nullable(),
  })
  .strict();

export const updateIssueTemplateSchema = createIssueTemplateSchema.partial();

export type CreateIssueTemplate = z.infer<typeof createIssueTemplateSchema>;
export type UpdateIssueTemplate = z.infer<typeof updateIssueTemplateSchema>;

export const batchKickoffSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    projectId: z.string().uuid().optional().nullable(),
    teamIds: z.array(z.string().uuid()).min(1),
    templateId: z.string().uuid().optional().nullable(),
    createPerTeamChildren: z.boolean().optional().default(true),
  })
  .strict();

export const companyIssueWebhookSchema = z
  .object({
    url: z.string().url().max(2000),
    secret: z.string().max(500).optional().nullable(),
    eventKinds: z.array(z.string().min(1).max(64)).min(1),
  })
  .strict();

export type BatchKickoff = z.infer<typeof batchKickoffSchema>;
export type CreateCompanyIssueWebhook = z.infer<typeof companyIssueWebhookSchema>;
