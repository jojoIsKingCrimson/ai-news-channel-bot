import "dotenv/config";
import OpenAI from "openai";
import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { publishDailyDigest } from "./digest.js";
import { registerDailyDigest } from "./scheduler.js";

const config = loadConfig();
const llmClient = config.llmApiKey
  ? new OpenAI({ apiKey: config.llmApiKey, baseURL: config.llmBaseUrl })
  : undefined;
const bot = createBot(config, { llmClient });

const scheduledTask = registerDailyDigest({
  cronExpression: config.digestCron,
  timezone: config.timezone,
  task: async () => {
    const result = await publishDailyDigest(config, {
      llmClient,
      telegram: bot.telegram
    });

    if (result.status === "skipped") {
      console.info(`Daily digest skipped: ${result.reason}`);
    } else {
      console.info(`Daily digest published with ${result.digest.items.length} items.`);
    }
  },
  onError: (error) => {
    console.error("Daily digest job failed:", error);
  }
});

await bot.launch();
console.info(
  `Telegram AI news bot is running. Digest schedule: ${config.digestCron} ${config.timezone}.`
);

function shutdown(signal: NodeJS.Signals): void {
  console.info(`Received ${signal}, stopping bot.`);
  scheduledTask.stop();
  bot.stop(signal);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
