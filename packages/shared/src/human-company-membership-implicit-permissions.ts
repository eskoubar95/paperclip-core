import type { HumanCompanyMembershipRole, PermissionKey } from "./constants.js";

/**
 * Permissions implicitly granted to human company members by {@link HumanCompanyMembershipRole}.
 * Kept in sync with company access UI; enforced server-side in {@code accessService.canUser}.
 */
export const HUMAN_COMPANY_MEMBERSHIP_IMPLICIT_PERMISSIONS: Record<
  HumanCompanyMembershipRole,
  readonly PermissionKey[]
> = {
  owner: [
    "agents:create",
    "users:invite",
    "users:manage_permissions",
    "tasks:assign",
    "joins:approve",
    "projects:create",
    "projects:update",
    "projects:assign",
    "projects:manage_owner",
    "projects:manage_workspace",
  ],
  admin: [
    "agents:create",
    "users:invite",
    "tasks:assign",
    "joins:approve",
    "projects:create",
    "projects:update",
    "projects:assign",
    "projects:manage_owner",
    "projects:manage_workspace",
  ],
  operator: ["tasks:assign", "projects:assign"],
  viewer: [],
};

export function isHumanCompanyMembershipRole(
  role: string | null | undefined,
): role is HumanCompanyMembershipRole {
  return (
    role === "owner" ||
    role === "admin" ||
    role === "operator" ||
    role === "viewer"
  );
}

export function implicitPermissionsForHumanMembershipRole(
  role: string | null | undefined,
): readonly PermissionKey[] {
  if (!isHumanCompanyMembershipRole(role)) return [];
  return HUMAN_COMPANY_MEMBERSHIP_IMPLICIT_PERMISSIONS[role];
}
