import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ArticleCandidate, PublishState } from "./types.js";

const trackingParams = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "spm",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term"
]);

export function canonicalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  for (const key of [...url.searchParams.keys()]) {
    if (trackingParams.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }

  let output = url.toString();
  if (url.search === "" && output.endsWith("/")) {
    output = output.slice(0, -1);
  }
  return output;
}

export function filterFreshArticles(
  articles: ArticleCandidate[],
  state: PublishState,
  limit: number
): ArticleCandidate[] {
  const selected: ArticleCandidate[] = [];
  const knownUrls = new Set(state.published.map((item) => canonicalizeUrl(item.url)));
  const knownTitles = state.published.map((item) => item.title);

  for (const article of articles) {
    const url = canonicalizeUrl(article.url);
    const titlesToCompare = [...knownTitles, ...selected.map((item) => item.title)];

    if (knownUrls.has(url)) {
      continue;
    }
    if (titlesToCompare.some((title) => areTitlesSimilar(title, article.title))) {
      continue;
    }
    if (selected.some((item) => canonicalizeUrl(item.url) === url)) {
      continue;
    }

    selected.push(article);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

export function markPublished(
  state: PublishState,
  articles: ArticleCandidate[],
  now: Date = new Date()
): PublishState {
  return {
    lastPublishedDate: publishDateKey(now),
    published: [
      ...state.published,
      ...articles.map((article) => ({
        url: article.url,
        title: article.title,
        publishedAt: now.toISOString()
      }))
    ]
  };
}

export function pruneState(
  state: PublishState,
  now: Date = new Date(),
  maxAgeDays = 14
): PublishState {
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return {
    lastPublishedDate: state.lastPublishedDate,
    published: state.published.filter((item) => Date.parse(item.publishedAt) >= cutoff)
  };
}

export function hasPublishedDigestToday(
  state: PublishState,
  now: Date = new Date()
): boolean {
  return state.lastPublishedDate === publishDateKey(now);
}

export async function loadState(filePath: string): Promise<PublishState> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PublishState>;
    return {
      lastPublishedDate:
        typeof parsed.lastPublishedDate === "string"
          ? parsed.lastPublishedDate
          : undefined,
      published: Array.isArray(parsed.published) ? parsed.published : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { published: [] };
    }
    throw error;
  }
}

function publishDateKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function saveState(filePath: string, state: PublishState): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function areTitlesSimilar(a: string, b: string, threshold = 0.88): boolean {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }

  const distance = levenshtein(left, right);
  const ratio = 1 - distance / Math.max(left.length, right.length);
  return ratio >= threshold;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}
