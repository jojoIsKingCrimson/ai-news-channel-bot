import { describe, expect, test, vi } from "vitest";
import { createBot } from "../src/bot.js";
import type { AppConfig, Digest } from "../src/types.js";

const config: AppConfig = {
  telegramBotToken: "123:abc",
  telegramChannelId: "@ai_daily",
  tavilyApiKey: "tvly-key",
  llmApiKey: "sk-key",
  llmModel: "gpt-5-mini",
  timezone: "Asia/Shanghai",
  digestCron: "0 10 * * *",
  digestItemLimit: 5,
  stateFile: ".data/state.json",
  telegramAdminUserIds: ["42"],
  rssFeedUrls: [],
  includeTrends: true,
  trendItemLimit: 5
};

const digest: Digest = {
  date: "2026-05-28",
  headline: "今日 AI 产品动态值得关注。",
  items: [
    {
      title: "OpenAI 产品更新",
      source: "openai.com",
      url: "https://openai.com/news/product",
      summary: "OpenAI 发布产品更新。",
      impact: "企业用户可能更快采用相关能力。"
    }
  ]
};

describe("createBot", () => {
  test("handles /preview by replying with a digest preview", async () => {
    const bot = createBot(config, {
      previewDailyDigest: vi.fn(async () => ({ status: "ready", digest }))
    });
    bot.botInfo = {
      id: 123,
      is_bot: true,
      first_name: "AI News Bot",
      username: "ai_news_bot"
    };
    const sendMessage = vi.fn(async () => ({ message_id: 2 }));
    Object.assign(bot.context, {
      telegram: { sendMessage }
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1779933600,
        chat: { id: 42, type: "private", first_name: "Ada" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        text: "/preview",
        entities: [{ offset: 0, length: 8, type: "bot_command" }]
      }
    });

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("📡 <b>2026-05-28 AI Daily</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  test("returns from /preview handler before slow digest generation finishes", async () => {
    let resolvePreview!: (value: { status: "ready"; digest: Digest }) => void;
    const previewPromise = new Promise<{ status: "ready"; digest: Digest }>(
      (resolve) => {
        resolvePreview = resolve;
      }
    );
    const bot = createBot(config, {
      previewDailyDigest: vi.fn(() => previewPromise)
    });
    bot.botInfo = {
      id: 123,
      is_bot: true,
      first_name: "AI News Bot",
      username: "ai_news_bot"
    };
    const sendMessage = vi.fn(async () => ({ message_id: 2 }));
    Object.assign(bot.context, {
      telegram: { sendMessage }
    });

    let handlerSettled = false;
    const handled = bot
      .handleUpdate({
        update_id: 2,
        message: {
          message_id: 1,
          date: 1779933600,
          chat: { id: 42, type: "private", first_name: "Ada" },
          from: { id: 42, is_bot: false, first_name: "Ada" },
          text: "/preview",
          entities: [{ offset: 0, length: 8, type: "bot_command" }]
        }
      })
      .then(() => {
        handlerSettled = true;
      });

    await new Promise((resolve) => setImmediate(resolve));
    const settledBeforeDigestFinished = handlerSettled;

    resolvePreview({ status: "ready", digest });
    await handled;
    await new Promise((resolve) => setImmediate(resolve));

    expect(settledBeforeDigestFinished).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("正在生成"),
      expect.any(Object)
    );
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("📡 <b>2026-05-28 AI Daily</b>"),
      expect.objectContaining({ parse_mode: "HTML" })
    );
  });

  test("rejects /run when the sender is not configured as an admin", async () => {
    const publishDailyDigest = vi.fn(async () => ({
      status: "published" as const,
      digest,
      articles: []
    }));
    const bot = createBot(
      { ...config, telegramAdminUserIds: ["10086"] },
      { publishDailyDigest }
    );
    bot.botInfo = {
      id: 123,
      is_bot: true,
      first_name: "AI News Bot",
      username: "ai_news_bot"
    };
    const sendMessage = vi.fn(async () => ({ message_id: 2 }));
    Object.assign(bot.context, {
      telegram: { sendMessage }
    });

    await bot.handleUpdate({
      update_id: 3,
      message: {
        message_id: 1,
        date: 1779933600,
        chat: { id: 42, type: "private", first_name: "Ada" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        text: "/run",
        entities: [{ offset: 0, length: 4, type: "bot_command" }]
      }
    });

    expect(publishDailyDigest).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("没有权限"),
      expect.any(Object)
    );
  });

  test("handles /run by publishing the digest to the configured channel", async () => {
    const publishDailyDigest = vi.fn(async () => ({
      status: "published" as const,
      digest,
      articles: []
    }));
    const bot = createBot(config, { publishDailyDigest });
    bot.botInfo = {
      id: 123,
      is_bot: true,
      first_name: "AI News Bot",
      username: "ai_news_bot"
    };
    const sendMessage = vi.fn(async () => ({ message_id: 2 }));
    Object.assign(bot.context, {
      telegram: { sendMessage }
    });

    await bot.handleUpdate({
      update_id: 4,
      message: {
        message_id: 1,
        date: 1779933600,
        chat: { id: 42, type: "private", first_name: "Ada" },
        from: { id: 42, is_bot: false, first_name: "Ada" },
        text: "/run",
        entities: [{ offset: 0, length: 4, type: "bot_command" }]
      }
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(publishDailyDigest).toHaveBeenCalledWith(config, expect.any(Object));
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("正在立即发布"),
      expect.any(Object)
    );
    expect(sendMessage).toHaveBeenCalledWith(
      42,
      expect.stringContaining("已发布到频道"),
      expect.any(Object)
    );
  });
});
