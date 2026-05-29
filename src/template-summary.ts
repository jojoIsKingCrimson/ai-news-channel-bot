import type { ArticleCandidate, Digest } from "./types.js";
import { firstUsefulSentence } from "./text-cleanup.js";

interface TemplateSummaryOptions {
  itemLimit: number;
  now?: Date;
}

export function summarizeTemplateDigest(
  articles: ArticleCandidate[],
  options: TemplateSummaryOptions
): Digest {
  const now = options.now ?? new Date();
  const items = articles.slice(0, options.itemLimit).map((article) => ({
    title: article.title,
    source: article.source,
    url: article.url,
    summary: article.snippet
      ? firstUsefulSentence(article.snippet, 120)
      : "该来源未提供摘要，请阅读全文了解细节。",
    impact: "已保留原始来源摘要；建议阅读全文确认细节。"
  }));

  return {
    date: now.toISOString().slice(0, 10),
    headline: `今日基于 RSS/搜索结果整理 ${items.length} 条 AI 产品与行业动态。`,
    items
  };
}
