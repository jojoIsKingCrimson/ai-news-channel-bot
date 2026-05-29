import { XMLParser } from "fast-xml-parser";
import type { GithubTrendingRepo, ProductHuntLaunch } from "./types.js";
import { cleanSourceText } from "./text-cleanup.js";

type FetchLike = typeof fetch;

export interface TrendCollectOptions {
  fetchImpl?: FetchLike;
  now?: Date;
  itemLimit: number;
}

export interface PulseTrends {
  productHunt: ProductHuntLaunch[];
  githubTrending: GithubTrendingRepo[];
}

export async function collectPulseTrends(
  options: TrendCollectOptions
): Promise<PulseTrends> {
  const [productHunt, githubTrending] = await Promise.all([
    collectProductHuntLaunches(options),
    collectGithubTrending(options)
  ]);

  return { productHunt, githubTrending };
}

export async function collectProductHuntLaunches(
  options: TrendCollectOptions
): Promise<ProductHuntLaunch[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://www.producthunt.com/feed", {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" }
  });

  if (!response.ok) {
    return [];
  }

  return parseProductHuntFeed(await response.text(), options.itemLimit);
}

export async function collectGithubTrending(
  options: TrendCollectOptions
): Promise<GithubTrendingRepo[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://github.com/trending?since=daily");

  if (!response.ok) {
    return [];
  }

  return parseGithubTrendingHtml(await response.text(), options.itemLimit);
}

function parseProductHuntFeed(xml: string, limit: number): ProductHuntLaunch[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text"
  });
  const parsed = parser.parse(xml) as unknown;
  const items = extractProductHuntItems(parsed);
  const launches: ProductHuntLaunch[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (launches.length >= limit || !isRecord(item)) {
      continue;
    }

    const url = textValue(item.link);
    const name = textValue(item.title);
    if (!url || !name || seen.has(url)) {
      continue;
    }
    seen.add(url);

    const description =
      textValue(item.description) || textValue(item.summary) || textValue(item.content);

    launches.push({
      name,
      url,
      ...(description
        ? {
            tagline: cleanSourceText(stripHtml(description))
          }
        : {})
    });
  }

  return launches;
}

function extractProductHuntItems(parsed: unknown): unknown[] {
  if (!isRecord(parsed)) {
    return [];
  }

  if (isRecord(parsed.rss) && isRecord(parsed.rss.channel)) {
    const item = parsed.rss.channel.item;
    return Array.isArray(item) ? item : item ? [item] : [];
  }

  if (isRecord(parsed.feed)) {
    const entry = parsed.feed.entry;
    return Array.isArray(entry) ? entry : entry ? [entry] : [];
  }

  return [];
}

function parseGithubTrendingHtml(html: string, limit: number): GithubTrendingRepo[] {
  return splitArticles(html)
    .map(parseGithubArticle)
    .filter((repo): repo is GithubTrendingRepo => repo !== null)
    .slice(0, limit);
}

function splitArticles(html: string): string[] {
  const matches = html.match(/<article\b[\s\S]*?<\/article>/gi);
  return matches ?? [];
}

function parseGithubArticle(article: string): GithubTrendingRepo | null {
  const repoMatch = article.match(/<h2[\s\S]*?<a\b[^>]*href=["']\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!repoMatch) {
    return null;
  }

  const repository = normalizeWhitespace(stripHtml(repoMatch[2])).replace(/\s*\/\s*/, "/");
  const descriptionMatch = article.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
  const languageMatch = article.match(/itemprop=["']programmingLanguage["'][^>]*>([\s\S]*?)<\/span>/i);
  const starsTodayMatch = article.match(/([\d,]+)\s+stars?\s+today/i);
  const stargazersMatch = article.match(/href=["']\/[^"']+\/stargazers["'][^>]*>([\s\S]*?)<\/a>/i);

  return {
    repository,
    url: `https://github.com/${repoMatch[1]}`,
    ...(descriptionMatch ? { description: normalizeWhitespace(stripHtml(descriptionMatch[1])) } : {}),
    ...(languageMatch ? { language: normalizeWhitespace(stripHtml(languageMatch[1])) } : {}),
    ...(stargazersMatch ? { stars: normalizeWhitespace(stripHtml(stargazersMatch[1])) } : {}),
    ...(starsTodayMatch ? { starsToday: starsTodayMatch[1] } : {})
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    const alternate = value.find(
      (item) => isRecord(item) && (!item["@_rel"] || item["@_rel"] === "alternate")
    );
    return textValue(alternate ?? value[0]);
  }
  if (isRecord(value) && typeof value["@_href"] === "string") {
    return value["@_href"].trim();
  }
  if (isRecord(value) && typeof value["#text"] === "string") {
    return value["#text"].trim();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
