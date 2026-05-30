import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test, vi } from "vitest";
import { previewDailyDigest, publishDailyDigest } from "../src/digest.js";
import type { AppConfig, ArticleCandidate, Digest } from "../src/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function makeConfig(): Promise<AppConfig> {
  const dir = await mkdtemp(join(tmpdir(), "tele-bot-"));
  tempDirs.push(dir);

  return {
    telegramBotToken: "123:abc",
    telegramChannelId: "@ai_daily",
    tavilyApiKey: "tvly-key",
    llmApiKey: "sk-key",
    llmModel: "gpt-5-mini",
    timezone: "Asia/Shanghai",
    digestCron: "0 10 * * *",
    digestItemLimit: 5,
    stateFile: join(dir, "state.json"),
    telegramAdminUserIds: ["42"],
    rssFeedUrls: ["https://feeds.example.com/ai.xml"],
    includeTrends: true,
    trendItemLimit: 5
  };
}

const article: ArticleCandidate = {
  title: "OpenAI ships an AI product update",
  url: "https://openai.com/news/product",
  source: "openai.com",
  snippet: "A product update."
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

describe("daily digest pipeline", () => {
  test("/preview generates a digest without writing publish state", async () => {
    const config = await makeConfig();

    const result = await previewDailyDigest(config, {
      collect: vi.fn(async () => [article]),
      summarize: vi.fn(async () => digest),
      collectTrends: vi.fn(async () => ({
        productHunt: [
          {
            name: "Agent Desk",
            url: "https://www.producthunt.com/posts/agent-desk"
          }
        ],
        githubTrending: [
          {
            repository: "owner/agent-kit",
            url: "https://github.com/owner/agent-kit",
            description: "Toolkit"
          }
        ]
      })),
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.digest.productHunt).toHaveLength(1);
      expect(result.digest.githubTrending).toHaveLength(1);
    }
    await expect(readFile(config.stateFile, "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  test("scheduled publishing sends to channel and records published links", async () => {
    const config = await makeConfig();
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };

    const result = await publishDailyDigest(config, {
      collect: vi.fn(async () => [article]),
      summarize: vi.fn(async () => digest),
      collectTrends: vi.fn(async () => ({
        productHunt: [],
        githubTrending: []
      })),
      telegram,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(result.status).toBe("published");
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "@ai_daily",
      expect.stringContaining("📡 <b>2026-05-28 AI Daily</b>"),
      { parse_mode: "HTML", disable_web_page_preview: true }
    );

    const state = JSON.parse(await readFile(config.stateFile, "utf8"));
    expect(state).toMatchObject({
      lastPublishedDate: "2026-05-28",
      published: [
        {
          url: "https://openai.com/news/product",
          title: "OpenAI ships an AI product update",
          publishedAt: "2026-05-28T02:00:00.000Z"
        }
      ]
    });
  });

  test("scheduled publishing skips when a digest already ran today", async () => {
    const config = await makeConfig();
    await mkdir(dirname(config.stateFile), { recursive: true });
    await writeFile(
      config.stateFile,
      `${JSON.stringify({
        lastPublishedDate: "2026-05-30",
        published: [
          {
            url: "https://previous.example.com",
            title: "Previous story",
            publishedAt: "2026-05-30T02:00:00.000Z"
          }
        ]
      })}\n`,
      "utf8"
    );
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };
    const collect = vi.fn(async () => [article]);

    const result = await publishDailyDigest(config, {
      collect,
      summarize: vi.fn(async () => digest),
      collectTrends: vi.fn(async () => ({
        productHunt: [],
        githubTrending: []
      })),
      telegram,
      now: new Date("2026-05-30T05:00:00.000Z")
    });

    expect(result).toEqual({
      status: "skipped",
      reason: "今天已经发布过 AI 日报。"
    });
    expect(collect).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  test("legacy publish state without a daily marker remains readable", async () => {
    const config = await makeConfig();
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };

    const result = await publishDailyDigest(config, {
      collect: vi.fn(async () => [article]),
      summarize: vi.fn(async () => digest),
      collectTrends: vi.fn(async () => ({
        productHunt: [],
        githubTrending: []
      })),
      telegram,
      now: new Date("2026-05-30T05:00:00.000Z")
    });

    expect(result.status).toBe("published");
    const state = JSON.parse(await readFile(config.stateFile, "utf8"));
    expect(state).toMatchObject({
      lastPublishedDate: "2026-05-30",
      published: [
        {
          url: "https://openai.com/news/product",
          title: "OpenAI ships an AI product update",
          publishedAt: "2026-05-30T05:00:00.000Z"
        }
      ]
    });
  });

  test("falls back to RSS collection and template summary when API keys are absent", async () => {
    const config = {
      ...(await makeConfig()),
      tavilyApiKey: undefined,
      llmApiKey: undefined
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>AI app adds a team workspace</title>
              <link>https://example.com/ai-workspace</link>
              <description>A product update for team collaboration.</description>
              <pubDate>Thu, 28 May 2026 01:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`
    })) as unknown as typeof fetch;

    const result = await previewDailyDigest(config, {
      fetchImpl,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.digest.headline).toContain("RSS");
      expect(result.digest.items[0]).toMatchObject({
        title: "AI app adds a team workspace",
        source: "example.com",
        url: "https://example.com/ai-workspace"
      });
    }
  });

  test("falls back to a template summary when the LLM returns invalid JSON", async () => {
    const config = await makeConfig();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const llmClient = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: "今天的 AI 新闻如下，但不是 JSON。" } }]
          }))
        }
      }
    };

    const result = await previewDailyDigest(
      config,
      {
        collect: vi.fn(async () => [article]),
        llmClient,
        collectTrends: vi.fn(async () => ({
          productHunt: [],
          githubTrending: []
        })),
        now: new Date("2026-05-28T02:00:00.000Z")
      }
    );

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.digest.headline).toContain("RSS/搜索结果");
      expect(result.digest.items[0]).toMatchObject({
        title: article.title,
        url: article.url
      });
    }
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("falling back to local template summary"),
      expect.any(Error)
    );
    warn.mockRestore();
  });

  test("localizes trend descriptions when an LLM client is configured", async () => {
    const config = { ...(await makeConfig()), llmModel: "kimi-k2.6" };
    const llmClient = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockResolvedValueOnce({
              choices: [
                {
                  message: {
                    content: JSON.stringify(digest)
                  }
                }
              ]
            })
            .mockResolvedValueOnce({
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
            })
        }
      }
    };

    const result = await previewDailyDigest(config, {
      collect: vi.fn(async () => [article]),
      collectTrends: vi.fn(async () => ({
        productHunt: [
          {
            name: "Agent Desk",
            url: "https://www.producthunt.com/posts/agent-desk",
            tagline: "A workspace for AI agents"
          }
        ],
        githubTrending: [
          {
            repository: "owner/agent-kit",
            url: "https://github.com/owner/agent-kit",
            description: "Toolkit for building AI agents"
          }
        ]
      })),
      llmClient,
      now: new Date("2026-05-28T02:00:00.000Z")
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.digest.productHunt?.[0].tagline).toBe("AI Agent 团队协作工作台");
      expect(result.digest.githubTrending?.[0].description).toBe(
        "构建 AI Agent 的工具包"
      );
    }
    expect(llmClient.chat.completions.create).toHaveBeenCalledTimes(2);
  });
});
