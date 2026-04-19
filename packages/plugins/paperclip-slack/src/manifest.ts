import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_SETTINGS_PAGE,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SETTINGS_PAGE_SLOT_ID,
  WEBHOOK_KEY_SLACK_EVENTS,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Slack",
  description:
    "Receive Slack app mentions and DMs via the Events API, verify signing secrets, and route messages to a Paperclip agent.",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "companies.read",
    "webhooks.receive",
    "http.outbound",
    "secrets.read-ref",
    "agents.read",
    "agents.invoke",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      publicApiBase: {
        type: "string",
        title: "Public API base URL",
        description:
          "HTTPS origin of this Paperclip deployment (no trailing slash), used for relative avatar URLs and the webhook URL shown in settings.",
        default: "",
      },
      companyId: {
        type: "string",
        title: "Company ID",
        description: "UUID of the Paperclip company that owns the router agent.",
        default: "",
      },
      routerAgentId: {
        type: "string",
        title: "Router agent ID",
        description: "Agent that receives Slack text as an invoke prompt (e.g. your CEO or router agent).",
        default: "",
      },
      signingSecretRef: {
        type: "string",
        format: "secret-ref",
        title: "Slack signing secret",
        description:
          "Name of a Paperclip-stored secret whose value matches Slack → Basic Information → Signing Secret. Create the secret in your instance secret provider first, then enter its reference name here.",
        default: "",
      },
      botTokenRef: {
        type: "string",
        format: "secret-ref",
        title: "Slack bot token",
        description:
          "Secret reference for the Bot User OAuth Token (xoxb-…) from Slack OAuth install — not the raw token in this field unless your deployment stores it that way.",
        default: "",
      },
    },
  },
  webhooks: [
    {
      endpointKey: WEBHOOK_KEY_SLACK_EVENTS,
      displayName: "Slack Events",
      description: "Slack Events API Request URL (subscriptions, URL verification is handled by the host).",
    },
  ],
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: SETTINGS_PAGE_SLOT_ID,
        displayName: "Slack",
        exportName: EXPORT_SETTINGS_PAGE,
      },
    ],
  },
};

export default manifest;
