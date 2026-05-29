import type { AppConfig } from "./types.js";

type Env = Record<string, string | undefined>;

const defaultRssFeedUrls = [
  "https://news.google.com/rss/search?q=AI%20OR%20%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
  "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
  "https://venturebeat.com/category/ai/feed/",
  "https://www.artificialintelligence-news.com/feed/",
  "https://rsshub.app/36kr/newsflashes",
  "https://rsshub.app/jiqizhixin/articles"
];

function readRequired(
  env: Env,
  key: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHANNEL_ID"
): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readOptional(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function parsePositiveInteger(value: string | undefined, key: string, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const telegramBotToken = readRequired(env, "TELEGRAM_BOT_TOKEN");
  const telegramChannelId = normalizeTelegramChannelId(
    readRequired(env, "TELEGRAM_CHANNEL_ID")
  );
  const moonshotApiKey =
    readOptional(env, "MOONSHOT_API_KEY") ?? readOptional(env, "KIMI_API_KEY");
  const llmBaseUrl =
    readOptional(env, "LLM_BASE_URL") ??
    readOptional(env, "OPENAI_BASE_URL") ??
    (moonshotApiKey ? "https://api.moonshot.ai/v1" : undefined);

  return {
    telegramBotToken,
    telegramChannelId,
    tavilyApiKey: readOptional(env, "TAVILY_API_KEY"),
    llmApiKey:
      readOptional(env, "LLM_API_KEY") ??
      moonshotApiKey ??
      readOptional(env, "OPENAI_API_KEY"),
    llmBaseUrl,
    llmModel:
      env.LLM_MODEL?.trim() ||
      env.OPENAI_MODEL?.trim() ||
      (isMoonshotEndpoint(llmBaseUrl) ? "kimi-k2.6" : "gpt-5-mini"),
    timezone: env.TIMEZONE?.trim() || "Asia/Shanghai",
    digestCron: env.DIGEST_CRON?.trim() || "0 10 * * *",
    digestItemLimit: parsePositiveInteger(
      env.DIGEST_ITEM_LIMIT,
      "DIGEST_ITEM_LIMIT",
      9
    ),
    stateFile: env.STATE_FILE?.trim() || ".data/state.json",
    telegramAdminUserIds: parseList(env.TELEGRAM_ADMIN_USER_IDS) ?? [],
    rssFeedUrls: mergeFeedUrls(defaultRssFeedUrls, parseList(env.RSS_FEED_URLS)),
    includeTrends: parseBoolean(env.INCLUDE_TRENDS, true),
    trendItemLimit: parsePositiveInteger(env.TREND_ITEM_LIMIT, "TREND_ITEM_LIMIT", 5)
  };
}

function parseList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items && items.length > 0 ? items : undefined;
}

function normalizeTelegramChannelId(value: string): string {
  const trimmed = value.trim();

  if (isTelegramInviteLink(trimmed)) {
    throw new Error(
      "TELEGRAM_CHANNEL_ID cannot be a Telegram invite link. Use @channel_username for public channels, or a numeric chat ID like -1001234567890 for private channels."
    );
  }

  const publicLink = trimmed.match(
    /^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,})\/?$/i
  );
  if (publicLink) {
    return `@${publicLink[1]}`;
  }

  if (/^@[A-Za-z0-9_]{5,}$/.test(trimmed) || /^-?\d+$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error(
    "TELEGRAM_CHANNEL_ID must be @channel_username or a numeric chat ID like -1001234567890."
  );
}

function isTelegramInviteLink(value: string): boolean {
  return (
    value.startsWith("+") ||
    /^https?:\/\/t\.me\/\+/i.test(value) ||
    /(?:^|\/)joinchat(?:\/|$)/i.test(value)
  );
}

function mergeFeedUrls(defaults: string[], configured: string[] | undefined): string[] {
  return [...new Set([...defaults, ...(configured ?? [])])];
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value?.trim()) {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function isMoonshotEndpoint(value: string | undefined): boolean {
  return value ? /moonshot|kimi/i.test(value) : false;
}
