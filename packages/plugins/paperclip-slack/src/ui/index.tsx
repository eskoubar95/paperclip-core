import type { PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";
import { usePluginData } from "@paperclipai/plugin-sdk/ui";

type SettingsInfo = {
  pluginId: string;
  webhookUrl: string;
  endpointKey: string;
  publicApiBase: string;
  companyId: string;
  routerAgentId: string;
};

/**
 * Operator settings surface: webhook URL (for Slack Request URL), required Slack scopes, and links.
 */
export function SlackSettingsPage({ context }: PluginSettingsPageProps) {
  const { data, loading, error } = usePluginData<SettingsInfo>("slack-settings-info", {
    companyId: context.companyId,
  });

  if (loading) {
    return <p>Loading…</p>;
  }
  if (error) {
    return <p role="alert">Could not load Slack settings: {error.message}</p>;
  }
  if (!data) {
    return null;
  }

  return (
    <section style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h2 style={{ margin: 0 }}>Slack connection</h2>
        <p style={{ marginTop: 8, color: "var(--pc-muted-foreground, #666)", fontSize: 14 }}>
          Configure the Slack app (Events API) and Paperclip secrets, then paste the Request URL below into
          Slack under <strong>Event Subscriptions</strong>.
        </p>
      </header>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Request URL (Events API)</span>
        <input
          readOnly
          value={data.webhookUrl}
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--pc-border, #ccc)",
            width: "100%",
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span style={{ fontSize: 12, color: "var(--pc-muted-foreground, #666)" }}>
          Plugin <code>{data.pluginId}</code> · endpoint <code>{data.endpointKey}</code>
        </span>
      </label>

      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Required bot token scopes</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
          <li>
            <code>app_mentions:read</code> — receive mentions in channels
          </li>
          <li>
            <code>chat:write</code> — reply in channel and DM
          </li>
          <li>
            <code>chat:write.customize</code> — optional: custom <code>username</code> and <code>icon_url</code> on
            messages (matches Paperclip agent name and avatar)
          </li>
          <li>
            <code>im:history</code> — read direct messages to the bot
          </li>
        </ul>
      </div>

      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Subscribe to bot events</h3>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.6 }}>
          <li>
            <code>app_mention</code>
          </li>
          <li>
            <code>message.im</code> (DMs to the bot)
          </li>
        </ul>
      </div>

      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Avatar → Slack icon</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          The plugin sets <code>icon_url</code> from the router agent&apos;s <code>avatarUrl</code> when posting
          acknowledgements. If no custom avatar is uploaded, Paperclip falls back to neutral default images (see{" "}
          <code>@paperclipai/shared</code> <code>resolveSlackAgentAvatarUrl</code>).
        </p>
      </div>

      <p style={{ fontSize: 12, color: "var(--pc-muted-foreground, #666)" }}>
        Enter <strong>public API base</strong>, <strong>company</strong>, <strong>router agent</strong>, and
        Slack <strong>secret references</strong> in the <strong>Instance configuration</strong> section below
        (same page). Raw Slack tokens should live in your Paperclip secret store; this UI stores references, not
        pasted production secrets, unless your deployment maps fields differently.
      </p>
    </section>
  );
}
