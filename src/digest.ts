import { collectAiNews } from "./collect.js";
import {
  canonicalizeUrl,
  filterFreshArticles,
  loadState,
  markPublished,
  pruneState,
  saveState
} from "./dedupe.js";
import { sendDigest, type TelegramSender } from "./publish.js";
import { collectRssNews } from "./rss.js";
import {
  summarizeDigest,
  type OpenAICompatibleChatClient
} from "./summarize.js";
import { localizePulseTrends } from "./localize-trends.js";
import { summarizeTemplateDigest } from "./template-summary.js";
import { collectPulseTrends, type PulseTrends } from "./trends.js";
import type { AppConfig, ArticleCandidate, Digest } from "./types.js";

export type DailyDigestResult =
  | { status: "ready"; digest: Digest; articles: ArticleCandidate[] }
  | { status: "published"; digest: Digest; articles: ArticleCandidate[] }
  | { status: "skipped"; reason: string };

interface DigestDependencies {
  collect?: () => Promise<ArticleCandidate[]>;
  summarize?: (articles: ArticleCandidate[]) => Promise<Digest>;
  collectTrends?: () => Promise<PulseTrends>;
  telegram?: TelegramSender;
  llmClient?: OpenAICompatibleChatClient;
  fetchImpl?: typeof fetch;
  now?: Date;
}

interface CollectDigestArticleOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
}

export async function previewDailyDigest(
  config: AppConfig,
  deps: DigestDependencies = {}
): Promise<DailyDigestResult> {
  return generateDailyDigest(config, deps);
}

export async function publishDailyDigest(
  config: AppConfig,
  deps: DigestDependencies = {}
): Promise<DailyDigestResult> {
  if (!deps.telegram) {
    throw new Error("Telegram sender is required to publish the digest");
  }

  const result = await generateDailyDigest(config, deps);
  if (result.status !== "ready") {
    return result;
  }

  await sendDigest(deps.telegram, config.telegramChannelId, result.digest);

  const now = deps.now ?? new Date();
  const state = pruneState(await loadState(config.stateFile), now);
  const publishedArticles = articlesForDigest(result.digest, result.articles);
  const updated = pruneState(markPublished(state, publishedArticles, now), now);
  await saveState(config.stateFile, updated);

  return {
    status: "published",
    digest: result.digest,
    articles: publishedArticles
  };
}

async function generateDailyDigest(
  config: AppConfig,
  deps: DigestDependencies
): Promise<DailyDigestResult> {
  const now = deps.now ?? new Date();
  const collect =
    deps.collect ??
    (() => collectDigestArticles(config, { fetchImpl: deps.fetchImpl, now }));
  const summarize =
    deps.summarize ??
    (async (articles: ArticleCandidate[]) => {
      if (config.llmApiKey && deps.llmClient) {
        try {
          return await summarizeDigest(articles, {
            client: deps.llmClient,
            model: config.llmModel,
            itemLimit: config.digestItemLimit,
            now
          });
        } catch (error) {
          console.warn(
            "LLM digest summarization failed; falling back to local template summary.",
            error
          );
        }
      }

      return summarizeTemplateDigest(articles, {
        itemLimit: config.digestItemLimit,
        now
      });
    });
  const collectTrends =
    deps.collectTrends ??
    (() => {
      if (!config.includeTrends) {
        return Promise.resolve({ productHunt: [], githubTrending: [] });
      }

      return collectPulseTrends({
        fetchImpl: deps.fetchImpl,
        now,
        itemLimit: config.trendItemLimit
      });
    });

  const articles = await collect();
  if (articles.length === 0) {
    return { status: "skipped", reason: "过去 24 小时没有采集到 AI 资讯。" };
  }

  const state = pruneState(await loadState(config.stateFile), now);
  const freshArticles = filterFreshArticles(
    articles,
    state,
    Math.max(config.digestItemLimit * 4, config.digestItemLimit)
  );

  if (freshArticles.length === 0) {
    return { status: "skipped", reason: "没有发现未发布过的 AI 资讯。" };
  }

  const [digest, trends] = await Promise.all([
    summarize(freshArticles),
    collectTrends()
  ]);
  const localizedTrends = await localizeTrends(config, deps, trends);
  const pulseDigest = {
    ...digest,
    productHunt: localizedTrends.productHunt,
    githubTrending: localizedTrends.githubTrending
  };
  if (pulseDigest.items.length === 0) {
    return { status: "skipped", reason: "摘要结果没有可发布条目。" };
  }

  return {
    status: "ready",
    digest: pulseDigest,
    articles: freshArticles
  };
}

async function localizeTrends(
  config: AppConfig,
  deps: DigestDependencies,
  trends: PulseTrends
): Promise<PulseTrends> {
  if (!config.llmApiKey || !deps.llmClient) {
    return trends;
  }

  return localizePulseTrends(trends, {
    client: deps.llmClient,
    model: config.llmModel
  });
}

export async function collectDigestArticles(
  config: AppConfig,
  options: CollectDigestArticleOptions = {}
): Promise<ArticleCandidate[]> {
  const now = options.now ?? new Date();
  const sources: Promise<ArticleCandidate[]>[] = [];

  if (config.tavilyApiKey) {
    sources.push(
      collectAiNews({
        apiKey: config.tavilyApiKey,
        fetchImpl: options.fetchImpl,
        now
      })
    );
  }

  sources.push(
    collectRssNews({
      feedUrls: config.rssFeedUrls,
      fetchImpl: options.fetchImpl,
      now
    })
  );

  const results = await Promise.all(sources);
  return uniqueArticles(results.flat());
}

function uniqueArticles(articles: ArticleCandidate[]): ArticleCandidate[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = canonicalizeUrl(article.url);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function articlesForDigest(digest: Digest, articles: ArticleCandidate[]): ArticleCandidate[] {
  const digestUrls = new Set(digest.items.map((item) => canonicalizeUrl(item.url)));
  const matched = articles.filter((article) =>
    digestUrls.has(canonicalizeUrl(article.url))
  );

  if (matched.length > 0) {
    return matched;
  }

  return digest.items.map((item) => ({
    title: item.title,
    url: item.url,
    source: item.source,
    snippet: item.summary
  }));
}
