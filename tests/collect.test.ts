import { describe, expect, test, vi } from "vitest";
import { collectAiNews, sourceFromUrl } from "../src/collect.js";

describe("collectAiNews", () => {
  test("normalizes Tavily results and filters items older than 24 hours or without URLs", async () => {
    const now = new Date("2026-05-28T02:00:00.000Z");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "OpenAI releases a new enterprise feature",
            url: "https://openai.com/news/product?utm_source=x",
            content: "A product update for enterprise customers.",
            published_date: "2026-05-28T01:00:00.000Z",
            score: 0.92
          },
          {
            title: "No URL item",
            content: "Missing URL"
          },
          {
            title: "Old AI story",
            url: "https://example.com/old",
            content: "Too old",
            published_date: "2026-05-26T01:00:00.000Z"
          }
        ]
      })
    })) as unknown as typeof fetch;

    const articles = await collectAiNews({
      apiKey: "tvly-key",
      fetchImpl,
      now,
      maxResultsPerQuery: 3
    });

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      title: "OpenAI releases a new enterprise feature",
      url: "https://openai.com/news/product?utm_source=x",
      source: "openai.com",
      snippet: "A product update for enterprise customers.",
      publishedAt: "2026-05-28T01:00:00.000Z",
      score: 0.92
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tvly-key",
          "Content-Type": "application/json"
        })
      })
    );
  });

  test("derives readable source names from URLs", () => {
    expect(sourceFromUrl("https://www.jiqizhixin.com/articles/123")).toBe(
      "jiqizhixin.com"
    );
  });
});
