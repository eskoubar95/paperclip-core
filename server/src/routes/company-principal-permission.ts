import type { Request } from "express";
import type { PermissionKey } from "@paperclipai/shared";
import { forbidden, unauthorized } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import type { accessService } from "../services/access.js";
import type { agentService } from "../services/agents.js";

export function canCreateAgentsLegacy(agent: {
  permissions: Record<string, unknown> | null | undefined;
  role: string;
}) {
  if (agent.role === "ceo") return true;
  if (!agent.permissions || typeof agent.permissions !== "object") return false;
  return Boolean((agent.permissions as Record<string, unknown>).canCreateAgents);
}

type AccessSvc = ReturnType<typeof accessService>;
type AgentsSvc = ReturnType<typeof agentService>;

/**
 * Enforces a single company-scoped permission for board users or agents.
 * Matches tasks:assign semantics: CEO and canCreateAgents agents bypass explicit grants.
 */
export async function assertCompanyPrincipalPermission(
  req: Request,
  companyId: string,
  permissionKey: PermissionKey,
  deps: {
    access: AccessSvc;
    agentsSvc: AgentsSvc;
  },
) {
  assertCompanyAccess(req, companyId);
  const { access, agentsSvc } = deps;

  if (req.actor.type === "board") {
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
    const allowed = await access.canUser(companyId, req.actor.userId, permissionKey);
    if (!allowed) throw forbidden(`Missing permission: ${permissionKey}`);
    return;
  }

  if (req.actor.type === "agent") {
    if (!req.actor.agentId) throw forbidden("Agent authentication required");
    const allowedByGrant = await access.hasPermission(companyId, "agent", req.actor.agentId, permissionKey);
    if (allowedByGrant) return;
    const actorAgent = await agentsSvc.getById(req.actor.agentId);
    if (actorAgent && actorAgent.companyId === companyId && canCreateAgentsLegacy(actorAgent)) return;
    throw forbidden(`Missing permission: ${permissionKey}`);
  }

  throw unauthorized();
}
