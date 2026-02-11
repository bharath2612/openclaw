# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **See also: `AGENTS.md`** for detailed operational guidelines (commit workflow, multi-agent safety, VM ops, release process, naming conventions, docs linking, security tips).

## MANDATORY: Changelog on Every Change

**Every single time you make a change — feature, fix, refactor, docs, ANYTHING — you MUST add an entry to `CHANGELOG.md` before committing. No exceptions.**

- Add entries under the current date section (format: `## YYYY.M.D`)
- If today's section doesn't exist, create it at the top (below the header)
- Use subsections: `### Added`, `### Fixes`, `### Changed`, `### Docs`, `### Learnings`
- Include a timestamp and a brief summary of what changed and why
- Include any learnings or insights discovered during the work
- Always stage `CHANGELOG.md` alongside your code changes

## Build & Dev Commands

```bash
# Pre-commit check (format + typecheck + lint)
pnpm check

# TypeScript type-check only
pnpm tsgo

# Build (compile TS, bundle UI, generate DTS)
pnpm build

# Lint and format
pnpm lint                     # Oxlint with type awareness
pnpm lint:fix                 # Lint + auto-fix + format
pnpm format                   # Oxfmt (import sorting)

# Run CLI in dev (no build needed, uses tsx)
pnpm openclaw <command>       # e.g. pnpm openclaw gateway run
pnpm dev                      # alias

# Gateway dev
pnpm gateway:watch            # Auto-reload on TS changes
pnpm gateway:dev              # Gateway with channels skipped
```

## Testing

```bash
pnpm test                     # All unit tests (vitest, parallel forks)
pnpm test src/path/file.test.ts   # Single test file
pnpm test --grep "pattern"    # Tests matching pattern
pnpm test:watch               # Watch mode
pnpm test:coverage            # V8 coverage (70% thresholds)
pnpm test:e2e                 # End-to-end tests
pnpm test:live                # Live tests (needs OPENCLAW_LIVE_TEST=1)
```

Tests are colocated: `feature.ts` + `feature.test.ts`. E2E tests use `*.e2e.test.ts`. Framework is Vitest with forks pool, 120s timeout.

## Committing

Use `scripts/committer "<msg>" <file...>` instead of manual `git add`/`git commit`. Conventional commit format: `feat(scope): message`, `fix(scope): message`, `docs(scope): message`. Always update `CHANGELOG.md` (see rule above).

## Architecture Overview

OpenClaw is a multi-channel AI gateway. CLI/UI connects to a WebSocket gateway that orchestrates agents and messaging channels.

```
CLI / Web UI
    │ WebSocket (MessagePack RPC)
    ▼
┌─ Gateway (Control Plane) ─────────────────────────┐
│  HTTP server: /hooks/*, /v1/chat/completions,      │
│               /v1/responses, /canvas-host           │
│  RPC methods: agent.*, chat.*, send.*, cron.*,     │
│               sessions.*, channels.*, config.*      │
│  Subsystems: sessions, config, auth, cron, hooks   │
└────┬───────────────────────────────────┬───────────┘
     │                                   │
     ▼                                   ▼
  Agents (Pi Runtime)              Channels
  • Tool execution (bash,          • WhatsApp, Telegram,
    browser, web search,             Discord, Slack, Signal,
    memory, canvas, cron)            iMessage, LINE, Google Chat
  • Model fallback chains          • Extensions: Matrix, MS Teams,
  • Session transcripts              Zalo, BlueBubbles, etc.
  • Sandboxed execution            • Auto-reply formatting
```

### Key Subsystems

**Gateway** (`src/gateway/`): Central WebSocket + HTTP server. `server.impl.ts` starts Express + WS. `server-http.ts` handles REST endpoints. `server-methods/` implements RPC methods. `protocol/` is MessagePack-based binary RPC.

**Agents** (`src/agents/`): Pi-based AI agents with streaming tool execution. `agent-scope.ts` resolves agent config (workspace, model, skills). `pi-embedded-runner/` orchestrates the agent loop: resolve model → build session → call LLM → stream response → execute tools → handle compaction. Tools live in `agents/tools/`.

**Hooks/Webhooks** (`src/gateway/hooks.ts`, `hooks-mapping.ts`): External HTTP webhooks → agent messages. Token-authenticated. Mapping system with presets (gmail, github) and custom mappings with `{{mustache}}` templates. Transform modules for advanced payload processing. Security wrapping via `src/security/external-content.ts` — webhook sources get lighter warnings than email sources.

**Channels** (`src/channels/`, `src/telegram/`, `src/discord/`, etc.): Plugin-based messaging integrations. Each provides adapters: messaging, outbound, security, commands, mentions, threads. Registry in `src/channels/registry.ts`. Extensions in `extensions/*/`.

**Config** (`src/config/`): Zod-validated JSON5 config at `~/.openclaw/config.json`. Schema in `zod-schema.ts`. Supports `${ENV_VAR}` substitution, file includes, and legacy migration. Split types in `types.*.ts`.

**Sessions** (`src/gateway/session-utils.ts`): Keyed by channel+user (e.g. `telegram:123@user456`). Stored as JSONLines in `~/.openclaw/sessions/`. Write-locked to prevent concurrent modifications. Scope modes: per-sender, global, per-peer, per-channel-peer.

**Cron** (`src/cron/`): Scheduled agent tasks. Jobs defined in config, executed as isolated agent turns with session key `cron:{jobId}`.

**Security** (`src/security/`): External content wrapping with boundary markers. Source-aware: webhooks get `WEBHOOK_CONTENT_WARNING` (lighter, data-encouraging), emails get `SECURITY_NOTICE` (heavy, anti-injection). DM pairing and allowlists in `src/pairing/`.

**Auto-reply** (`src/auto-reply/`): Converts agent responses → channel-specific format. Handles chunking, delivery retry, reaction/typing feedback.

**Group mention gating** (`src/web/auto-reply/monitor/group-gating.ts`): Controls when agents activate in group chats. Agents activate on: explicit @mention, body matching agent name/emoji pattern, or replying to the agent's message (implicit mention). **Emoji-gated implicit mention**: when multiple agents share one WhatsApp number, replying to an agent message only activates the agent whose emoji (e.g. 🦈 Sharky, 🧞 Soham) appears in the quoted message body. If no emoji is configured, falls back to JID match (old behavior).

### Webhook → Agent Flow

```
HTTP POST /hooks/github
  → token auth (server-http.ts)
  → mapping resolution (hooks-mapping.ts) — match path, render {{template}}
  → dispatch to agent (hooks.ts) — create session, queue message
  → agent run (pi-embedded-runner/) — LLM call with security-wrapped content
  → auto-reply → channel delivery
```

### Extension System

Extensions live in `extensions/*/` as workspace packages. Each has its own `package.json` with `openclaw.extensions` field. Plugin-only deps go in the extension `package.json`, not root. Use `devDependencies` or `peerDependencies` for `openclaw` (not `dependencies` — breaks npm install).

## Production Deployment (VPS)

OpenClaw runs on a VPS at `46.224.209.36` behind `lasco-api.prop8t.ai`. This is the production environment — do NOT confuse local dev with production.

**Stack:**

- **Nginx** on VPS terminates TLS (Let's Encrypt), routes `/hooks/` → `127.0.0.1:18789` (gateway), `/` → port 3001 (WebSocket)
- **Docker Compose** runs `openclaw-gateway` (port 18789, `--bind lan`) and `openclaw-cli`
- **Config** lives at `/root/.openclaw/openclaw.json` on VPS (bind-mounted into container)
- **Gateway token auth**: `OPENCLAW_GATEWAY_TOKEN` env var in docker-compose
- **Webhook token**: `prop8t-webhook-secret-2026` (in hooks config)

**Agents on VPS:**

| Agent                | Workspace                         | WhatsApp Groups                                           |
| -------------------- | --------------------------------- | --------------------------------------------------------- |
| `blueshark` (Sharky) | `~/.openclaw/workspace-blueshark` | `917977789547-1599546567@g.us`, `120363424174853623@g.us` |
| `soham` (Soham)      | `~/.openclaw/workspace-soham`     | `120363395222679666@g.us`, `120363424579029844@g.us`      |

Soham is a build notification character — "Senior Dev / DevOps" persona who roasts team members. His personality and build notification playbook are in `~/.openclaw/workspace-soham/SOUL.md` on VPS.

**Team members** (used in author mapping): bharath, vijay (vijay-hozo), nikhil (nikhil raikwar), arun (arun raghav)

### Build Notification Pipeline

**IMPORTANT: The product (`prop8t-worker`) is a Cloudflare WORKER — NOT Cloudflare Pages. Never confuse these. Build/deploy events come from Cloudflare Workers deployments.**

```
Cloudflare Workers deployment event (prop8t-worker deploys)
    │
    ▼
Cloudflare Queue: "build-notifier"
    │
    ▼
CF Worker: prop8t-deploy-notifier (queue consumer)
    │  Source: /root/prop8t-deploy-notifier/ on VPS
    │  - Generates funny prompt based on build status (started/succeeded/failed/canceled)
    │  - Maps git authors to first names via AUTHOR_MAP
    │  - Sends to SOHAM_GROUP_1 (main prop8t group only)
    ▼
POST https://lasco-api.prop8t.ai/hooks/
    │  Bearer token: prop8t-webhook-secret-2026
    │  Payload: { agentId: 'soham', deliver: true, wakeMode: 'now', channel: 'whatsapp' }
    ▼
Nginx → OpenClaw Gateway (Docker, port 18789)
    │  Routes to soham agent, creates session, runs LLM
    ▼
WhatsApp delivery via Baileys → group messages
```

The Cloudflare Worker bypasses the gateway's mapping system — it sends payloads with explicit `agentId`, `deliver`, `channel`, and `to` fields directly. The gateway's `hooks-mapping.ts` presets/mappings are used for other webhook sources (e.g., raw GitHub webhooks).

### CF Worker Deployment & Debugging Rules

**Deploying `prop8t-deploy-notifier`** (separate from the openclaw VPS deploy):

```bash
ssh root@46.224.209.36 'cd /root/prop8t-deploy-notifier && CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy'
```

- The CF Worker is deployed via `wrangler deploy`, NOT via git push. It lives only on the VPS at `/root/prop8t-deploy-notifier/`.
- Needs `CLOUDFLARE_API_TOKEN` — no stored credentials on VPS. Token is NOT the same as the webhook token.
- `wrangler tail` also needs the token: `CLOUDFLARE_API_TOKEN=<token> npx wrangler tail`

**Key learnings (2026.2.11):**

- The `BuildEvent` interface in the CF Worker may not match the actual Cloudflare event payload structure. The documented schema shows `buildTriggerMetadata` nested under `payload`, but the real event may have fields at different paths.
- **Debug technique**: When `buildTriggerMetadata` fields are empty/missing (causing "unknown by someone" messages), replace `buildPrompt(event)` with `JSON.stringify(event)` and send the raw JSON as the prompt. The LLM will extract the correct info, AND you can see the actual field structure in the WhatsApp output.
- `buildTriggerMetadata` is only populated for `push_event` triggers (git push via Cloudflare Builds integration). Manual/dashboard/API deploys won't have git metadata.
- The `author` field in `buildTriggerMetadata` is an **email address** (e.g., `developer@example.com`). The `resolveAuthor()` function strips the domain before matching against `AUTHOR_MAP`.
- Soham currently sends to **one group only** (`SOHAM_GROUP_1`), not both.

### MANDATORY: Deploy to VPS After Every Push

**Every time you push code to GitHub, you MUST deploy to the VPS. The VPS runs OpenClaw in Docker — it does NOT auto-deploy. If you skip this, production stays on stale code.**

```bash
ssh root@46.224.209.36 'cd /root/openclaw && git pull && docker build -t openclaw:latest . && docker compose up -d openclaw-gateway'
```

Verify it's running:

```bash
ssh root@46.224.209.36 'cd /root/openclaw && docker compose logs --tail 10 openclaw-gateway'
```

### SSH Access

```bash
ssh root@46.224.209.36           # VPS shell
# Key paths:
#   /root/.openclaw/openclaw.json          — main config
#   /root/.openclaw/workspace-soham/       — soham workspace (AGENTS.md, SOUL.md, scripts/)
#   /root/.openclaw/workspace-blueshark/   — blueshark workspace
#   /root/openclaw/docker-compose.yml      — docker services
#   /root/prop8t-deploy-notifier/          — Cloudflare Worker source
#   /etc/nginx/sites-enabled/lasco-api     — nginx reverse proxy

# Common operations:
cd /root/openclaw && docker compose logs --tail 100 openclaw-gateway  # gateway logs
cd /root/openclaw && docker compose restart openclaw-gateway          # restart gateway
cat /root/.openclaw/openclaw.json                                     # view config
```

## Code Conventions

- **ESM with `.js` extensions** in all imports: `import { x } from "./x.js"`
- **Strict TypeScript**, avoid `any`. Use Zod for runtime validation.
- **Named exports** over default exports
- **Dependency injection** via `createDefaultDeps()` pattern
- **Files under ~500 LOC** (guideline); split/refactor when clarity improves
- **Oxlint + Oxfmt** for linting/formatting; run `pnpm check` before commits
- **Tool schemas**: avoid `Type.Union`/`anyOf`/`oneOf`; use `stringEnum`/`optionalStringEnum` for string lists; keep top-level schema as `type: "object"`
- **Patched dependencies** (`pnpm.patchedDependencies`) must use exact versions (no `^`/`~`)
- **CLI progress**: use `src/cli/progress.ts` (osc-progress + clack); don't hand-roll spinners
- **Never update the Carbon dependency**
