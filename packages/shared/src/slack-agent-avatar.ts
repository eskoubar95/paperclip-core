/**
 * Resolve Slack `chat.postMessage` `icon_url` for an agent.
 *
 * **Priority**
 * 1. `avatarUrl` — normalized to an absolute HTTPS URL using `publicOrigin` when the value is relative.
 * 2. Legacy **preset** `icon` (Lucide key) — Slack cannot render Lucide; we use a neutral PNG so `icon_url` is still valid HTTPS.
 * 3. **Default** — neutral avatar image (same host as Paperclip marketing assets on GitHub).
 *
 * Integrations may still omit `icon_url` and let Slack use the app default by checking for null; this helper always returns a usable HTTPS URL for a consistent bot appearance.
 */
export const SLACK_PRESET_ICON_FALLBACK_URL =
  "https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/avatars/zinc.png";

export const SLACK_DEFAULT_AGENT_ICON_URL =
  "https://raw.githubusercontent.com/paperclipai/paperclip/master/doc/assets/avatars/dark-circle.png";

function normalizeAvatarUrl(publicOrigin: string, raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  const base = publicOrigin.replace(/\/+$/, "");
  if (trimmed.startsWith("/")) return `${base}${trimmed}`;
  return `${base}/${trimmed}`;
}

/**
 * @param publicOrigin — Public base URL of the Paperclip deployment (no trailing slash), used only to absolutize relative `avatarUrl` values.
 */
export function resolveSlackAgentAvatarUrl(
  publicOrigin: string,
  agent: { avatarUrl?: string | null | undefined; icon?: string | null | undefined },
): string {
  const fromUpload = normalizeAvatarUrl(publicOrigin, agent.avatarUrl ?? null);
  if (fromUpload) return fromUpload;
  if (agent.icon && String(agent.icon).trim().length > 0) {
    return SLACK_PRESET_ICON_FALLBACK_URL;
  }
  return SLACK_DEFAULT_AGENT_ICON_URL;
}

/** Alias for integrations that refer to Slack’s `icon_url` field as “icon URL”. */
export const resolveSlackIconUrl = resolveSlackAgentAvatarUrl;
