# Agent handoff: project governance & orchestration (v1)

**Audience:** downstream AI agents or engineers picking up this work.  
**Scope:** agent- and permission-driven **projects** (create, update, issue assignment, owner/workspace governance), **deterministic orchestration plan** API, **UI** toggles, and **tests**.  
**Language:** implementation detail is in English to match the codebase.

---

## 1. Executive summary

This integration makes **projects first-class** under company-scoped **permission keys**, aligned with how **tasks** and **agents** are governed:

- New **`PermissionKey` values** for project lifecycle: create, update metadata, assign issues to projects, manage project owner (`leadAgentId`), manage project workspaces (repo/branch, etc.).
- **Humans** receive **implicit** grants from **membership role** (`owner` / `admin` / `operator` / `viewer`) via a single shared source of truth; **explicit DB grants** still override or extend where applicable.
- **Agents** use **explicit principal grants**; **CEO** and agents with **`canCreateAgents`** are **elevated** for project keys (same pattern as `tasks:assign`).
- **Issues:** setting or changing **`projectId`** requires **`projects:assign`** (enforced on create/update paths where `projectId` is supplied).
- **Orchestration:** read-only **`POST .../project-orchestration/plan`** returns a deterministic **use existing** vs **create new** recommendation (by preferred id, then case-insensitive unique name, else suggested name).
- **Owner model:** **`leadAgentId`** on projects; when an agent is **terminated**, projects pointing at that agent get **`leadAgentId` cleared**.
- **UI:** Company **Access** page labels + implicit grant display; Agent **Permissions** toggles for project capabilities; project properties surface **`defaultRef`** / branch-related workspace fields where applicable.

Database column **`projects.lead_agent_id`** already existed in schema; this work wires **permissions**, **routes**, **validators**, **services**, and **UI** around it.

---

## 2. Permission keys (`PermissionKey`)

Defined in `packages/shared/src/constants.ts` (`PERMISSION_KEYS`):

| Key | Meaning |
|-----|--------|
| `projects:create` | Create projects. Initial embedded **workspace** on create also requires `projects:manage_workspace`. |
| `projects:update` | Update project metadata (name, description, status, goals, dates, color, archive, …). |
| `projects:assign` | Set or change **`projectId`** on issues. |
| `projects:manage_owner` | Change **`leadAgentId`**. |
| `projects:manage_workspace` | Create/update/delete **project workspaces** and related execution/env fields that are classified as workspace governance. |

**Agent permission sync:** On agent permission updates, **`projects:update`** is kept in sync with **`projects:create`** (same effective flag as create), so agents with “create projects” can also update project metadata without a separate grant.

---

## 3. Human implicit permissions

**Source:** `packages/shared/src/human-company-membership-implicit-permissions.ts`  
**Exports:** `HUMAN_COMPANY_MEMBERSHIP_IMPLICIT_PERMISSIONS`, `implicitPermissionsForHumanMembershipRole`, `isHumanCompanyMembershipRole` (re-exported from `packages/shared/src/index.ts`).

**Enforcement:** `server/src/services/access.ts` — `canUser()` checks, in order: instance admin → explicit user grant → **implicit role permissions**.

**Rough matrix (see file for exact lists):**

- **`owner`:** full project keys (create, update, assign, manage owner, manage workspace) plus other company keys.
- **`admin`:** same project keys as owner except `users:manage_permissions` (see file).
- **`operator`:** `tasks:assign`, `projects:assign` only.
- **`viewer`:** no implicit keys.

**UI:** `ui/src/pages/CompanyAccess.tsx` imports `HUMAN_COMPANY_MEMBERSHIP_IMPLICIT_PERMISSIONS` for display and defines **labels** for every `PermissionKey` including the new project keys.

---

## 4. Principal permission enforcement (board + agent)

**Helper:** `server/src/routes/company-principal-permission.ts` — `assertCompanyPrincipalPermission(req, companyId, permissionKey, { access, agentsSvc })`.

**Semantics:**

- **Board:** `assertCompanyAccess` then `access.canUser` (unless local implicit / instance admin).
- **Agent:** explicit `access.hasPermission` **or** elevation if agent is **CEO** or **`canCreateAgents`** (legacy flag on `agent.permissions`), matching **`tasks:assign`** behavior.

All new project route checks and issue project assignment should go through this helper (or the same pattern) for consistency.

---

## 5. HTTP API surface

### 5.1 Projects router

**File:** `server/src/routes/projects.ts`

- **`GET /companies/:companyId/projects`** — list (company access only).
- **`POST /companies/:companyId/project-orchestration/plan`** — **read-only** plan; body validated with `projectOrchestrationPlanSchema`; **no DB mutations**; requires `assertCompanyAccess` only (not `projects:create`).
- **`POST /companies/:companyId/projects`** — create; requires `projects:create`; if body includes **`workspace`**, also **`projects:manage_workspace`**; GitHub allowlist / workspace rules unchanged from existing workspace governance.
- **`PATCH /projects/:id`** — classifies body keys and requires **`projects:update`**, **`projects:manage_owner`**, and/or **`projects:manage_workspace`** as applicable (`classifyProjectUpdatePermissionKeys`).
- Workspace CRUD / runtime control routes in the same file retain their existing authz patterns; workspace mutations align with **`projects:manage_workspace`** where added or tightened in this work.

### 5.2 Issues router

**File:** `server/src/routes/issues.ts`

- **`assertCanAssignProjects`** → `assertCompanyPrincipalPermission(..., "projects:assign", ...)`.
- Invoked when **`projectId`** is set on create or when **`projectId`** changes on update (see grep locations around `assertCanAssignProjects` and `req.body.projectId`).

### 5.3 Agents router

**File:** `server/src/routes/agents.ts`

- **`buildAgentDetail` / access state** exposes **`canCreateProjects`**, **`canAssignProjects`**, **`canManageProjectOwners`**, **`canManageProjectWorkspaces`** resolved from grants + elevation.
- **`PATCH .../permissions`** (or equivalent update-permissions handler): persists boolean flags and **syncs principal grants** for:
  - `projects:create`, `projects:update` (tied to effective create),
  - `projects:assign`,
  - `projects:manage_owner`,
  - `projects:manage_workspace`.

---

## 6. Orchestration service

**File:** `server/src/services/project-orchestration.ts`  
**Function:** `projectOrchestrationService(db).plan(companyId, input)`

**Algorithm:**

1. If **`preferredProjectId`** present and row exists in company → `use_existing` / `matchedBy: "preferred_id"`.
2. Else if **`suggestedProjectName`** non-empty → case-insensitive match on `projects.name` within company; if **exactly one** row → `use_existing` / `matchedBy: "name_ci"`.
3. Else → `create_new` with **`suggestedName`** from name, else **`issueTitle`** (truncated), else `"New project"` / `matchedBy: "none"`.

**Types & validation:** `packages/shared/src/validators/project.ts` — `projectOrchestrationPlanSchema`, `ProjectOrchestrationPlanInput`, `ProjectOrchestrationPlanResult`; exported via `packages/shared/src/index.ts` and `validators/index.ts`.

---

## 7. Owner model & agent termination

- **Schema:** `packages/db/src/schema/projects.ts` — `leadAgentId` → `agents.id`.
- **Validators:** `leadAgentId` on create/update project payloads in `packages/shared/src/validators/project.ts`.
- **Cleanup:** `server/src/services/agents.ts` — on agent **terminate**, `projects.leadAgentId` is set to **`null`** where it referenced that agent.

**Portability / export:** `server/src/services/company-portability.ts` includes `leadAgentId` / slug mapping for company export flows (verify if extending backup format).

---

## 8. Shared agent permissions (normalized shape)

**File:** `server/src/services/agent-permissions.ts`  
**Fields:** `canCreateProjects`, `canAssignProjects`, `canManageProjectOwners`, `canManageProjectWorkspaces` (plus existing `canCreateAgents`).

**Validators:** `packages/shared/src/validators/agent.ts` — `agentPermissionsSchema` and related create/update schemas include the new booleans.

---

## 9. UI

| Area | File | Notes |
|------|------|--------|
| Company access labels + implicit grants | `ui/src/pages/CompanyAccess.tsx` | `permissionLabels` + `HUMAN_COMPANY_MEMBERSHIP_IMPLICIT_PERMISSIONS` |
| Agent permission toggles | `ui/src/pages/AgentDetail.tsx` | Switches for project capabilities; uses `agent.access.*` and PATCH body |
| Project properties | `ui/src/components/ProjectProperties.tsx` | Workspace / **`defaultRef`** / owner display helpers |
| Projects API client | `ui/src/api/projects.ts` | `planOrchestration(companyId, body)` |
| Agents API client | `ui/src/api/agents.ts` | `AgentPermissionUpdate` includes project flags |

---

## 10. File inventory (primary)

### Shared (`packages/shared`)

- `src/constants.ts` — `PERMISSION_KEYS` entries for projects.
- `src/human-company-membership-implicit-permissions.ts` — implicit matrix for humans.
- `src/index.ts` — exports for implicit permissions + orchestration types/schemas as applicable.
- `src/validators/project.ts` — `leadAgentId`, workspace schemas, **`projectOrchestrationPlanSchema`**, result types.
- `src/validators/agent.ts` — permission booleans for projects.
- `src/validators/index.ts` — re-exports orchestration schema if listed there.

### Server (`server`)

- `src/routes/company-principal-permission.ts` — shared assert for board/agent.
- `src/routes/projects.ts` — permissions, orchestration route, classified PATCH.
- `src/routes/issues.ts` — `projects:assign` when `projectId` set/changed.
- `src/routes/agents.ts` — detail access lines, grant sync on permission update.
- `src/services/access.ts` — `canUser` uses `implicitPermissionsForHumanMembershipRole`.
- `src/services/project-orchestration.ts` — plan implementation.
- `src/services/agent-permissions.ts` — normalized agent permission record.
- `src/services/agents.ts` — terminate clears `leadAgentId`.
- `src/services/company-portability.ts` — export/import mapping involving `leadAgentId` (if present in branch).

### UI (`ui`)

- `src/pages/CompanyAccess.tsx`
- `src/pages/AgentDetail.tsx`
- `src/components/ProjectProperties.tsx`
- `src/api/projects.ts`
- `src/api/agents.ts`

### Documentation (this repo)

- `docs/PROJECT_ORCHESTRATION.md` — short operational note for agents (plan endpoint, typical flow).
- `docs/AGENT_HANDOFF_PROJECT_GOVERNANCE_V1.md` — **this document**.

### Tests (`server/src/__tests__`)

- `project-orchestration-service.test.ts` — service behavior (embedded Postgres when supported).
- `project-routes-env.test.ts` — project env / persistence routes.
- `project-goal-telemetry-routes.test.ts` — telemetry on project/goal actions.
- `agent-permissions-routes.test.ts` — agent permission payloads include project grants.
- Other tests may reference `leadAgentId: null` in fixtures (`company-portability.test.ts`, workspace tests, UI tests).

**Smoke / curated runs:** root `package.json` may define `test:smoke` delegating to `server/package.json` with a subset including project/orchestration-related tests (adjust if paths change).

---

## 11. Operational notes for agents calling the API

1. Call **`POST /api/companies/:companyId/project-orchestration/plan`** with hints.
2. If **`use_existing`**, patch issue with **`projectId`** (needs **`projects:assign`**).
3. If **`create_new`**, **`POST /api/companies/:companyId/projects`** with `name` (and optional `workspace`) — needs **`projects:create`** and **`projects:manage_workspace`** if embedding workspace; then assign issue.

Repo URLs for workspaces must remain within the **company GitHub allowlist** (existing server validation).

---

## 12. Known gaps / sensible v2 follow-ups

- Deeper interaction between **`tasks:assign_scope`** and projects (if product requires scoped assignment per project).
- Richer **audit** events for project permission changes (beyond existing activity log where present).
- Playwright E2E for Access + Agent permissions + project assign (optional).

---

## 13. How to use this doc in a new chat

Paste or `@`-reference:

> Read `paperclip/docs/AGENT_HANDOFF_PROJECT_GOVERNANCE_V1.md` and `paperclip/docs/PROJECT_ORCHESTRATION.md` for project governance v1, then implement \<task\>.

That gives the next agent the **permission model**, **endpoints**, **file map**, and **test** pointers without re-deriving from git history.
