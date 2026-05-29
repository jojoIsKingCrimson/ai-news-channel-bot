import type { ArticleCandidate } from "./types.js";

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

type FetchLike = typeof fetch;

interface TavilyResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  raw_content?: unknown;
  published_date?: unknown;
  publishedDate?: unknown;
  score?: unknown;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

interface SearchQuery {
  query: string;
  includeDomains?: string[];
}

export interface CollectOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  now?: Date;
  maxResultsPerQuery?: number;
  queries?: SearchQuery[];
}

const chineseDomains = [
  "jiqizhixin.com",
  "qbitai.com",
  "aibase.com",
  "36kr.com",
  "huxiu.com"
];

const englishDomains = [
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "blogs.microsoft.com",
  "ai.meta.com",
  "nvidia.com"
];

export const defaultSearchQueries: SearchQuery[] = [
  {
    query: "AI 产品 发布 行业 动态 人工智能 过去24小时",
    includeDomains: chineseDomains
  },
  {
    query: "生成式 AI 产品 公司动态 大模型 应用 过去24小时",
    includeDomains: chineseDomains
  },
  {
    query: "AI product launch industry update large model past 24 hours",
    includeDomains: englishDomains
  },
  {
    query: "OpenAI Anthropic Google DeepMind Microsoft Meta NVIDIA AI product news",
    includeDomains: englishDomains
  }
];

export async function collectAiNews(options: CollectOptions): Promise<ArticleCandidate[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const maxResults = options.maxResultsPerQuery ?? 8;
  const queries = options.queries ?? defaultSearchQueries;
  const articles: ArticleCandidate[] = [];

  for (const search of queries) {
    const response = await fetchImpl(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: search.query,
        topic: "news",
        days: 1,
        max_results: maxResults,
        search_depth: "advanced",
        include_answer: false,
        include_raw_content: false,
        include_domains: search.includeDomains
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed with status ${response.status}`);
    }

    const payload = (await response.json()) as TavilyResponse;
    for (const result of payload.results ?? []) {
      const article = normalizeResult(result, search.query);
      if (!article) {
        continue;
      }
      if (article.publishedAt && Date.parse(article.publishedAt) < since) {
        continue;
      }
      articles.push(article);
    }
  }

  return dedupeByUrl(articles);
}

export function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "unknown";
  }
}

function normalizeResult(result: TavilyResult, query: string): ArticleCandidate | null {
  if (typeof result.title !== "string" || typeof result.url !== "string") {
    return null;
  }

  const title = result.title.trim();
  const url = result.url.trim();
  if (!title || !url) {
    return null;
  }

  const content =
    typeof result.content === "string"
      ? result.content
      : typeof result.raw_content === "string"
        ? result.raw_content
        : "";
  const published =
    typeof result.published_date === "string"
      ? result.published_date
      : typeof result.publishedDate === "string"
        ? result.publishedDate
        : undefined;

  return {
    title,
    url,
    source: sourceFromUrl(url),
    snippet: content.trim(),
    publishedAt: published,
    score: typeof result.score === "number" ? result.score : undefined,
    query
  };
}

function dedupeByUrl(articles: ArticleCandidate[]): ArticleCandidate[] {
  const seen = new Set<string>();
  const unique: ArticleCandidate[] = [];

  for (const article of articles) {
    const key = article.url.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(article);
  }

  return unique;
}
