---
summary: "Soham agent: build/deploy notification workflow via GitHub webhooks"
title: "Soham Agent"
read_when:
  - You want to understand the soham build notification agent
  - You want to set up GitHub webhook notifications on your VPS
  - You need to configure the soham agent for deploy alerts
---

# Soham Agent

Soham is the build/deploy notification agent. It receives GitHub webhook
payloads (push, deployment, workflow runs) and turns them into
human-readable notifications delivered to your messaging channels.

## Identity

```json5
{
  id: "soham",
  identity: {
    name: "Soham",
    emoji: "🧞",
  },
}
```

## How it works

```
GitHub push ──► VPS webhook endpoint ──► hook mapping ──► soham agent ──► notification
                POST /hooks/github          extracts        processes       delivered to
                                            branch,         payload and     WhatsApp /
                                            author,         generates       Telegram /
                                            commit          summary         Slack / etc.
```

1. **Someone pushes code** to the GitHub repository.
2. **GitHub fires a webhook** to your VPS at `POST /hooks/github` (or a custom path like `/hooks/soham`).
3. **Hook mapping** matches the request, extracts branch, author, and commit info from the payload using `messageTemplate`, and routes to the soham agent via `agentId: "soham"`.
4. **Soham processes** the message in an isolated agent turn and generates a human-readable summary.
5. **Notification is delivered** to the configured messaging channel (WhatsApp, Telegram, Slack, etc.).

## Configuration

### Option A: Use the built-in GitHub preset

The simplest setup. Add `"github"` to your hooks presets and route it to soham:

```json5
// ~/.openclaw/openclaw.json
{
  hooks: {
    enabled: true,
    token: "your-webhook-secret",
    presets: ["github"],
  },

  agents: {
    list: [
      { id: "main", default: true },
      {
        id: "soham",
        name: "Soham",
        workspace: "~/.openclaw/workspace-soham",
        identity: { name: "Soham", emoji: "🧞" },
      },
    ],
  },
}
```

The `github` preset matches requests to `/hooks/github` and extracts:

| Field          | Template expression          | Example value            |
| -------------- | ---------------------------- | ------------------------ |
| Event type     | `{{headers.x-github-event}}` | `push`                   |
| Repository     | `{{repository.full_name}}`   | `org/openclaw`           |
| Branch         | `{{ref}}`                    | `refs/heads/feat/auth`   |
| Author         | `{{sender.login}}`           | `bharath`                |
| Commit message | `{{head_commit.message}}`    | `fix: login flow`        |
| Compare URL    | `{{compare}}`                | `https://github.com/...` |
| Full payload   | `{{_payload}}`               | entire JSON object       |

Session keys are deduped using the `X-GitHub-Delivery` header.

### Option B: Custom mapping with agentId routing

For full control, define a custom mapping that routes specifically to soham:

```json5
{
  hooks: {
    enabled: true,
    token: "your-webhook-secret",
    mappings: [
      {
        id: "soham-builds",
        match: { path: "soham" }, // matches POST /hooks/soham
        action: "agent",
        agentId: "soham", // route to soham agent
        wakeMode: "now",
        name: "GitHub",
        sessionKey: "hook:github:{{headers.x-github-delivery}}",
        deliver: true,
        channel: "whatsapp", // or "telegram", "slack", etc.
        to: "+15551234567", // delivery target
        messageTemplate: "GitHub {{headers.x-github-event}} on {{repository.full_name}}\nRef: {{ref}}\nBy: {{sender.login}}\nCommit: {{head_commit.message}}\nCompare: {{compare}}\nPayload: {{_payload}}",
      },
    ],
  },
}
```

### Option C: Transform module (advanced)

For complex payload processing, use a transform module:

```json5
{
  hooks: {
    transformsDir: "./transforms",
    mappings: [
      {
        id: "soham-builds",
        match: { path: "github" },
        action: "agent",
        agentId: "soham",
        transform: { module: "github-deploy.mjs" },
      },
    ],
  },
}
```

`~/.openclaw/transforms/github-deploy.mjs`:

```js
export default ({ payload, headers }) => {
  const event = headers["x-github-event"];
  const ref = payload.ref?.replace("refs/heads/", "") ?? "unknown";
  const author = payload.sender?.login ?? "someone";
  const repo = payload.repository?.full_name ?? "unknown repo";
  const commit = payload.head_commit?.message ?? "";

  return {
    message: `Deploy trigger: ${author} pushed to ${ref} on ${repo}\nEvent: ${event}\nCommit: ${commit}`,
    name: "GitHub",
    sessionKey: `hook:github:${headers["x-github-delivery"] ?? Date.now()}`,
  };
};
```

## Setting up the GitHub webhook

1. Go to your GitHub repo **Settings > Webhooks > Add webhook**.
2. Set **Payload URL** to `https://your-vps-domain/hooks/github` (or `/hooks/soham` if using a custom mapping).
3. Set **Content type** to `application/json`.
4. Set **Secret** to match your `hooks.token`.
5. Select events: **Just the push event** (or customize).
6. Save.

If your VPS uses Tailscale Funnel, the URL is your Tailscale hostname.
If behind an SSH tunnel, you need a reverse proxy or Tailscale Funnel to expose the endpoint.

## Workspace files

Soham's workspace can be customized to shape how it generates notifications:

```
~/.openclaw/workspace-soham/
├── AGENTS.md        # Instructions for how soham should format notifications
├── SOUL.md          # Personality (e.g., concise, emoji-friendly, etc.)
├── IDENTITY.md      # Name and emoji config
└── MEMORY.md        # Long-term context (repo names, team members, etc.)
```

Example `AGENTS.md` for soham:

```markdown
You are Soham, a build notification agent.

When you receive a GitHub webhook payload:

1. Identify the event type, branch, and author.
2. Generate a short, clear notification.
3. Include the branch name, who pushed, and the commit summary.
4. Keep it to 1-2 lines. Use emoji sparingly.

Format: "<author> pushed to <branch>: <commit message>"
```

## Delivery

Soham delivers notifications through the configured channel. Set `deliver: true`
and specify `channel` and `to` in the hook mapping:

```json5
{
  deliver: true,
  channel: "whatsapp", // or "telegram", "slack", "discord"
  to: "+15551234567", // phone number, chat ID, channel ID, etc.
}
```

Or let the agent use its default delivery target by omitting `channel`/`to`
and configuring a heartbeat target:

```json5
{
  agents: {
    list: [
      {
        id: "soham",
        heartbeat: {
          target: "whatsapp",
          to: "+15551234567",
        },
      },
    ],
  },
}
```

## Troubleshooting

**"unknown branch by someone"**: The `messageTemplate` is missing branch/author
fields. Use the `github` preset or add `{{ref}}` and `{{sender.login}}` to your
template. Use `{{_payload}}` to dump the full webhook JSON so the agent has all context.

**Notifications not arriving**: Check that `deliver: true` is set, the `channel`
and `to` fields are correct, and the channel is logged in (`openclaw channels status`).

**Duplicate notifications**: Ensure `sessionKey` uses `{{headers.x-github-delivery}}`
for deduplication.

**Agent not found**: Verify the `agentId: "soham"` matches an entry in `agents.list[]`
with `id: "soham"`.
