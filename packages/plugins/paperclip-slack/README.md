# `@paperclipai/plugin-paperclip-slack`

Slack **Events API** integration for Paperclip: verifies Slack signing secrets, handles URL verification (via the Paperclip host), receives `app_mention` and DM (`message` + `channel_type: im`) events, posts an acknowledgement with the router agent’s **name** and **`icon_url`**, and invokes a configurable router agent with the message text.

## Install (development)

From the Paperclip monorepo root:

```bash
pnpm paperclipai plugin install ./packages/plugins/paperclip-slack
```

Restart the server so the plugin is discovered. In production Docker builds, the image copies this package to `$HOME/.paperclip/plugins/paperclip-slack`.

## Paperclip configuration

In **Plugins → Slack** (settings page) or via instance config / API, set:

| Field | Purpose |
| --- | --- |
| `publicApiBase` | HTTPS origin of your deployment (no trailing slash), e.g. `https://paperclip.example.com`. Used to resolve relative agent `avatarUrl` values and to display the webhook URL. |
| `companyId` | UUID of the Paperclip company that owns the router agent. |
| `routerAgentId` | Agent to `invoke` with the Slack text (e.g. CEO / router). |
| `signingSecretRef` | Paperclip **secret reference** for the Slack **Signing Secret** (Basic Information). |
| `botTokenRef` | Secret reference for the **Bot User OAuth Token** (`xoxb-…`). |

Never store raw tokens in config; use Paperclip secret references and the `secrets.read-ref` capability.

## Slack app setup

1. Create a Slack app at [api.slack.com](https://api.slack.com/apps).
2. **OAuth & Permissions** — Bot token scopes (minimum for this plugin):
   - `app_mentions:read`
   - `chat:write`
   - `chat:write.customize` (optional but recommended so `username` / `icon_url` apply)
   - `im:history`
3. **Event Subscriptions** — Enable events. **Request URL**:  
   `https://<your-paperclip-host>/api/plugins/paperclip-slack/webhooks/slack-events`  
   Slack sends `url_verification`; the Paperclip host responds with `{ "challenge": "…" }` before the plugin worker runs.
4. **Subscribe to bot events**: `app_mention`, `message.im`.
5. Install the app to the workspace and copy the **Signing Secret** and **Bot User OAuth Token** into Paperclip secrets; reference them in the plugin config as above.

## Avatar → `icon_url`

Acknowledgement messages call `chat.postMessage` with `icon_url` derived by `resolveSlackAgentAvatarUrl` from `@paperclipai/shared` (uploaded avatar URL → preset fallback PNG → default PNG). Upload agent avatars in Paperclip so Slack can show the same image (public `avatarUrl` must be reachable by Slack’s servers).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Request URL verification fails | Host must receive JSON body; confirm HTTPS and path match `publicApiBase` + `/api/plugins/paperclip-slack/webhooks/slack-events`. |
| `403` / “Invalid Slack signature” | Clock skew &lt; 5 minutes; raw body must match what Slack signed (host preserves `rawBody`). |
| `chat.postMessage` ok:false `missing_scope` | Add `chat:write` / `chat:write.customize` as needed and reinstall the app. |
| Duplicate processing | Plugin dedupes by Slack `event_id` in plugin state. |

## Technical notes

- **URL verification** is handled in `server/src/routes/plugins.ts` so Slack receives `{ challenge }` instead of the generic plugin delivery envelope.
- **Signature verification** uses `X-Slack-Signature` and `X-Slack-Request-Timestamp` with the signing secret (see Slack docs: “Verifying requests from Slack”).
