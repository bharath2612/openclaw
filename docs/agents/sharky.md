---
summary: "Sharky agent: conversational agent workflow and channel routing"
title: "Sharky Agent"
read_when:
  - You want to understand the sharky agent setup
  - You want to configure a second agent alongside soham
  - You need multi-agent routing on your VPS
---

# Sharky Agent

Sharky is a conversational agent that handles day-to-day messaging across
channels. While soham handles build/deploy notifications, sharky handles
direct conversations, group chats, and general-purpose tasks.

## Identity

```json5
{
  id: "sharky",
  identity: {
    name: "Sharky",
    emoji: "🦈",
  },
}
```

## How it works

```
User message ──► Channel (WhatsApp/Telegram/...) ──► Gateway ──► binding match ──► sharky agent
                                                                   routes by         processes
                                                                   channel/peer      and replies
```

1. **User sends a message** on a configured channel (WhatsApp, Telegram, Discord, etc.).
2. **Gateway receives** the inbound message through the channel monitor.
3. **Binding rules** match the message to sharky based on channel, account, peer, or guild.
4. **Sharky processes** the message in its own isolated workspace and session.
5. **Reply is delivered** back through the same channel.

## Configuration

### Agent definition

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    list: [
      {
        id: "sharky",
        name: "Sharky",
        workspace: "~/.openclaw/workspace-sharky",
        identity: {
          name: "Sharky",
          emoji: "🦈",
        },
        model: { primary: "anthropic/claude-sonnet-4-5" },
      },
    ],
  },
}
```

### Channel routing with bindings

Route inbound messages to sharky using bindings. Bindings are deterministic
and most-specific-wins.

**Route all WhatsApp DMs to sharky:**

```json5
{
  bindings: [{ agentId: "sharky", match: { channel: "whatsapp" } }],
}
```

**Route a specific DM to sharky:**

```json5
{
  bindings: [
    {
      agentId: "sharky",
      match: {
        channel: "whatsapp",
        peer: { kind: "direct", id: "+15551234567" },
      },
    },
  ],
}
```

**Route a WhatsApp group to sharky:**

```json5
{
  bindings: [
    {
      agentId: "sharky",
      match: {
        channel: "whatsapp",
        peer: { kind: "group", id: "120363999999999999@g.us" },
      },
    },
  ],
}
```

**Route Telegram to sharky, WhatsApp to soham notifications:**

```json5
{
  bindings: [
    { agentId: "sharky", match: { channel: "telegram" } },
    { agentId: "sharky", match: { channel: "whatsapp" } },
    // soham only handles hook-triggered jobs, no channel binding needed
  ],
}
```

### Binding priority

1. `peer` match (exact DM/group/channel ID) - highest
2. `guildId` (Discord server)
3. `teamId` (Slack workspace)
4. `accountId` (channel account instance)
5. Channel-level match
6. Fallback to default agent

Peer bindings always win. Place them above channel-wide rules.

## Workspace files

Sharky's workspace defines its personality and behavior:

```
~/.openclaw/workspace-sharky/
├── AGENTS.md        # Operating instructions and capabilities
├── SOUL.md          # Personality, tone, and boundaries
├── USER.md          # User identity and preferences
├── IDENTITY.md      # Display name and emoji
├── HEARTBEAT.md     # Periodic check-in instructions
├── MEMORY.md        # Long-term context and notes
├── memory/
│   └── 2026-02-11.md  # Daily logs
└── skills/
    └── ...            # Workspace-specific skills
```

Example `SOUL.md`:

```markdown
You are Sharky. You're direct, helpful, and concise.
Keep responses short unless asked for detail.
You can help with code, research, planning, and general questions.
```

Example `AGENTS.md`:

```markdown
You are a general-purpose assistant.

- Answer questions directly.
- Help with code, writing, and research.
- Use tools when needed (exec, read, write, browser).
- Keep responses concise for chat contexts.
```

## Heartbeat (optional)

Configure periodic check-ins:

```json5
{
  agents: {
    list: [
      {
        id: "sharky",
        heartbeat: {
          every: "30m",
          target: "whatsapp",
          to: "+15551234567",
          activeHours: { start: "09:00", end: "22:00", timezone: "Asia/Kolkata" },
        },
      },
    ],
  },
}
```

## Group chat mentions

If sharky is in group chats, configure mention patterns so it only
responds when mentioned:

```json5
{
  agents: {
    list: [
      {
        id: "sharky",
        groupChat: {
          mentionPatterns: ["@sharky", "@Sharky", "sharky"],
        },
      },
    ],
  },
}
```

## Tool and sandbox configuration

Restrict or expand sharky's capabilities:

```json5
{
  agents: {
    list: [
      {
        id: "sharky",
        // Full access (default)
        sandbox: { mode: "off" },

        // Or restrict tools for safety
        tools: {
          allow: ["exec", "read", "write", "edit", "browser"],
          deny: ["cron"],
        },
      },
    ],
  },
}
```

## Multi-agent isolation

Sharky runs in a fully isolated context:

- **Separate workspace**: `~/.openclaw/workspace-sharky/`
- **Separate auth**: `~/.openclaw/agents/sharky/agent/auth-profiles.json`
- **Separate sessions**: `~/.openclaw/agents/sharky/sessions/`
- **No cross-talk**: sharky cannot see soham's workspace or sessions unless explicitly enabled.

To enable agent-to-agent communication:

```json5
{
  tools: {
    agentToAgent: {
      enabled: true,
      allow: ["sharky", "soham"],
    },
  },
}
```

## CLI management

```bash
# Add sharky agent
openclaw agents add sharky --workspace ~/.openclaw/workspace-sharky

# Set identity
openclaw agents set-identity --agent sharky --name "Sharky" --emoji "🦈"

# List agents and bindings
openclaw agents list --bindings

# Check agent status
openclaw agents status
```
