import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyHookMappings, resolveHookMappings } from "./hooks-mapping.js";

const baseUrl = new URL("http://127.0.0.1:18789/hooks/gmail");

describe("hooks mapping", () => {
  it("resolves gmail preset", () => {
    const mappings = resolveHookMappings({ presets: ["gmail"] });
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings[0]?.matchPath).toBe("gmail");
  });

  it("renders template from payload", async () => {
    const mappings = resolveHookMappings({
      mappings: [
        {
          id: "demo",
          match: { path: "gmail" },
          action: "agent",
          messageTemplate: "Subject: {{messages[0].subject}}",
        },
      ],
    });
    const result = await applyHookMappings(mappings, {
      payload: { messages: [{ subject: "Hello" }] },
      headers: {},
      url: baseUrl,
      path: "gmail",
    });
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.action.kind).toBe("agent");
      expect(result.action.message).toBe("Subject: Hello");
    }
  });

  it("passes model override from mapping", async () => {
    const mappings = resolveHookMappings({
      mappings: [
        {
          id: "demo",
          match: { path: "gmail" },
          action: "agent",
          messageTemplate: "Subject: {{messages[0].subject}}",
          model: "openai/gpt-4.1-mini",
        },
      ],
    });
    const result = await applyHookMappings(mappings, {
      payload: { messages: [{ subject: "Hello" }] },
      headers: {},
      url: baseUrl,
      path: "gmail",
    });
    expect(result?.ok).toBe(true);
    if (result?.ok && result.action.kind === "agent") {
      expect(result.action.model).toBe("openai/gpt-4.1-mini");
    }
  });

  it("runs transform module", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-hooks-"));
    const modPath = path.join(dir, "transform.mjs");
    const placeholder = "${payload.name}";
    fs.writeFileSync(
      modPath,
      `export default ({ payload }) => ({ kind: "wake", text: \`Ping ${placeholder}\` });`,
    );

    const mappings = resolveHookMappings({
      transformsDir: dir,
      mappings: [
        {
          match: { path: "custom" },
          action: "agent",
          transform: { module: "transform.mjs" },
        },
      ],
    });

    const result = await applyHookMappings(mappings, {
      payload: { name: "Ada" },
      headers: {},
      url: new URL("http://127.0.0.1:18789/hooks/custom"),
      path: "custom",
    });

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.action.kind).toBe("wake");
      if (result.action.kind === "wake") {
        expect(result.action.text).toBe("Ping Ada");
      }
    }
  });

  it("treats null transform as a handled skip", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-hooks-skip-"));
    const modPath = path.join(dir, "transform.mjs");
    fs.writeFileSync(modPath, "export default () => null;");

    const mappings = resolveHookMappings({
      transformsDir: dir,
      mappings: [
        {
          match: { path: "skip" },
          action: "agent",
          transform: { module: "transform.mjs" },
        },
      ],
    });

    const result = await applyHookMappings(mappings, {
      payload: {},
      headers: {},
      url: new URL("http://127.0.0.1:18789/hooks/skip"),
      path: "skip",
    });

    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.action).toBeNull();
      expect("skipped" in result).toBe(true);
    }
  });

  it("prefers explicit mappings over presets", async () => {
    const mappings = resolveHookMappings({
      presets: ["gmail"],
      mappings: [
        {
          id: "override",
          match: { path: "gmail" },
          action: "agent",
          messageTemplate: "Override subject: {{messages[0].subject}}",
        },
      ],
    });
    const result = await applyHookMappings(mappings, {
      payload: { messages: [{ subject: "Hello" }] },
      headers: {},
      url: baseUrl,
      path: "gmail",
    });
    expect(result?.ok).toBe(true);
    if (result?.ok) {
      expect(result.action.kind).toBe("agent");
      expect(result.action.message).toBe("Override subject: Hello");
    }
  });

  it("passes agentId from mapping", async () => {
    const mappings = resolveHookMappings({
      mappings: [
        {
          id: "soham",
          match: { path: "soham" },
          action: "agent",
          agentId: "soham",
          messageTemplate: "Build event: {{event}}",
        },
      ],
    });
    const result = await applyHookMappings(mappings, {
      payload: { event: "build.succeeded" },
      headers: {},
      url: new URL("http://127.0.0.1:18789/hooks/soham"),
      path: "soham",
    });
    expect(result?.ok).toBe(true);
    if (result?.ok && result.action?.kind === "agent") {
      expect(result.action.agentId).toBe("soham");
      expect(result.action.message).toBe("Build event: build.succeeded");
    }
  });

  it("resolves github preset", () => {
    const mappings = resolveHookMappings({ presets: ["github"] });
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings[0]?.matchPath).toBe("github");
  });

  it("renders github preset with push payload", async () => {
    const mappings = resolveHookMappings({ presets: ["github"] });
    const result = await applyHookMappings(mappings, {
      payload: {
        ref: "refs/heads/feat/auth",
        sender: { login: "bharath" },
        repository: { full_name: "org/openclaw" },
        head_commit: { message: "fix: login flow" },
        compare: "https://github.com/org/openclaw/compare/abc...def",
      },
      headers: {
        "x-github-event": "push",
        "x-github-delivery": "delivery-123",
      },
      url: new URL("http://127.0.0.1:18789/hooks/github"),
      path: "github",
    });
    expect(result?.ok).toBe(true);
    if (result?.ok && result.action?.kind === "agent") {
      expect(result.action.message).toContain("push");
      expect(result.action.message).toContain("refs/heads/feat/auth");
      expect(result.action.message).toContain("bharath");
      expect(result.action.message).toContain("org/openclaw");
      expect(result.action.message).toContain("fix: login flow");
      expect(result.action.sessionKey).toBe("hook:github:delivery-123");
    }
  });

  it("renders _payload as full JSON in template", async () => {
    const mappings = resolveHookMappings({
      mappings: [
        {
          id: "dump",
          match: { path: "dump" },
          action: "agent",
          messageTemplate: "Payload: {{_payload}}",
        },
      ],
    });
    const result = await applyHookMappings(mappings, {
      payload: { branch: "main", author: "bharath" },
      headers: {},
      url: new URL("http://127.0.0.1:18789/hooks/dump"),
      path: "dump",
    });
    expect(result?.ok).toBe(true);
    if (result?.ok && result.action?.kind === "agent") {
      const msg = result.action.message;
      expect(msg).toContain('"branch":"main"');
      expect(msg).toContain('"author":"bharath"');
    }
  });

  it("rejects missing message", async () => {
    const mappings = resolveHookMappings({
      mappings: [{ match: { path: "noop" }, action: "agent" }],
    });
    const result = await applyHookMappings(mappings, {
      payload: {},
      headers: {},
      url: new URL("http://127.0.0.1:18789/hooks/noop"),
      path: "noop",
    });
    expect(result?.ok).toBe(false);
  });
});
