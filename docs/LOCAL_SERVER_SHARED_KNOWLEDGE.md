# Local / server modes and shared knowledge

## Execution modes

| Mode | Adapter | Typical billing | When to use |
|------|---------|-----------------|-------------|
| **Server** | `hermes_local` (Hermes + OpenRouter or other provider) | Provider / OpenRouter | Unattended runs, Railway, Slack-triggered work |
| **Local (paid)** | `cursor` (Cursor CLI) | Cursor subscription / plan | Interactive dev, refactors, reviews on a developer machine |
| **Local (private / free compute)** | `hermes_local` with **Provider: Local Ollama (OpenAI-compatible)** | No cloud LLM bill; local GPU/CPU only | Privacy-sensitive work, offline-friendly path, smaller models (e.g. `qwen3:8b` via Ollama on Windows) |

Paperclip routes all modes through the same heartbeat pipeline: `context` may include `paperclipSharedKnowledge` (markdown) built from prior run summaries and durable knowledge items.

### Cursor adapter: which binary?

Paperclip runs the **Cursor Agent** CLI as the command **`agent`** (default in adapter config). It is **not** the `cursor` IDE binary and not usually named `cursor-agent`. In Docker, `agent` is installed in the image and symlinked to `/usr/local/bin/agent`. To sanity-check inside the container: `agent --version`.

### Local Hermes + Ollama (Windows + Docker)

1. Install and run **Ollama** on Windows; pull the model: `ollama pull qwen3:8b`.
2. Run Paperclip locally (e.g. `scripts/windows/start-paperclip.ps1`). The launcher optionally checks `http://127.0.0.1:11434/api/tags` for `qwen3:8b`.
3. Create a `hermes_local` agent with:
   - **Provider:** Local Ollama (OpenAI-compatible) (`custom`)
   - **Model:** `qwen3:8b` (or another Ollama tag)
   - **Ollama base URL:** `http://host.docker.internal:11434/v1` when Paperclip runs **inside Docker** and Ollama on the **host**. Use `http://127.0.0.1:11434/v1` if Hermes and Ollama run on the same OS without Docker.
4. Prefer a smaller toolset first (e.g. `web,file,terminal`) before `hermes-cli` / `all` on small models.
5. Build applies `server-patches/apply-hermes-execute-patches.mjs`: it passes `--provider custom` and sets `OPENAI_BASE_URL` for the Hermes child process (upstream npm `VALID_PROVIDERS` omits `custom` by default).

## Shared knowledge (Paperclip-owned)

- **`agent_run_summaries`**: one row per finished heartbeat run (succeeded or failed), keyed by `heartbeat_run_id`. Populated automatically when `PAPERCLIP_SHARED_KNOWLEDGE` is not disabled.
- **`agent_knowledge_items`**: durable notes, facts, or decisions; created via API or future automation.

### Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `PAPERCLIP_SHARED_KNOWLEDGE` | enabled | Set to `0` or `false` to disable reads and writes |
| `PAPERCLIP_SHARED_KNOWLEDGE_MAX_CHARS` | `12000` | Max size of injected markdown context pack |

### HTTP API (authenticated)

- `GET /api/companies/:companyId/agents/:agentId/shared-knowledge/summaries?limit=20`
- `GET /api/companies/:companyId/agents/:agentId/shared-knowledge/items?limit=50`
- `POST /api/companies/:companyId/agents/:agentId/shared-knowledge/items`  
  Body: `{ "title", "body", "kind"?: "note"|"fact"|"decision", "issueId"?, "projectId"?, "sourceRunId"?, "confidence"?, "visibility"?: "agent"|"project"|"company" }`

### Adapter integration

- **Cursor (`cursor`)**: `context.paperclipSharedKnowledge` is prepended (via `joinPromptSections`) into the agent prompt.
- **Hermes (`hermes_local`)**: Docker / CI applies `server-patches/apply-hermes-execute-patches.mjs` so the Hermes `buildPrompt` output is extended with the same markdown (upstream `hermes-paperclip-adapter` does not do this by default).

## Routing and cost policy (operator)

1. Use **local Cursor** when a human is in the loop and you want to consume **Cursor** subscription usage.
2. Use **server Hermes + OpenRouter** for **always-on** or **webhook/Slack** workloads where local CLI is wrong.
3. Use **local Hermes + Ollama** when you want **no cloud LLM usage** and accept lower capability / more tool-calling noise on small models.
4. **Shared knowledge** keeps recent outcomes visible across paths without duplicating long chat logs; keep `PAPERCLIP_SHARED_KNOWLEDGE_MAX_CHARS` tight to control token use (especially for local small models).

## Measuring impact

- Compare OpenRouter spend (existing cost events) per issue before/after enabling summaries.
- Watch average `sharedKnowledgeChars` in Cursor adapter invocation metadata when debugging prompt size.
- If context packs are too large, lower `PAPERCLIP_SHARED_KNOWLEDGE_MAX_CHARS` or reduce the number of rows fetched (see `server/src/services/shared-knowledge.ts`).

## Verification checklist (Local Hermes + Ollama)

- [ ] `ollama list` (on Windows host) shows `qwen3:8b`.
- [ ] `Invoke-WebRequest http://127.0.0.1:11434/api/tags` succeeds (or `curl` equivalent).
- [ ] Agent adapter: `hermes_local`, provider **Local Ollama**, model `qwen3:8b`, base URL matches your layout (Docker → `host.docker.internal`, native → `127.0.0.1`).
- [ ] A test heartbeat run completes; `agent_run_summaries` gains a row (if `PAPERCLIP_SHARED_KNOWLEDGE` is enabled) and shared knowledge appears in runs for other adapters using the same agent/company.
