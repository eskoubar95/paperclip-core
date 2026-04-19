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
        title: "Slack signing secret (secret ref)",
        description: "Paperclip secret reference for the Signing Secret from the Slack app (Basic Information).",
        default: "",
      },
      botTokenRef: {
        type: "string",
        title: "Bot token (secret ref)",
        description: "Paperclip secret reference for the Bot User OAuth Token (xoxb-...).",
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
