import OpenAI from "openai";
import { Telegram } from "telegraf";
import {
  notifyScheduledDigestFailure,
  type AdminTelegramSender
} from "./admin-notify.js";
import {
  publishDailyDigest,
  type DailyDigestResult,
  type DigestDependencies
} from "./digest.js";
import type { TelegramSender } from "./publish.js";
import type { AppConfig } from "./types.js";

interface RunOnceLogger {
  info(message: string): void;
  error(message: string, error: unknown): void;
}

export interface RunDailyDigestOnceDependencies extends DigestDependencies {
  telegram?: TelegramSender & AdminTelegramSender;
  logger?: RunOnceLogger;
}

export async function runDailyDigestOnce(
  config: AppConfig,
  deps: RunDailyDigestOnceDependencies = {}
): Promise<DailyDigestResult> {
  const logger = deps.logger ?? console;
  const telegram = deps.telegram ?? new Telegram(config.telegramBotToken);
  const llmClient =
    deps.llmClient ??
    (config.llmApiKey
      ? new OpenAI({ apiKey: config.llmApiKey, baseURL: config.llmBaseUrl })
      : undefined);

  try {
    const result = await publishDailyDigest(config, {
      ...deps,
      llmClient,
      telegram
    });

    if (result.status === "skipped") {
      logger.info(`Daily digest skipped: ${result.reason}`);
    } else {
      logger.info(`Daily digest published with ${result.digest.items.length} items.`);
    }

    return result;
  } catch (error) {
    logger.error("Daily digest one-off run failed:", error);
    await notifyScheduledDigestFailure(config, telegram, error).catch((notifyError) => {
      logger.error("Daily digest failure notification failed:", notifyError);
    });
    throw error;
  }
}
