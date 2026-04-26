# Project orchestration (agents & API)

**Full handoff for agents (file list, permission matrix, routes, tests):** [AGENT_HANDOFF_PROJECT_GOVERNANCE_V1.md](./AGENT_HANDOFF_PROJECT_GOVERNANCE_V1.md)

This note describes how agents and integrations can **choose or create projects** in a deterministic way, aligned with workspace-level GitHub allowlists and permission keys.

## Permissions (recap)

Human members get **implicit** keys by role (see `HUMAN_COMPANY_MEMBERSHIP_IMPLICIT_PERMISSIONS` in `@paperclipai/shared`). Agents rely on **explicit** grants and CEO / `canCreateAgents` elevation where documented.

Relevant keys:

- `projects:create` — create projects (initial workspace on create also needs `projects:manage_workspace`)
- `projects:update` — update metadata, delete project (kept in sync with create for agents via permissions UI)
- `projects:assign` — set or change `projectId` on issues
- `projects:manage_owner` — change `leadAgentId`
- `projects:manage_workspace` — create/update/delete project workspaces (repo, branch, paths)

## Plan endpoint (no mutations)

`POST /api/companies/:companyId/project-orchestration/plan`

Body (JSON):

- `preferredProjectId` (optional UUID) — if it exists in the company, response uses it
- `suggestedProjectName` (optional string) — case-insensitive **unique** name match in the company
- `issueTitle` (optional string) — fallback name when recommending create

Response:

- `{ "action": "use_existing", "projectId": "...", "matchedBy": "preferred_id" | "name_ci" }`
- `{ "action": "create_new", "projectId": null, "suggestedName": "...", "matchedBy": "none" }`

Requires normal company access (`assertCompanyAccess`); does not create rows.

## Typical agent flow

1. Call **plan** with hints from the brief (preferred id or suggested name).
2. If `use_existing`, patch the issue with `projectId` (needs `projects:assign`).
3. If `create_new`, `POST /api/companies/:companyId/projects` with `name` (and optional `workspace`) — needs `projects:create` and, if embedding a workspace, `projects:manage_workspace`. Then assign the issue (`projects:assign`).

Repo URLs must stay within the **company GitHub allowlist** enforced on workspace create/update.

## UI reference

- **Company → Access**: implicit vs explicit grants for humans.
- **Agent → Configuration → Permissions**: project toggles and synced principal grants.