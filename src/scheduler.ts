import cron from "node-cron";

export interface ScheduledTask {
  stop(): void;
}

export interface CronLike {
  schedule(
    expression: string,
    task: () => void,
    options: { timezone: string }
  ): ScheduledTask;
}

export interface RegisterDailyDigestOptions {
  cronExpression: string;
  timezone: string;
  task: () => Promise<void> | void;
  cron?: CronLike;
  onError?: (error: unknown) => void;
}

export function registerDailyDigest(options: RegisterDailyDigestOptions): ScheduledTask {
  const cronImpl = options.cron ?? cron;
  return cronImpl.schedule(
    options.cronExpression,
    () => {
      void Promise.resolve(options.task()).catch((error) => {
        options.onError?.(error);
      });
    },
    { timezone: options.timezone }
  );
}
