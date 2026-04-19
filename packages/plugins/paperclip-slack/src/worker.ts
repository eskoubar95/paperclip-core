import { createHmac, timingSafeEqual } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import { resolveSlackAgentAvatarUrl } from "@paperclipai/shared";
import {
  PLUGIN_ID,
  WEBHOOK_KEY_SLACK_EVENTS,
} from "./constants.js";

type SlackPluginConfig = {
  publicApiBase?: string;
  companyId?: string;
  routerAgentId?: string;
  signingSecretRef?: string;
  botTokenRef?: string;
};

let ctxRef: PluginContext | null = null;

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0) return v[0];
  return undefined;
}

function verifySlackSignature(
  signingSecret: string,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const sig = headerValue(headers, "x-slack-signature");
  const ts = headerValue(headers, "x-slack-request-timestamp");
  if (!sig || !ts) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 60 * 5) {
    return false;
  }
  const base = `v0:${ts}:${rawBody}`;
  const hmac = createHmac("sha256", signingSecret).update(base).digest("hex");
  const expected = `v0=${hmac}`;
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function slackApiOk(data: unknown): data is { ok: true } {
  return typeof data === "object" && data !== null && (data as { ok?: boolean }).ok === true;
}

function parseWebhookEnvelope(input: PluginWebhookInput): Record<string, unknown> {
  if (input.parsedBody && typeof input.parsedBody === "object" && !Array.isArray(input.parsedBody)) {
    return input.parsedBody as Record<string, unknown>;
  }
  try {
    return JSON.parse(input.rawBody || "{}") as Record<string, unknown>;
  } catch {
    throw new Error("Invalid Slack webhook JSON");
  }
}

async function postSlackMessage(
  ctx: PluginContext,
  botToken: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await ctx.http.fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as unknown;
  if (!slackApiOk(data)) {
    ctx.logger.error("Slack chat.postMessage failed", { data });
  }
}

async function getConfig(ctx: PluginContext): Promise<SlackPluginConfig> {
  const raw = await ctx.config.get();
  return (raw ?? {}) as SlackPluginConfig;
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    ctxRef = ctx;

    ctx.data.register("slack-settings-info", async () => {
      const config = await getConfig(ctx);
      const base = String(config.publicApiBase ?? "").replace(/\/+$/, "");
      const path = `/api/plugins/${encodeURIComponent(PLUGIN_ID)}/webhooks/${WEBHOOK_KEY_SLACK_EVENTS}`;
      const webhookUrl = base ? `${base}${path}` : path;
      return {
        pluginId: PLUGIN_ID,
        webhookUrl,
        endpointKey: WEBHOOK_KEY_SLACK_EVENTS,
        publicApiBase: config.publicApiBase ?? "",
        companyId: config.companyId ?? "",
        routerAgentId: config.routerAgentId ?? "",
      };
    });
  },

  async onValidateConfig(config: Record<string, unknown>) {
    const c = config as SlackPluginConfig;
    const errors: string[] = [];
    if (!c.companyId?.trim()) errors.push("companyId is required");
    if (!c.routerAgentId?.trim()) errors.push("routerAgentId is required");
    if (!c.signingSecretRef?.trim()) errors.push("signingSecretRef is required");
    if (!c.botTokenRef?.trim()) errors.push("botTokenRef is required");
    if (!c.publicApiBase?.trim()) errors.push("publicApiBase is required for avatar URLs and documentation");
    return { ok: errors.length === 0, errors: errors.length ? errors : undefined };
  },

  async onHealth() {
    const ctx = ctxRef;
    if (!ctx) {
      return { status: "error", message: "Worker not initialized" };
    }
    try {
      const config = await getConfig(ctx);
      if (!config.signingSecretRef?.trim() || !config.botTokenRef?.trim()) {
        return { status: "degraded", message: "Signing secret or bot token secret ref is not set" };
      }
      await ctx.secrets.resolve(config.signingSecretRef);
      const token = await ctx.secrets.resolve(config.botTokenRef);
      const res = await ctx.http.fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: "{}",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        return {
          status: "degraded",
          message: `Slack auth.test failed: ${data.error ?? "unknown"}`,
          details: data,
        };
      }
      return { status: "ok", message: "Slack credentials resolve; auth.test succeeded" };
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async onWebhook(input: PluginWebhookInput) {
    const ctx = ctxRef;
    if (!ctx) {
      throw new Error("Plugin context not available");
    }
    if (input.endpointKey !== WEBHOOK_KEY_SLACK_EVENTS) {
      throw new Error(`Unknown webhook endpoint "${input.endpointKey}"`);
    }

    const config = await getConfig(ctx);
    if (!config.signingSecretRef?.trim() || !config.botTokenRef?.trim()) {
      throw new Error("Slack plugin is not configured (signing secret / bot token)");
    }
    const signingSecret = await ctx.secrets.resolve(config.signingSecretRef);
    const botToken = await ctx.secrets.resolve(config.botTokenRef);
    const companyId = config.companyId?.trim();
    const routerAgentId = config.routerAgentId?.trim();
    const publicBase = String(config.publicApiBase ?? "").replace(/\/+$/, "");
    if (!companyId || !routerAgentId || !publicBase) {
      throw new Error("companyId, routerAgentId, and publicApiBase must be set");
    }

    if (!verifySlackSignature(signingSecret, input.rawBody, input.headers)) {
      throw new Error("Invalid Slack signature");
    }

    const body = parseWebhookEnvelope(input);
    if (body.type === "url_verification") {
      return;
    }

    if (body.type !== "event_callback") {
      ctx.logger.info("Slack webhook ignored (not event_callback)", { type: body.type });
      return;
    }

    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    if (eventId) {
      const seen = await ctx.state.get({
        scopeKind: "instance",
        stateKey: `slack-event:${eventId}`,
      });
      if (seen) {
        ctx.logger.info("Duplicate Slack event ignored", { eventId });
        return;
      }
      await ctx.state.set({ scopeKind: "instance", stateKey: `slack-event:${eventId}` }, true);
    }

    const ev = body.event as Record<string, unknown> | undefined;
    if (!ev || typeof ev !== "object") {
      return;
    }

    const subtype = typeof ev.subtype === "string" ? ev.subtype : undefined;
    if (subtype === "message_changed" || subtype === "message_deleted") {
      return;
    }
    if (ev.bot_id || ev.bot_profile) {
      return;
    }

    const eventType = typeof ev.type === "string" ? ev.type : "";
    const channelType = typeof ev.channel_type === "string" ? ev.channel_type : "";
    const threadTs = typeof ev.thread_ts === "string" ? ev.thread_ts : undefined;

    let text = typeof ev.text === "string" ? ev.text : "";
    const channel = typeof ev.channel === "string" ? ev.channel : "";

    if (eventType === "app_mention") {
      // strip bot mention id
      text = text.replace(/<@[A-Z0-9]+>/g, "").trim();
    } else if (eventType === "message" && channelType === "im") {
      // DM to bot
    } else {
      return;
    }

    if (!channel || !text) {
      return;
    }

    const agent = await ctx.agents.get(routerAgentId, companyId);
    if (!agent) {
      ctx.logger.error("Router agent not found", { routerAgentId, companyId });
      return;
    }

    const iconUrl = resolveSlackAgentAvatarUrl(publicBase, agent);

    const ackPayload: Record<string, unknown> = {
      channel,
      text: "Received — running the router agent.",
      username: agent.name,
      icon_url: iconUrl,
    };
    if (threadTs) {
      ackPayload.thread_ts = threadTs;
    }

    await postSlackMessage(ctx, botToken, ackPayload);

    try {
      await ctx.agents.invoke(routerAgentId, companyId, {
        prompt: `Slack message: ${text}`,
        reason: "slack-events",
      });
    } catch (err) {
      ctx.logger.error("agents.invoke failed for Slack event", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
