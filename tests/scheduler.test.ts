import { describe, expect, test, vi } from "vitest";
import { registerDailyDigest } from "../src/scheduler.js";

describe("registerDailyDigest", () => {
  test("uses the configured cron expression and timezone without running immediately", () => {
    const task = vi.fn();
    const schedule = vi.fn(() => ({ stop: vi.fn() }));

    registerDailyDigest({
      cronExpression: "0 10 * * *",
      timezone: "Asia/Shanghai",
      task,
      cron: { schedule }
    });

    expect(schedule).toHaveBeenCalledWith(
      "0 10 * * *",
      expect.any(Function),
      { timezone: "Asia/Shanghai" }
    );
    expect(task).not.toHaveBeenCalled();
  });
});
