import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { runDailyDigestOnce } from "../src/run-once.js";
import type { AppConfig, ArticleCandidate, Digest } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeConfig(): Promise<AppConfig> {
  const dir = await mkdtemp(join(tmpdir(), "tele-bot-once-"));
  tempDirs.push(dir);

  return {
    telegramBotToken: "123:abc",
    telegramChannelId: "@ai_daily",
    tavilyApiKey: undefined,
    llmApiKey: undefined,
    llmModel: "gpt-5-mini",
    timezone: "Asia/Shanghai",
    digestCron: "0 10 * * *",
    digestItemLimit: 5,
    stateFile: join(dir, "state.json"),
    telegramAdminUserIds: ["42"],
    rssFeedUrls: [],
    includeTrends: false,
    trendItemLimit: 5
  };
}

const article: ArticleCandidate = {
  title: "AI product ships",
  url: "https://example.com/ai-product",
  source: "example.com",
  snippet: "A useful AI product shipped today."
};

const digest: Digest = {
  date: "2026-05-29",
  headline: "今日 AI 产品动态值得关注。",
  items: [
    {
      title: "AI 产品发布",
      source: "example.com",
      url: "https://example.com/ai-product",
      summary: "AI 产品今日发布",
      impact: "用户可关注新能力"
    }
  ]
};

describe("runDailyDigestOnce", () => {
  test("publishes one digest run and records state for GitHub Actions", async () => {
    const config = await makeConfig();
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };
    const logger = {
      info: vi.fn(),
      error: vi.fn()
    };

    const result = await runDailyDigestOnce(config, {
      collect: vi.fn(async () => [article]),
      summarize: vi.fn(async () => digest),
      collectTrends: vi.fn(async () => ({ productHunt: [], githubTrending: [] })),
      telegram,
      logger,
      now: new Date("2026-05-29T02:00:00.000Z")
    });

    expect(result.status).toBe("published");
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "@ai_daily",
      expect.stringContaining("📡 <b>2026-05-29 AI Daily</b>"),
      { parse_mode: "HTML", disable_web_page_preview: true }
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Daily digest published with 1 items."
    );

    const state = JSON.parse(await readFile(config.stateFile, "utf8"));
    expect(state.published).toEqual([
      {
        url: "https://example.com/ai-product",
        title: "AI product ships",
        publishedAt: "2026-05-29T02:00:00.000Z"
      }
    ]);
  });

  test("notifies admins and rethrows when the one-off digest run fails", async () => {
    const config = await makeConfig();
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };
    const logger = {
      info: vi.fn(),
      error: vi.fn()
    };

    await expect(
      runDailyDigestOnce(config, {
        collect: vi.fn(async () => {
          throw new Error("source unavailable");
        }),
        telegram,
        logger,
        now: new Date("2026-05-29T02:00:00.000Z")
      })
    ).rejects.toThrow("source unavailable");

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("定时 AI 日报发布失败")
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("source unavailable")
    );
    expect(logger.error).toHaveBeenCalledWith(
      "Daily digest one-off run failed:",
      expect.any(Error)
    );
  });
});
