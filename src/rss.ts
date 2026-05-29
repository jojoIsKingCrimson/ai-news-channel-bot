import { XMLParser } from "fast-xml-parser";
import { sourceFromUrl } from "./collect.js";
import type { ArticleCandidate } from "./types.js";

type FetchLike = typeof fetch;

interface RssCollectOptions {
  feedUrls: string[];
  fetchImpl?: FetchLike;
  now?: Date;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text"
});

export async function collectRssNews(
  options: RssCollectOptions
): Promise<ArticleCandidate[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const articles: ArticleCandidate[] = [];

  for (const feedUrl of options.feedUrls) {
    const response = await fetchImpl(feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml"
      }
    });

    if (!response.ok) {
      continue;
    }

    const xml = await response.text();
    const parsed = parser.parse(xml) as unknown;
    const entries = extractEntries(parsed);

    for (const entry of entries) {
      const article = normalizeFeedEntry(entry, feedUrl);
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

function extractEntries(parsed: unknown): unknown[] {
  if (!isRecord(parsed)) {
    return [];
  }

  const rss = parsed.rss;
  if (isRecord(rss) && isRecord(rss.channel)) {
    return asArray(rss.channel.item);
  }

  const feed = parsed.feed;
  if (isRecord(feed)) {
    return asArray(feed.entry);
  }

  return [];
}

function normalizeFeedEntry(entry: unknown, feedUrl: string): ArticleCandidate | null {
  if (!isRecord(entry)) {
    return null;
  }

  const title = textValue(entry.title).trim();
  const url = linkValue(entry.link).trim();
  const snippet = stripHtml(
    textValue(entry.description) ||
      textValue(entry.summary) ||
      textValue(entry.content) ||
      textValue(entry["content:encoded"])
  ).trim();
  const publishedText =
    textValue(entry.pubDate) ||
    textValue(entry.published) ||
    textValue(entry.updated) ||
    textValue(entry.date);
  const publishedAt = publishedText ? new Date(publishedText).toISOString() : undefined;

  if (!title || !url) {
    return null;
  }

  return {
    title,
    url,
    source: sourceFromUrl(url),
    snippet,
    publishedAt,
    query: `rss:${feedUrl}`
  };
}

function linkValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const alternate = value.find(
      (item) => isRecord(item) && (!item["@_rel"] || item["@_rel"] === "alternate")
    );
    return linkValue(alternate ?? value[0]);
  }
  if (isRecord(value)) {
    if (typeof value["@_href"] === "string") {
      return value["@_href"];
    }
    return textValue(value);
  }
  return "";
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (isRecord(value) && typeof value["#text"] === "string") {
    return value["#text"];
  }
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value === undefined ? [] : [value];
}

function dedupeByUrl(articles: ArticleCandidate[]): ArticleCandidate[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
