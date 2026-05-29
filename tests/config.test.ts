import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

const requiredEnv = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHANNEL_ID: "@ai_daily"
};

describe("loadConfig", () => {
  test("throws a clear error when required environment variables are missing", () => {
    expect(() => loadConfig({ ...requiredEnv, TELEGRAM_BOT_TOKEN: "" })).toThrow(
      "Missing required environment variable: TELEGRAM_BOT_TOKEN"
    );
  });

  test("loads required settings and fallback defaults without Tavily or LLM keys", () => {
    const config = loadConfig(requiredEnv);

    expect(config).toMatchObject({
      telegramBotToken: "123:abc",
      telegramChannelId: "@ai_daily",
      tavilyApiKey: undefined,
      llmApiKey: undefined,
      llmBaseUrl: undefined,
      llmModel: "gpt-5-mini",
      timezone: "Asia/Shanghai",
      digestCron: "0 10 * * *",
      digestItemLimit: 9,
      stateFile: ".data/state.json",
      telegramAdminUserIds: [],
      includeTrends: true,
      trendItemLimit: 5,
      rssFeedUrls: expect.arrayContaining([
        "https://news.google.com/rss/search?q=AI%20OR%20%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
        "https://www.technologyreview.com/topic/artificial-intelligence/feed/"
      ])
    });
  });

  test("loads optional Tavily and OpenAI-compatible LLM settings when present", () => {
    const config = loadConfig({
      ...requiredEnv,
      TAVILY_API_KEY: "tvly-key",
      LLM_API_KEY: "llm-key",
      LLM_BASE_URL: "https://api.moonshot.ai/v1",
      LLM_MODEL: "kimi-k2.6",
      TELEGRAM_ADMIN_USER_IDS: "42, 10086",
      RSS_FEED_URLS: "https://example.com/a.xml, https://example.com/b.xml"
    });

    expect(config.tavilyApiKey).toBe("tvly-key");
    expect(config.llmApiKey).toBe("llm-key");
    expect(config.llmBaseUrl).toBe("https://api.moonshot.ai/v1");
    expect(config.llmModel).toBe("kimi-k2.6");
    expect(config.telegramAdminUserIds).toEqual(["42", "10086"]);
    expect(config.rssFeedUrls).toEqual(expect.arrayContaining([
      "https://news.google.com/rss/search?q=AI%20OR%20%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
      "https://example.com/a.xml",
      "https://example.com/b.xml"
    ]));
  });

  test("normalizes public t.me channel links to @channel usernames", () => {
    const config = loadConfig({
      ...requiredEnv,
      TELEGRAM_CHANNEL_ID: "https://t.me/ai_daily"
    });

    expect(config.telegramChannelId).toBe("@ai_daily");
  });

  test("rejects Telegram invite links because they cannot be used as chat IDs", () => {
    expect(() =>
      loadConfig({
        ...requiredEnv,
        TELEGRAM_CHANNEL_ID: "+ZT7wvJvnnFY5ODRh"
      })
    ).toThrow("TELEGRAM_CHANNEL_ID cannot be a Telegram invite link");

    expect(() =>
      loadConfig({
        ...requiredEnv,
        TELEGRAM_CHANNEL_ID: "https://t.me/+ZT7wvJvnnFY5ODRh"
      })
    ).toThrow("TELEGRAM_CHANNEL_ID cannot be a Telegram invite link");
  });

  test("rejects unsupported Telegram channel identifiers", () => {
    expect(() =>
      loadConfig({
        ...requiredEnv,
        TELEGRAM_CHANNEL_ID: "not a channel id"
      })
    ).toThrow("TELEGRAM_CHANNEL_ID must be @channel_username or a numeric chat ID");
  });

  test("supports Moonshot/Kimi aliases with sensible defaults", () => {
    const config = loadConfig({
      ...requiredEnv,
      MOONSHOT_API_KEY: "moonshot-key"
    });

    expect(config.llmApiKey).toBe("moonshot-key");
    expect(config.llmBaseUrl).toBe("https://api.moonshot.ai/v1");
    expect(config.llmModel).toBe("kimi-k2.6");
  });

  test("rejects non-positive digest item limits", () => {
    expect(() =>
      loadConfig({ ...requiredEnv, DIGEST_ITEM_LIMIT: "0" })
    ).toThrow("DIGEST_ITEM_LIMIT must be a positive integer");
  });
});
