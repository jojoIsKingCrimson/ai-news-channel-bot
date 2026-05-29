import { describe, expect, test, vi } from "vitest";
import { collectRssNews } from "../src/rss.js";

describe("collectRssNews", () => {
  test("parses RSS items and filters entries older than 24 hours", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>OpenAI releases a product update</title>
              <link>https://openai.com/news/product</link>
              <description>OpenAI updated an AI product.</description>
              <pubDate>Thu, 28 May 2026 01:00:00 GMT</pubDate>
            </item>
            <item>
              <title>Old AI story</title>
              <link>https://example.com/old</link>
              <description>Too old.</description>
              <pubDate>Tue, 26 May 2026 01:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`
    })) as unknown as typeof fetch;

    const articles = await collectRssNews({
      feedUrls: ["https://feeds.example.com/ai.xml"],
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(articles).toEqual([
      {
        title: "OpenAI releases a product update",
        url: "https://openai.com/news/product",
        source: "openai.com",
        snippet: "OpenAI updated an AI product.",
        publishedAt: "2026-05-28T01:00:00.000Z",
        query: "rss:https://feeds.example.com/ai.xml"
      }
    ]);
  });

  test("parses Atom entries", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <feed>
          <entry>
            <title>Anthropic launches a new Claude feature</title>
            <link href="https://anthropic.com/news/claude-feature" />
            <summary>A new product feature shipped.</summary>
            <updated>2026-05-28T01:30:00.000Z</updated>
          </entry>
        </feed>`
    })) as unknown as typeof fetch;

    const articles = await collectRssNews({
      feedUrls: ["https://feeds.example.com/atom.xml"],
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(articles[0]).toMatchObject({
      title: "Anthropic launches a new Claude feature",
      url: "https://anthropic.com/news/claude-feature",
      source: "anthropic.com",
      snippet: "A new product feature shipped.",
      publishedAt: "2026-05-28T01:30:00.000Z"
    });
  });
});
