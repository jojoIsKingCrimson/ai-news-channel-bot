import { describe, expect, test, vi } from "vitest";
import {
  formatErrorForAdmin,
  notifyAdmins,
  notifyScheduledDigestFailure
} from "../src/admin-notify.js";
import type { AppConfig } from "../src/types.js";

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
  telegramAdminUserIds: ["42", "10086"],
  rssFeedUrls: [],
  includeTrends: true,
  trendItemLimit: 5
};

describe("notifyAdmins", () => {
  test("sends an operational alert to every configured admin", async () => {
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };

    await notifyAdmins(config, telegram, "测试通知");

    expect(telegram.sendMessage).toHaveBeenCalledWith("42", "测试通知");
    expect(telegram.sendMessage).toHaveBeenCalledWith("10086", "测试通知");
  });

  test("does nothing when no admins are configured", async () => {
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };

    await notifyAdmins({ ...config, telegramAdminUserIds: [] }, telegram, "测试通知");

    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });
});

describe("notifyScheduledDigestFailure", () => {
  test("notifies admins with a concise scheduled failure message", async () => {
    const telegram = {
      sendMessage: vi.fn(async () => ({ message_id: 1 }))
    };

    await notifyScheduledDigestFailure(
      config,
      telegram,
      new Error("Telegram channel not found")
    );

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("定时 AI 日报发布失败")
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      "42",
      expect.stringContaining("Telegram channel not found")
    );
  });
});

describe("formatErrorForAdmin", () => {
  test("converts unknown errors into readable text", () => {
    expect(formatErrorForAdmin(new Error("boom"))).toBe("boom");
    expect(formatErrorForAdmin("plain failure")).toBe("plain failure");
  });
});
