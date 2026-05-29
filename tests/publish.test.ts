import { describe, expect, test, vi } from "vitest";
import {
  escapeHtml,
  formatDigestHtml,
  sendDigest,
  splitTelegramMessages
} from "../src/publish.js";
import type { Digest } from "../src/types.js";

const digest: Digest = {
  date: "2026-05-28",
  headline: "今日 AI 产品更新集中在 agent 和企业场景。",
  productHunt: [
    {
      name: "Agent Desk",
      url: "https://www.producthunt.com/posts/agent-desk",
      tagline: "AI Agent 团队协作工作台",
      votes: 128
    }
  ],
  githubTrending: [
    {
      repository: "owner/agent-kit",
      url: "https://github.com/owner/agent-kit",
      description: "构建 AI Agent 的工具包",
      language: "TypeScript",
      stars: "12.3k",
      starsToday: "320"
    }
  ],
  items: [
    {
      title: "OpenAI 推出企业能力 (preview)",
      source: "openai.com",
      url: "https://openai.com/news/agent",
      summary: "新能力帮助团队搭建 AI agent。",
      impact: "企业采用门槛继续降低。"
    }
  ]
};

describe("formatDigestMarkdown", () => {
  test("formats an AI Daily HTML digest like the requested channel summary", () => {
    expect(escapeHtml("OpenAI <preview> & more")).toBe(
      "OpenAI &lt;preview&gt; &amp; more"
    );

    const message = formatDigestHtml(digest);

    expect(message).toContain("📡 <b>2026-05-28 AI Daily</b>");
    expect(message).toContain("📰 <b>AI重要新闻（1条）</b>");
    expect(message).toContain(
      '·<a href="https://openai.com/news/agent">OpenAI 推出企业能力 (preview)</a>'
    );
    expect(message).toContain("新能力帮助团队搭建 AI agent。");
    expect(message).not.toContain("企业采用门槛继续降低。");
    expect(message).toContain("🚀 <b>Product Hunt Top 5:</b>");
    expect(message).toContain(
      '1. <a href="https://www.producthunt.com/posts/agent-desk">Agent Desk</a> - AI Agent 团队协作工作台'
    );
    expect(message).toContain("🔥 <b>GitHub Trending Top 5:</b>");
    expect(message).toContain(
      '1. <a href="https://github.com/owner/agent-kit">owner/agent-kit</a> - 构建 AI Agent 的工具包 ⭐+320'
    );
  });
});

describe("splitTelegramMessages", () => {
  test("splits long messages below Telegram limits", () => {
    const parts = splitTelegramMessages("a".repeat(8) + "\n\n" + "b".repeat(8), 10);

    expect(parts).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  });

  test("does not split inside Telegram HTML tags", () => {
    const message = [
      '·<a href="https://example.com/news?' +
        "utm=".repeat(20) +
        '">Long linked title</a>，' +
        "x".repeat(120),
      '·<a href="https://example.com/next">Next title</a>，short'
    ].join("\n");

    const parts = splitTelegramMessages(message, 90);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 90)).toBe(true);
    expect(parts.every((part) => hasBalancedHtmlTags(part))).toBe(true);
  });
});

function hasBalancedHtmlTags(value: string): boolean {
  const openingAnchors = value.match(/<a\b/g)?.length ?? 0;
  const closingAnchors = value.match(/<\/a>/g)?.length ?? 0;
  const openingBold = value.match(/<b>/g)?.length ?? 0;
  const closingBold = value.match(/<\/b>/g)?.length ?? 0;
  return openingAnchors === closingAnchors && openingBold === closingBold;
}

describe("sendDigest", () => {
  test("sends HTML messages to the configured channel", async () => {
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };

    await sendDigest(telegram, "@ai_daily", digest, 4096);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "@ai_daily",
      expect.stringContaining("📡 <b>2026-05-28 AI Daily</b>"),
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
  });
});
