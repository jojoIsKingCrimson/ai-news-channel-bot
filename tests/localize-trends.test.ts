import { describe, expect, test, vi } from "vitest";
import { localizePulseTrends } from "../src/localize-trends.js";
import type { PulseTrends } from "../src/trends.js";

const trends: PulseTrends = {
  productHunt: [
    {
      name: "Agent Desk",
      url: "https://www.producthunt.com/posts/agent-desk",
      tagline: "A workspace for AI agents",
      votes: 128
    }
  ],
  githubTrending: [
    {
      repository: "owner/agent-kit",
      url: "https://github.com/owner/agent-kit",
      description: "Toolkit for building AI agents",
      starsToday: "320"
    }
  ]
};

describe("localizePulseTrends", () => {
  test("rewrites Product Hunt and GitHub descriptions as one short Chinese sentence", async () => {
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    productHunt: [
                      {
                        url: "https://www.producthunt.com/posts/agent-desk",
                        tagline: "AI Agent 团队协作工作台"
                      }
                    ],
                    githubTrending: [
                      {
                        url: "https://github.com/owner/agent-kit",
                        description: "构建 AI Agent 的工具包"
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

    const localized = await localizePulseTrends(trends, {
      client,
      model: "kimi-k2.6"
    });

    expect(localized.productHunt[0]).toMatchObject({
      name: "Agent Desk",
      votes: 128,
      tagline: "AI Agent 团队协作工作台"
    });
    expect(localized.githubTrending[0]).toMatchObject({
      repository: "owner/agent-kit",
      starsToday: "320",
      description: "构建 AI Agent 的工具包"
    });

    const input = client.chat.completions.create.mock.calls[0][0];
    const prompt = input.messages.find((message: any) => message.role === "user").content;
    expect(prompt).toContain("每条只输出一句简短中文");
    expect(input.max_tokens).toBe(1200);
    expect(input.thinking).toEqual({ type: "disabled" });
  });

  test("keeps original trends when the LLM response is invalid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: "not json" } }]
          }))
        }
      }
    };

    const localized = await localizePulseTrends(trends, {
      client,
      model: "gpt-5-mini"
    });

    expect(localized).toEqual(trends);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("LLM trend localization failed"),
      expect.any(Error)
    );
    warn.mockRestore();
  });
});
