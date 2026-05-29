import type { AppConfig } from "./types.js";

export interface AdminTelegramSender {
  sendMessage(chatId: string, text: string): Promise<unknown>;
}

export async function notifyAdmins(
  config: AppConfig,
  telegram: AdminTelegramSender,
  message: string
): Promise<void> {
  await Promise.all(
    config.telegramAdminUserIds.map((adminId) =>
      telegram.sendMessage(adminId, message)
    )
  );
}

export async function notifyScheduledDigestFailure(
  config: AppConfig,
  telegram: AdminTelegramSender,
  error: unknown
): Promise<void> {
  await notifyAdmins(
    config,
    telegram,
    [
      "定时 AI 日报发布失败。",
      `频道：${config.telegramChannelId}`,
      `错误：${formatErrorForAdmin(error)}`
    ].join("\n")
  );
}

export function formatErrorForAdmin(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return JSON.stringify(error);
}
