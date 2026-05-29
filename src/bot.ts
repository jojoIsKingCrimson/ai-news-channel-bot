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
