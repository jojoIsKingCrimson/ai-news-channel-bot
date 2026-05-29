import { describe, expect, test, vi } from "vitest";
import { collectDigestArticles } from "../src/digest.js";
import type { AppConfig } from "../src/types.js";

const config: AppConfig = {
  telegramBotToken: "123:abc",
  telegramChannelId: "@ai_daily",
  tavilyApiKey: "tvly-key",
  llmApiKey: "sk-key",
  llmBaseUrl: "https://api.moonshot.cn/v1",
  llmModel: "kimi-k2.6",
  timezone: "Asia/Shanghai",
  digestCron: "0 10 * * *",
  digestItemLimit: 9,
  stateFile: ".data/state.json",
  telegramAdminUserIds: ["42"],
  rssFeedUrls: ["https://feeds.example.com/ai.xml"],
  includeTrends: false,
  trendItemLimit: 5
};

describe("collectDigestArticles", () => {
  test("merges Tavily results with RSS candidates when both are configured", async () => {
    let tavilyCallCount = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("api.tavily.com")) {
        tavilyCallCount += 1;
        return {
          ok: true,
          json: async () => ({
            results:
              tavilyCallCount === 1
                ? [
                    {
                      title: "OpenAI ships enterprise AI agent workflows",
                      url: "https://openai.com/news/agent-workflows",
                      content: "OpenAI announced an enterprise AI agent update.",
                      published_date: "2026-05-28T01:00:00.000Z"
                    }
                  ]
                : []
          })
        };
      }

      return {
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss>
            <channel>
              <item>
                <title>Google expands Gemini for Business</title>
                <link>https://example.com/gemini-business</link>
                <description>Google added new collaboration features.</description>
                <pubDate>Thu, 28 May 2026 01:30:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`
      };
    }) as unknown as typeof fetch;

    const articles = await collectDigestArticles(config, {
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(articles.map((article) => article.title)).toEqual([
      "OpenAI ships enterprise AI agent workflows",
      "Google expands Gemini for Business"
    ]);
  });
});
