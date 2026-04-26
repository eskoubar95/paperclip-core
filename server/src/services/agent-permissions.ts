export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
  canCreateProjects: boolean;
  canAssignProjects: boolean;
  canManageProjectOwners: boolean;
  canManageProjectWorkspaces: boolean;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  return {
    canCreateAgents: role === "ceo",
    canCreateProjects: false,
    canAssignProjects: false,
    canManageProjectOwners: false,
    canManageProjectWorkspaces: false,
  };
}

function readBool(record: Record<string, unknown>, key: string, fallback: boolean) {
  return typeof record[key] === "boolean" ? (record[key] as boolean) : fallback;
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;
  return {
    canCreateAgents: readBool(record, "canCreateAgents", defaults.canCreateAgents),
    canCreateProjects: readBool(record, "canCreateProjects", defaults.canCreateProjects),
    canAssignProjects: readBool(record, "canAssignProjects", defaults.canAssignProjects),
    canManageProjectOwners: readBool(record, "canManageProjectOwners", defaults.canManageProjectOwners),
    canManageProjectWorkspaces: readBool(record, "canManageProjectWorkspaces", defaults.canManageProjectWorkspaces),
  };
}
