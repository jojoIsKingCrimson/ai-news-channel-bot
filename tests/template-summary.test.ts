import { describe, expect, test } from "vitest";
import { summarizeTemplateDigest } from "../src/template-summary.js";

describe("summarizeTemplateDigest", () => {
  test("builds a Chinese digest without OpenAI", () => {
    const digest = summarizeTemplateDigest(
      [
        {
          title: "OpenAI ships an AI product update",
          url: "https://openai.com/news/product",
          source: "openai.com",
          snippet: "A product update for enterprise customers."
        }
      ],
      {
        itemLimit: 5,
        now: new Date("2026-05-28T02:00:00.000Z")
      }
    );

    expect(digest).toEqual({
      date: "2026-05-28",
      headline: "今日基于 RSS/搜索结果整理 1 条 AI 产品与行业动态。",
      items: [
        {
          title: "OpenAI ships an AI product update",
          source: "openai.com",
          url: "https://openai.com/news/product",
          summary: "A product update for enterprise customers.",
          impact: "已保留原始来源摘要；建议阅读全文确认细节。"
        }
      ]
    });
  });

  test("cleans boilerplate and keeps fallback summaries short", () => {
    const digest = summarizeTemplateDigest(
      [
        {
          title:
            "Running AI in Glass: Research Achievements of Huazhong University of Science and Technology and Shanghai Jiao Tong University Published in Nature Sub-journal",
          url: "https://eu.36kr.com/en/p/3828667003982464",
          source: "eu.36kr.com",
          snippet:
            "36kr Europe delivers global business and markets news, data, analysis, and video to the world, dedicated to building value and providing business service for companies’ global expansion. © 2024 36kr.com. All rights reserved. [...] Home Article # Running AI in glass: teams wrote a programmable photonic neural network inside glass for AI computing."
        }
      ],
      {
        itemLimit: 5,
        now: new Date("2026-05-28T02:00:00.000Z")
      }
    );

    expect(digest.items[0].summary).toContain("programmable photonic neural network");
    expect(digest.items[0].summary).not.toMatch(/36kr Europe delivers|All rights reserved|Home Article|\[\.\.\.\]/);
    expect(digest.items[0].summary.length).toBeLessThanOrEqual(120);
  });
});
