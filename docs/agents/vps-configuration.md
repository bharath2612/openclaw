---
summary: "VPS configuration for running soham and sharky agents together"
title: "VPS Multi-Agent Configuration"
read_when:
  - You want to deploy soham and sharky on a VPS
  - You need a complete multi-agent VPS config reference
  - You want to set up GitHub webhooks alongside chat agents on a VPS
---

# VPS Multi-Agent Configuration

Complete guide to running soham (build notifications) and sharky
(conversational agent) together on a single VPS.

## Architecture

```
                                ┌─────────────────────────────────┐
                                │           VPS (Gateway)         │
GitHub ──webhook──►  /hooks/github ──► soham 🧞                   │
                                │         │  isolated agent turn   │
                                │         └──► deliver to channel  │
                                │                                 │
WhatsApp ◄──────────────────────┤                                 │
Telegram ◄────── replies ───────┤  sharky 🦈                      │
Discord  ◄──────────────────────┤    │  handles inbound messages  │
                                │    └──► replies on same channel  │
                                │                                 │
Laptop ──SSH tunnel──► Control UI (ws://127.0.0.1:18789)         │
                                └─────────────────────────────────┘
```

- **Soham** handles webhook-triggered jobs (builds, deploys, GitHub events).
- **Sharky** handles interactive messaging (DMs, groups, general tasks).
- Both run in the same Gateway process with isolated workspaces and sessions.

## Complete config

`~/.openclaw/openclaw.json` (JSON5):

```json5
{
  // ── Agents ──────────────────────────────────────────────────────
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-5" },
      maxConcurrent: 4,
    },
    list: [
      {
        id: "sharky",
        default: true,
        name: "Sharky",
        workspace: "~/.openclaw/workspace-sharky",
        identity: { name: "Sharky", emoji: "🦈" },
        model: { primary: "anthropic/claude-sonnet-4-5" },
      },
      {
        id: "soham",
        name: "Soham",
        workspace: "~/.openclaw/workspace-soham",
        identity: { name: "Soham", emoji: "🧞" },
        model: { primary: "anthropic/claude-sonnet-4-5" },
      },
    ],
  },

  // ── Bindings (route inbound messages to agents) ─────────────────
  bindings: [
    // Sharky handles all interactive messaging
    { agentId: "sharky", match: { channel: "whatsapp" } },
    { agentId: "sharky", match: { channel: "telegram" } },
    // Soham does not need bindings — it only runs via hook-triggered jobs
  ],

  // ── Hooks (webhook ingress) ─────────────────────────────────────
  hooks: {
    enabled: true,
    token: "your-webhook-secret-here", // CHANGE THIS — use: openssl rand -hex 32
    presets: ["github"], // enables POST /hooks/github

    // Optional: custom mapping to route GitHub webhooks to soham specifically
    mappings: [
      {
        id: "soham-builds",
        match: { path: "github" },
        action: "agent",
        agentId: "soham",
        wakeMode: "now",
        name: "GitHub",
        deliver: true,
        channel: "whatsapp", // deliver notifications here
        to: "+15551234567", // your phone number
        sessionKey: "hook:github:{{headers.x-github-delivery}}",
        messageTemplate: "GitHub {{headers.x-github-event}} on {{repository.full_name}}\nRef: {{ref}}\nBy: {{sender.login}}\nCommit: {{head_commit.message}}\nCompare: {{compare}}\nPayload: {{_payload}}",
      },
    ],
  },

  // ── Gateway ─────────────────────────────────────────────────────
  gateway: {
    bind: "loopback", // safe default; access via SSH tunnel
    port: 18789,
    auth: {
      mode: "token",
      token: "your-gateway-token-here", // CHANGE THIS — use: openssl rand -hex 32
    },
    // Optional: Tailscale for remote access without SSH tunnel
    // tailscale: { mode: "serve" },
  },

  // ── Channels ────────────────────────────────────────────────────
  channels: {
    whatsapp: {
      enabled: true,
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567"], // your number
    },
    // telegram: {
    //   enabled: true,
    //   botToken: "YOUR_BOT_TOKEN",     // or env: TELEGRAM_BOT_TOKEN
    //   dmPolicy: "pairing",
    // },
  },
}
```

## Directory layout on VPS

```
~/.openclaw/
├── openclaw.json                        # Main config (above)
│
├── workspace-sharky/                    # Sharky workspace
│   ├── AGENTS.md                        # Operating instructions
│   ├── SOUL.md                          # Personality
│   ├── USER.md                          # User identity
│   ├── IDENTITY.md                      # Name + emoji
│   ├── HEARTBEAT.md                     # Periodic checks
│   ├── MEMORY.md                        # Long-term memory
│   ├── memory/                          # Daily logs
│   └── skills/                          # Sharky-specific skills
│
├── workspace-soham/                     # Soham workspace
│   ├── AGENTS.md                        # Build notification instructions
│   ├── SOUL.md                          # Notification style
│   ├── IDENTITY.md                      # Name + emoji
│   └── MEMORY.md                        # Known repos, team members
│
├── agents/
│   ├── sharky/
│   │   ├── agent/auth-profiles.json     # Sharky auth (OAuth, API keys)
│   │   └── sessions/                    # Sharky chat history
│   └── soham/
│       ├── agent/auth-profiles.json     # Soham auth
│       └── sessions/                    # Soham hook sessions
│
└── credentials/
    └── whatsapp/
        └── default/creds.json           # WhatsApp session (survives restarts)
```

## Docker setup

### docker-compose.yml

```yaml
services:
  openclaw-gateway:
    image: openclaw:latest
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      - HOME=/home/node
      - NODE_ENV=production
      - TERM=xterm-256color
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_SHARKY}:/home/node/.openclaw/workspace-sharky
      - ${OPENCLAW_WORKSPACE_SOHAM}:/home/node/.openclaw/workspace-soham
    ports:
      - "127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789}:18789"
    command:
      - node
      - dist/index.js
      - gateway
      - --bind
      - loopback
      - --port
      - "18789"
```

### .env

```bash
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_PORT=18789

# Host paths (persist across rebuilds)
OPENCLAW_CONFIG_DIR=/root/.openclaw
OPENCLAW_WORKSPACE_SHARKY=/root/.openclaw/workspace-sharky
OPENCLAW_WORKSPACE_SOHAM=/root/.openclaw/workspace-soham

# Model auth
ANTHROPIC_API_KEY=sk-ant-...

# Optional channel tokens
# TELEGRAM_BOT_TOKEN=...
# DISCORD_BOT_TOKEN=...
```

### Build and launch

```bash
# Create persistent directories
mkdir -p /root/.openclaw/workspace-sharky /root/.openclaw/workspace-soham
chown -R 1000:1000 /root/.openclaw

# Build and start
docker compose build
docker compose up -d openclaw-gateway

# Verify
docker compose logs -f openclaw-gateway
```

## Setting up the GitHub webhook

1. Go to your repo **Settings > Webhooks > Add webhook**.
2. **Payload URL**: `https://your-vps/hooks/github`
   - If using Tailscale Funnel: `https://your-machine.tail1234.ts.net/hooks/github`
   - If behind SSH tunnel: you need a reverse proxy or Tailscale Funnel.
3. **Content type**: `application/json`
4. **Secret**: must match `hooks.token` in your config.
5. **Events**: select "Just the push event" (or add more as needed).
6. Save.

Test it:

```bash
curl -X POST https://your-vps/hooks/github \
  -H "Authorization: Bearer your-webhook-secret-here" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: test-123" \
  -d '{
    "ref": "refs/heads/main",
    "sender": {"login": "bharath"},
    "repository": {"full_name": "org/openclaw"},
    "head_commit": {"message": "test commit"},
    "compare": "https://github.com/org/openclaw/compare/abc...def"
  }'
```

Expected: soham receives the payload, generates a notification like
"bharath pushed to refs/heads/main: test commit", and delivers it to
your WhatsApp.

## Remote access

### SSH tunnel (default, most secure)

From your laptop:

```bash
ssh -N -L 18789:127.0.0.1:18789 user@your-vps-ip
```

Then open `http://127.0.0.1:18789/` in your browser and paste the gateway token.

### Tailscale Serve (tailnet-only, HTTPS auto)

```json5
{
  gateway: {
    bind: "loopback",
    tailscale: { mode: "serve" },
    auth: { allowTailscale: true },
  },
}
```

### Tailscale Funnel (public HTTPS, needed for webhooks)

```json5
{
  gateway: {
    bind: "loopback",
    tailscale: { mode: "funnel" },
    auth: { mode: "token", token: "..." },
  },
}
```

This also makes `/hooks/github` publicly reachable for GitHub webhooks.

## Environment variables

| Variable                 | Required    | Description                   |
| ------------------------ | ----------- | ----------------------------- |
| `ANTHROPIC_API_KEY`      | Yes         | Model provider API key        |
| `OPENCLAW_GATEWAY_TOKEN` | Yes         | Gateway auth token            |
| `TELEGRAM_BOT_TOKEN`     | If Telegram | Telegram bot token            |
| `DISCORD_BOT_TOKEN`      | If Discord  | Discord bot token             |
| `SLACK_BOT_TOKEN`        | If Slack    | Slack bot token               |
| `SLACK_APP_TOKEN`        | If Slack    | Slack app token (Socket Mode) |
| `GOG_KEYRING_PASSWORD`   | If Gmail    | Gmail keyring encryption      |

## Workflow summary

| Agent     | Trigger                             | Input               | Output               | Delivery                |
| --------- | ----------------------------------- | ------------------- | -------------------- | ----------------------- |
| Soham 🧞  | GitHub webhook (`/hooks/github`)    | Push/deploy payload | Build notification   | WhatsApp/Telegram/Slack |
| Sharky 🦈 | Inbound message (any bound channel) | User message        | Conversational reply | Same channel            |

## Adding more agents

```bash
openclaw agents add newagent --workspace ~/.openclaw/workspace-newagent
openclaw agents set-identity --agent newagent --name "NewAgent" --emoji "🤖"
```

Then add bindings in `openclaw.json` to route messages to the new agent.

## Troubleshooting

| Problem                                            | Fix                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "unknown branch by someone" in build notifications | Update `messageTemplate` to include `{{ref}}` and `{{sender.login}}`, or use the `github` preset with `{{_payload}}` |
| Soham not receiving webhooks                       | Check `hooks.enabled: true`, verify token matches, check gateway logs                                                |
| Sharky not replying                                | Check bindings route the channel to sharky, verify channel is logged in                                              |
| Wrong agent handles message                        | Check binding priority — peer > guild > account > channel > default                                                  |
| Notifications not delivered                        | Set `deliver: true`, verify `channel` and `to` in the hook mapping                                                   |
| Auth not working across agents                     | Auth profiles are per-agent; copy `auth-profiles.json` if needed                                                     |
