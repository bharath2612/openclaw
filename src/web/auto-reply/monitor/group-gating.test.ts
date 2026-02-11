import { describe, expect, it } from "vitest";
import { applyGroupGating } from "./group-gating.js";

const baseConfig = {
  channels: {
    whatsapp: {
      groupPolicy: "open",
      groups: { "*": { requireMention: true } },
    },
  },
  session: { store: "/tmp/openclaw-sessions.json" },
} as const;

describe("applyGroupGating", () => {
  it("treats reply-to-bot as implicit mention", () => {
    const groupHistories = new Map();
    const result = applyGroupGating({
      cfg: baseConfig as unknown as ReturnType<
        typeof import("../../../config/config.js").loadConfig
      >,
      msg: {
        id: "m1",
        from: "123@g.us",
        conversationId: "123@g.us",
        to: "+15550000",
        accountId: "default",
        body: "following up",
        timestamp: Date.now(),
        chatType: "group",
        chatId: "123@g.us",
        selfJid: "15551234567@s.whatsapp.net",
        selfE164: "+15551234567",
        replyToId: "m0",
        replyToBody: "bot said hi",
        replyToSender: "+15551234567",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
        sendComposing: async () => {},
        reply: async () => {},
        sendMedia: async () => {},
      },
      conversationId: "123@g.us",
      groupHistoryKey: "whatsapp:default:group:123@g.us",
      agentId: "main",
      sessionKey: "agent:main:whatsapp:group:123@g.us",
      baseMentionConfig: { mentionRegexes: [] },
      groupHistories,
      groupHistoryLimit: 10,
      groupMemberNames: new Map(),
      logVerbose: () => {},
      replyLogger: { debug: () => {} },
    });

    expect(result.shouldProcess).toBe(true);
  });

  it("allows implicit mention when quoted message contains agent emoji", () => {
    const configWithEmoji = {
      ...baseConfig,
      agents: { list: [{ id: "sharky", identity: { name: "Sharky", emoji: "🦈" } }] },
    };
    const result = applyGroupGating({
      cfg: configWithEmoji as unknown as ReturnType<
        typeof import("../../../config/config.js").loadConfig
      >,
      msg: {
        id: "m2",
        from: "123@g.us",
        conversationId: "123@g.us",
        to: "+15550000",
        accountId: "default",
        body: "nice one",
        timestamp: Date.now(),
        chatType: "group",
        chatId: "123@g.us",
        selfJid: "15551234567@s.whatsapp.net",
        selfE164: "+15551234567",
        replyToId: "m1",
        replyToBody: "🦈 GET IN! City 1-0 up!",
        replyToSender: "+15551234567",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
        sendComposing: async () => {},
        reply: async () => {},
        sendMedia: async () => {},
      },
      conversationId: "123@g.us",
      groupHistoryKey: "whatsapp:default:group:123@g.us",
      agentId: "sharky",
      sessionKey: "agent:sharky:whatsapp:group:123@g.us",
      baseMentionConfig: { mentionRegexes: [] },
      groupHistories: new Map(),
      groupHistoryLimit: 10,
      groupMemberNames: new Map(),
      logVerbose: () => {},
      replyLogger: { debug: () => {} },
    });
    expect(result.shouldProcess).toBe(true);
  });

  it("blocks implicit mention when quoted message has different agent emoji", () => {
    const configWithEmoji = {
      ...baseConfig,
      agents: { list: [{ id: "sharky", identity: { name: "Sharky", emoji: "🦈" } }] },
    };
    const result = applyGroupGating({
      cfg: configWithEmoji as unknown as ReturnType<
        typeof import("../../../config/config.js").loadConfig
      >,
      msg: {
        id: "m3",
        from: "123@g.us",
        conversationId: "123@g.us",
        to: "+15550000",
        accountId: "default",
        body: "lol nice roast",
        timestamp: Date.now(),
        chatType: "group",
        chatId: "123@g.us",
        selfJid: "15551234567@s.whatsapp.net",
        selfE164: "+15551234567",
        replyToId: "m1",
        replyToBody: "🧞 yo bharath just pushed some fire code",
        replyToSender: "+15551234567",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
        sendComposing: async () => {},
        reply: async () => {},
        sendMedia: async () => {},
      },
      conversationId: "123@g.us",
      groupHistoryKey: "whatsapp:default:group:123@g.us",
      agentId: "sharky",
      sessionKey: "agent:sharky:whatsapp:group:123@g.us",
      baseMentionConfig: { mentionRegexes: [] },
      groupHistories: new Map(),
      groupHistoryLimit: 10,
      groupMemberNames: new Map(),
      logVerbose: () => {},
      replyLogger: { debug: () => {} },
    });
    expect(result.shouldProcess).toBe(false);
  });

  it("falls back to JID match when agent has no emoji configured", () => {
    const result = applyGroupGating({
      cfg: baseConfig as unknown as ReturnType<
        typeof import("../../../config/config.js").loadConfig
      >,
      msg: {
        id: "m4",
        from: "123@g.us",
        conversationId: "123@g.us",
        to: "+15550000",
        accountId: "default",
        body: "hey",
        timestamp: Date.now(),
        chatType: "group",
        chatId: "123@g.us",
        selfJid: "15551234567@s.whatsapp.net",
        selfE164: "+15551234567",
        replyToId: "m1",
        replyToBody: "some agent message without emoji",
        replyToSender: "+15551234567",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
        sendComposing: async () => {},
        reply: async () => {},
        sendMedia: async () => {},
      },
      conversationId: "123@g.us",
      groupHistoryKey: "whatsapp:default:group:123@g.us",
      agentId: "main",
      sessionKey: "agent:main:whatsapp:group:123@g.us",
      baseMentionConfig: { mentionRegexes: [] },
      groupHistories: new Map(),
      groupHistoryLimit: 10,
      groupMemberNames: new Map(),
      logVerbose: () => {},
      replyLogger: { debug: () => {} },
    });
    expect(result.shouldProcess).toBe(true);
  });
});
