import { describe, expect, test, vi } from "vitest";
import { summarizeDigest } from "../src/summarize.js";
import type { ArticleCandidate } from "../src/types.js";

const articles: ArticleCandidate[] = [
  {
    title: "OpenAI ships a new enterprise agent feature",
    url: "https://openai.com/news/agent",
    source: "openai.com",
    snippet: "OpenAI introduced a feature for enterprise agent workflows."
  },
  {
    title: "Chinese AI app reaches new usage milestone",
    url: "https://example.cn/ai-app",
    source: "example.cn",
    snippet: "A Chinese AI product reported a new user milestone."
  }
];

describe("summarizeDigest", () => {
  test("asks an OpenAI-compatible chat completion API for structured Chinese digest JSON", async () => {
    const client = {
      chat: {
        completions: {
        create: vi.fn(async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  date: "2026-05-28",
                  headline: "今日 AI 产品动态集中在企业智能体和中文应用增长。",
                  items: [
                    {
                      title: "OpenAI 推出企业智能体能力",
                      source: "openai.com",
                      url: "https://openai.com/news/agent",
                      summary: "OpenAI 更新企业智能体工作流能力，面向组织协作场景。",
                      impact: "企业客户会更容易把 AI agent 纳入内部流程。"
                    },
                    {
                      title: "中文 AI 应用增长",
                      source: "example.cn",
                      url: "https://example.cn/ai-app",
                      summary: "一款中文 AI 应用公布新的用户里程碑。",
                      impact: "中文 AI 产品仍在争夺大众入口。"
                    }
                  ]
                })
              }
            }
          ]
        }))
      }
      }
    };

    const digest = await summarizeDigest(articles, {
      client,
      model: "kimi-k2.6",
      itemLimit: 5,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(digest.items).toHaveLength(2);
    expect(digest.headline).toContain("AI");
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "kimi-k2.6",
        response_format: { type: "json_object" },
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("如果候选数量足够，必须输出 5 条")
          })
        ])
      })
    );
    expect(client.chat.completions.create.mock.calls[0][0]).not.toHaveProperty(
      "temperature"
    );
  });

  test("throws a helpful error when the LLM returns invalid JSON", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: "not json" } }]
          }))
        }
      }
    };

    await expect(
      summarizeDigest(articles, {
        client,
        model: "gpt-5-mini",
        itemLimit: 5,
        now: new Date("2026-05-28T02:00:00.000Z")
      })
    ).rejects.toThrow("LLM response was not valid digest JSON");
  });

  test("extracts digest JSON when the LLM wraps it in prose or a code fence", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: [
                    "下面是整理结果：",
                    "```json",
                    JSON.stringify({
                      date: "2026-05-28",
                      headline: "今日 AI 产品动态集中在企业智能体。",
                      items: [
                        {
                          title: "OpenAI 推出企业智能体能力",
                          source: "openai.com",
                          url: "https://openai.com/news/agent",
                          summary: "OpenAI 更新企业智能体工作流能力。",
                          impact: "企业客户会更容易把 AI agent 纳入内部流程。"
                        }
                      ]
                    }),
                    "```"
                  ].join("\n")
                }
              }
            ]
          }))
        }
      }
    };

    const digest = await summarizeDigest(articles, {
      client,
      model: "kimi-k2.6",
      itemLimit: 5,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(digest.items).toHaveLength(1);
    expect(digest.items[0].title).toBe("OpenAI 推出企业智能体能力");
  });

  test("keeps Kimi requests compact and uses max_tokens to avoid empty length responses", async () => {
    const longArticles = Array.from({ length: 20 }, (_, index) => ({
      title: `AI product update ${index + 1}`,
      url: `https://example.com/news-${index + 1}`,
      source: "example.com",
      snippet:
        "36kr Europe delivers global business and markets news, data, analysis, and video to the world. " +
        "A team released a new AI workflow product for enterprise automation. ".repeat(80)
    }));
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    date: "2026-05-28",
                    headline: "今日 AI 产品动态集中在企业自动化。",
                    items: [
                      {
                        title: "企业 AI 工作流产品更新",
                        source: "example.com",
                        url: "https://example.com/news-1",
                        summary: "企业自动化产品继续更新。",
                        impact: "AI 工作流正在进入更多企业场景。"
                      }
                    ]
                  })
                }
              }
            ]
          }))
        }
      }
    };

    await summarizeDigest(longArticles, {
      client,
      model: "kimi-k2.6",
      itemLimit: 9,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    const input = client.chat.completions.create.mock.calls[0][0];
    const userPrompt = input.messages.find((message: any) => message.role === "user").content;

    expect(input.max_tokens).toBe(4096);
    expect(input.thinking).toEqual({ type: "disabled" });
    expect(input).not.toHaveProperty("max_completion_tokens");
    expect(userPrompt.length).toBeLessThan(9000);
    expect(userPrompt).not.toContain("delivers global business and markets news");
  });
});
