import { Telegraf } from "telegraf";
import {
  publishDailyDigest as defaultPublishDailyDigest,
  previewDailyDigest as defaultPreviewDailyDigest,
  type DailyDigestResult
} from "./digest.js";
import {
  escapeHtml,
  formatDigestHtml,
  splitTelegramMessages,
  type TelegramSender
} from "./publish.js";
import type { OpenAICompatibleChatClient } from "./summarize.js";
import type { AppConfig } from "./types.js";

export const publicBotCommands = [
  { command: "preview", description: "生成今日 AI 资讯日报预览" },
  { command: "id", description: "查看当前用户 ID 和聊天 ID" },
  { command: "help", description: "查看帮助" }
];

export const adminBotCommands = [
  ...publicBotCommands,
  { command: "run", description: "立即发布日报到频道（管理员）" },
  { command: "test_channel", description: "测试频道发送权限（管理员）" }
];

export interface CommandRegistrar {
  setMyCommands(
    commands: Array<{ command: string; description: string }>,
    options?: { scope: { type: "chat"; chat_id: number } }
  ): Promise<unknown>;
}

interface BotDependencies {
  previewDailyDigest?: (config: AppConfig) => Promise<DailyDigestResult>;
  publishDailyDigest?: (
    config: AppConfig,
    telegram: TelegramSender
  ) => Promise<DailyDigestResult>;
  llmClient?: OpenAICompatibleChatClient;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export async function registerBotCommands(
  telegram: CommandRegistrar,
  config: AppConfig
): Promise<void> {
  await telegram.setMyCommands(publicBotCommands);
  await Promise.all(
    config.telegramAdminUserIds.map((adminId) =>
      telegram.setMyCommands(adminBotCommands, {
        scope: { type: "chat", chat_id: Number(adminId) }
      })
    )
  );
}

export function createBot(
  config: AppConfig,
  deps: BotDependencies = {}
): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);
  const preview =
    deps.previewDailyDigest ??
    ((currentConfig: AppConfig) =>
      defaultPreviewDailyDigest(currentConfig, {
        llmClient: deps.llmClient,
        fetchImpl: deps.fetchImpl,
        now: deps.now
      }));
  const publish =
    deps.publishDailyDigest ??
    ((currentConfig: AppConfig, telegram: TelegramSender) =>
      defaultPublishDailyDigest(currentConfig, {
        telegram,
        llmClient: deps.llmClient,
        fetchImpl: deps.fetchImpl,
        now: deps.now
      }));

  bot.start((ctx) =>
    ctx.reply(
      [
        "你好，我会每天 10:00 中国时间向配置的频道推送 AI 资讯日报。",
        "发送 /preview 可以立即生成一份预览。"
      ].join("\n")
    )
  );

  bot.help((ctx) =>
    ctx.reply(
      [
        "可用命令：",
        "/preview - 生成今日 AI 资讯日报预览",
        "/run - 立即发布日报到频道（仅管理员）",
        "/test_channel - 测试频道发送权限（仅管理员）",
        "/id - 查看当前 Telegram 用户 ID 和聊天 ID",
        "/help - 查看帮助"
      ].join("\n")
    )
  );

  bot.command("preview", async (ctx) => {
    await ctx.reply("正在生成 AI 资讯日报预览，请稍等。生成完成后我会发到这里。");

    void (async () => {
      try {
        const result = await preview(config);

        if (result.status === "skipped") {
          await ctx.reply(result.reason);
          return;
        }

        for (const part of splitTelegramMessages(formatDigestHtml(result.digest))) {
          await ctx.reply(part, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          } as any);
        }
      } catch (error) {
        console.error("Preview digest failed:", error);
        await ctx.reply("预览生成失败，请查看服务日志里的错误信息。");
      }
    })();
  });

  bot.command("run", async (ctx) => {
    if (!isAdmin(config, ctx.from?.id)) {
      await ctx.reply(unauthorizedRunMessage(ctx.from?.id));
      return;
    }

    await ctx.reply("正在立即发布 AI 资讯日报到频道，请稍等。");

    void (async () => {
      try {
        const result = await publish(config, ctx.telegram);

        if (result.status === "skipped") {
          await ctx.reply(`本次未发布：${result.reason}`);
          return;
        }

        if (result.status === "published") {
          await ctx.reply(
            `已发布到频道：${result.digest.items.length} 条 AI 新闻。`
          );
          return;
        }

        await ctx.reply("日报已生成，但发布函数没有返回已发布状态。");
      } catch (error) {
        console.error("Run digest failed:", error);
        await ctx.reply("立即发布失败，请查看服务日志里的错误信息。");
      }
    })();
  });

  bot.command("id", async (ctx) => {
    await ctx.reply(
      [
        `你的 Telegram 用户 ID：${ctx.from?.id ?? "未知"}`,
        `当前聊天 ID：${ctx.chat?.id ?? "未知"}`,
        `当前聊天类型：${ctx.chat?.type ?? "未知"}`
      ].join("\n")
    );
  });

  bot.command("test_channel", async (ctx) => {
    if (!isAdmin(config, ctx.from?.id)) {
      await ctx.reply(unauthorizedRunMessage(ctx.from?.id));
      return;
    }

    try {
      await ctx.telegram.sendMessage(
        config.telegramChannelId,
        [
          "频道连通性测试：机器人可以向这个频道发送消息。",
          `时间：${new Date().toISOString()}`
        ].join("\n")
      );
      await ctx.reply("频道连通性测试成功：bot 可以向配置频道发送消息。");
    } catch (error) {
      console.error("Channel connectivity test failed:", error);
      await ctx.reply(
        [
          "频道连通性测试失败。",
          "请确认 TELEGRAM_CHANNEL_ID 是 @channel_username 或 -100... 数字 ID，并确认 bot 已加入频道且是管理员。"
        ].join("\n")
      );
    }
  });

  bot.hears(/^\/.+/, (ctx) =>
    ctx.reply(
      `${escapeHtml("未知命令。发送 /help 查看可用命令。")}`,
      { parse_mode: "HTML" }
    )
  );

  bot.catch((error) => {
    console.error("Telegram bot error:", error);
  });

  return bot;
}

function isAdmin(config: AppConfig, userId: number | undefined): boolean {
  return (
    userId !== undefined &&
    config.telegramAdminUserIds.includes(String(userId))
  );
}

function unauthorizedRunMessage(userId: number | undefined): string {
  const idHint = userId ? `你的 Telegram 用户 ID 是 ${userId}。` : "";
  return [
    "没有权限使用 /run。",
    "请在 .env 配置 TELEGRAM_ADMIN_USER_IDS 后重启机器人。",
    idHint
  ]
    .filter(Boolean)
    .join("\n");
}
