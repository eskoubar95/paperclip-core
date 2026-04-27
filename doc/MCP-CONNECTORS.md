# Cursor MCP: connectors and authentication

Company-scoped MCP integrations are stored in the database and exposed as a **Cursor `mcp.json` bundle** (`GET /api/companies/:id/mcp/cursor-mcp.json`) for local sync. See migration `**0062_company_mcp.sql`** in `packages/db/src/migrations/`.

## When to use Paperclip MCP vs Cursor native

**Paperclip is best for:**

- **Static credentials** you want to **share company-wide** (connection strings, API keys, PATs, internal integration tokens).
- **Self-hosted** services (your own Postgres, local MCP servers).
- **Company policy**: admin controls which agents get access.

**Cursor native (Settings > MCP) is simpler for:**

- **Hosted OAuth services** (Supabase hosted, Notion hosted, Context7 remote) — these open a **browser** for login; Cursor handles the flow and stores tokens **locally** (not as a shareable credential).
- **Per-developer** credentials (your personal Notion workspace if not shared).

**Example split:**


| Service                         | Best Approach                                                   | Why                                  |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| **Self-hosted Postgres**        | Paperclip `custom_stdio` with connection string in vault        | Static credential; share across team |
| **Notion internal integration** | Paperclip `http_bearer` with `NOTION_TOKEN`                     | Static API key from Notion settings  |
| **Supabase hosted project**     | Cursor native: `https://mcp.supabase.com/mcp?project_ref=<ref>` | OAuth flow; browser login            |
| **Notion hosted workspace**     | Cursor native: `https://mcp.notion.com/mcp`                     | OAuth flow                           |
| **Context7 (with API key)**     | Paperclip `custom_stdio` with `CONTEXT7_API_KEY` env            | Static key                           |
| **Context7 remote (OAuth)**     | Cursor native                                                   | OAuth flow                           |


*If you need **server-based agent runs** (Railway / Docker) to use OAuth services, see "Future: OAuth in Paperclip" below.*

## Mental model: connector, not ad-hoc npx in production

Think of each row as a **connector**: a **command or HTTP URL** plus **non-secret config**, and (when needed) **one secret** (API key, PAT, bearer, OAuth refresh, etc.) held in the company secrets vault. After sync, Cursor (and the agent CLI) read `~/.cursor/mcp.json` and run MCP **without** opening a browser, as long as the materialized config already contains the credentials the server expects.

**Goal:** any interactive step (browser login, device approval, "first run" OAuth) should happen at **connect time** (a human in front of a browser or a documented one-off on a device), not at **unattended agent** time. Paperclip's role today is to **hold** the result of that process (encrypted) and **inject** it into the bundle.

## What the server supports today

- `**http_bearer`:** HTTP MCP with `Authorization: Bearer <token>`. Config JSON must include `url`. Token is the stored secret.
- `**custom_stdio`:** stdio MCP with `command`, `args`, optional `env` map, and optional token injected into a named env var (default `API_KEY`); override with `tokenEnvName` in config.

There are **no** hard-coded vendor packages in the server: you express remote tools (including `npx -y …` / `mcp-remote` style) **in config** and supply secrets **out of band** where the vendor documents them.

## Auth patterns and limitations


| Pattern                                                                 | How it maps to Paperclip                                                                                                                                                                                                                                               | Agent / CI without a human                                                                                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Static API key / PAT**                                                | Paste into the token field; verify with **Test** where applicable.                                                                                                                                                                                                     | Good fit.                                                                                                                     |
| **OAuth2 + refresh** (or long-lived bearer)                             | If the **vendor documents** a token the Cursor server accepts (e.g. `Authorization: Bearer` or a specific env), store it in the token field. Optional future work: a dedicated "Connect in browser" flow in the board that performs OAuth and stores refresh material. | Only works once a **machine-usable** token is stored; **automation cannot complete** interactive-only OAuth at agent runtime. |
| **M2M / client credentials**                                            | Same as long-lived token if the server reads it from the env/headers you configure.                                                                                                                                                                                    | Good fit if the provider supports it.                                                                                         |
| **Device code / browser-only first use** (e.g. some `mcp-remote` flows) | The secret must be **obtained before** the agent run: a human finishes login on that machine, or the provider offers a key/PAT, or a future Paperclip "Connect" step captures tokens via standard OAuth.                                                               | **Not** a fit if the *only* path is an interactive npx that refuses to work without a live browser for every new machine.     |


**Important:** Tools that keep session state only inside **opaque local files** (owned by `npx` or the MCP runtime) are **not** automatically portable. Prefer vendors that document **env-based** or **HTTP bearer** automation.

## Per-vendor work

A single generic "npx for everything" **cannot** replace provider-specific details: OAuth endpoints, scopes, and env var names differ. A **unified product direction** is:

- Same **UI steps**: add integration → (optional) connect / paste secret → **Test** → save.
- Same **output**: materialized `mcp.json` for sync.
- **Provider-specific** wiring only where the vendor's API requires it (or where we add a first-class "Connect with X" in the board).

## Local sync

Developers use a **sync token** (`pcpmcp_…`) and a script (see the parent wrapper's `scripts/windows/Sync-PaperclipMcp.ps1`) to write `~/.cursor/mcp.json`. The board can create and revoke these tokens; treat them like deployment secrets.

When Cursor starts, it loads **both** the synced `mcp.json` (Paperclip-managed static credentials) **and** any servers you added via **Cursor Settings > MCP** (OAuth, personal configs). They merge; agents can use all of them.

## Future: OAuth in Paperclip (if needed)

For **server-based agents** (Railway / Docker) that have no local Cursor `mcp.json` and need **hosted OAuth services** (Supabase, Notion), you would add:

1. OAuth redirect/callback in the board (`/api/companies/:id/mcp/oauth/:provider`).
2. Store **refresh tokens** in `company_secrets`.
3. Refresh and inject **access tokens** when building the bundle.

This is **not implemented** today. For now, hosted OAuth MCP is **local-dev only** (via Cursor native UI).

## Related

- `doc/DATABASE.md` — secrets and `0062` tables
- `ui` — **Company → Settings** → Cursor MCP (`CompanyMcpSettings.tsx`)
- [Cursor MCP docs](https://cursor.com/docs/mcp) — `mcp.json` shape