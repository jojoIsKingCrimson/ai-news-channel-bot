import "dotenv/config";
import { loadConfig } from "./config.js";
import { runDailyDigestOnce } from "./run-once.js";

await runDailyDigestOnce(loadConfig());
